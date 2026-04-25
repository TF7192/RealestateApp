// PERF-005 — backfill: regenerate small/medium variants for every
// PropertyImage that landed before the variant pipeline shipped
// (i.e. rows where `urlThumb` and `urlCard` are still null).
//
// What it does, per row:
//   1. Resolve the legacy storage key from `url`. Two forms:
//        • "/uploads/<key>"                  ← legacy backend redirect
//        • "https://<bucket>.s3.<region>...  ← already a public URL
//      Yad2-imported rows hold remote URLs (e.g. images.yad2.co.il)
//      and are skipped — re-fetching from a third party isn't a
//      backfill concern; the variant pipeline only runs on agent
//      uploads.
//   2. GET the bytes from S3 (or local disk in dev).
//   3. Decode + re-emit the three variants via `processPropertyImage`,
//      which uploads them with public-read + immutable cache.
//   4. PATCH the row in place: `url` is replaced with the new public
//      URL (so future fetches skip the backend), `urlCard` and
//      `urlThumb` get the small variants.
//
// Run with:
//   cd backend && npx tsx src/scripts/backfill-image-variants.ts
//
// Re-runnable: rows that already have `urlThumb` are skipped, so
// stopping mid-run and resuming is safe.

import { prisma } from '../lib/prisma.js';
import { processExistingFull } from '../lib/imageVariants.js';
import { getUploadBytes, urlToKey } from '../lib/storage.js';

const BUCKET = process.env.S3_BUCKET || 'estia-prod';
const REGION = process.env.S3_REGION || 'eu-north-1';
const PUBLIC_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

// How many rows to process before logging a progress beat. 50 is small
// enough that an interrupt loses very little work and big enough that
// the log doesn't drown the run.
const BATCH = 50;
// Concurrency — sharp + S3 both release the event loop on await, so
// running multiple rows in parallel cuts wall-clock dramatically. 8
// workers is the sweet spot on a t3.small (2 vCPU): sharp's libvips
// thread pool absorbs the CPU overlap, and S3's per-connection limit
// is far higher. Going higher than 8 starts to hurt due to memory
// pressure on 1 GB instances.
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY || 8);

async function main() {
  const total = await prisma.propertyImage.count({
    where: { urlThumb: null },
  });
  console.log(`[image-variants] ${total} rows to backfill.`);

  let processed = 0;
  let skippedRemote = 0;
  let skippedMissing = 0;
  let failed = 0;

  // Stream rows in batches so we don't load the whole table into
  // memory on a >100k-row catalog. Each row writes back its own
  // PATCH; we don't need a transaction (failures leave the row in its
  // pre-backfill state and the next run picks it up).
  for (;;) {
    const rows = await prisma.propertyImage.findMany({
      where: { urlThumb: null },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (rows.length === 0) break;

    // Parallelise the per-row pipeline. Each row does S3 GET + sharp +
    // 2× S3 PUT + DB PATCH; serial throughput was ~3-5 s/row, which
    // for 372 rows meant ~25 min wall-clock. With 8 concurrent workers
    // sharing the libvips thread pool we get ~3-5× speedup before
    // memory pressure on a t3.small bites.
    const queue = rows.slice();
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const key = resolveStorageKey(row.url);
        if (!key) {
          skippedRemote += 1;
          await markBackfilled(row.id, row.url, null);
          continue;
        }
        const buf = await getUploadBytes(key);
        if (!buf) {
          skippedMissing += 1;
          console.warn(`[image-variants] missing object: ${key}`);
          continue;
        }
        try {
          const v = await processExistingFull(buf, row.propertyId);
          await prisma.propertyImage.update({
            where: { id: row.id },
            data: { url: v.url, urlCard: v.urlCard, urlThumb: v.urlThumb },
          });
          processed += 1;
        } catch (e) {
          failed += 1;
          console.error(`[image-variants] failed on ${row.id}:`, (e as Error)?.message);
        }
      }
    });
    await Promise.all(workers);

    console.log(`[image-variants] +${rows.length} (${processed} ok / ${skippedRemote} remote / ${skippedMissing} missing / ${failed} failed)`);
  }

  console.log(`[image-variants] done. processed=${processed} remote=${skippedRemote} missing=${skippedMissing} failed=${failed}`);
}

/**
 * Map the stored `url` to an S3 key when possible. Three input
 * shapes:
 *   • `/uploads/<key>`                              → returns `<key>`
 *   • `https://<our-bucket>.s3.<region>.../<key>`   → returns `<key>`
 *   • anything else (yad2.co.il, etc.)              → returns null
 */
function resolveStorageKey(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads/')) return urlToKey(url);
  if (url.startsWith(`${PUBLIC_BASE}/uploads/`)) return urlToKey(url);
  return null;
}

/**
 * Mark a remote-only row as backfill-attempted by stamping the
 * existing URL into the variant slots. Lets the next run skip it via
 * the `urlThumb: null` filter without losing the source URL.
 */
async function markBackfilled(id: string, fallback: string, _newUrl: string | null) {
  await prisma.propertyImage.update({
    where: { id },
    data: { urlThumb: fallback, urlCard: fallback },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
