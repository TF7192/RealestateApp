import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';
import { putUpload } from '../lib/storage.js';
import { crawlAgency, mapSectionToAssetClass, type Yad2Listing } from '../lib/yad2-crawler.js';

/**
 * Yad2 import — agency-wide.
 *
 * Endpoints (all gated by FEATURE_YAD2_IMPORT in env, default off):
 *   POST /preview             — single page (legacy / kept for back-compat)
 *   POST /import              — single-page import (legacy / back-compat)
 *   POST /agency/preview      — full agency crawl across forsale + rent +
 *                                commercial × all pages, returns flat list +
 *                                per-section diagnostics. Polite throttling
 *                                in the crawler.
 *   POST /agency/import       — accept the agreed listing array, create
 *                                Property rows, re-host the cover image
 *                                server-side (downloads img.yad2.co.il →
 *                                /uploads/properties/<id>/yad2-cover.jpg).
 *
 * Idempotency: each created Property carries `[yad2:<token>]` in its
 * notes field; re-import skips if the token is already present in any
 * of the agent's existing properties.
 *
 * Caveats — see routes/yad2.README.md.
 */

// Evaluated per-registration (inside the plugin) rather than at module
// load, so integration tests that set FEATURE_YAD2_IMPORT=true in their
// beforeAll hook before calling build() see the real routes, not the
// 404 stubs.
function yad2FeatureEnabled(): boolean {
  return (process.env.FEATURE_YAD2_IMPORT ?? '').toLowerCase() === 'true';
}

// Old single-page endpoints kept around — agency endpoints are the main
// path going forward but the simpler version is harmless and useful for
// power-users with a non-agency Yad2 URL (e.g. private seller).
const PreviewQ = z.object({
  url: z.string().url().refine(
    (u) => /(^https?:\/\/(www\.)?yad2\.co\.il)/.test(u),
    { message: 'must be a yad2.co.il URL' },
  ),
});

// /agency/preview accepts EITHER an agency URL or a bare agency id
// (purely an ergonomic convenience — the frontend always sends URLs).
const AgencyPreviewQ = z.object({
  url:       z.string().url().optional(),
  agencyId:  z.string().regex(/^\d+$/).optional(),
}).refine((v) => !!v.url || !!v.agencyId, { message: 'url or agencyId required' });

const ImportListingZ = z.object({
  sourceId: z.string().min(1).max(120),
  section:  z.enum(['forsale', 'rent', 'commercial']),
  title: z.string().max(400).optional(),
  street: z.string().max(120),
  city: z.string().max(80),
  region: z.string().max(120).optional(),
  rooms: z.number().nullable().optional(),
  sqm: z.number().nullable().optional(),
  floor: z.number().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  type: z.string().max(60).optional(),
  coverImage: z.string().url().optional(),
  // Full gallery from the detail-page enrichment phase. Up to 40 images
  // is plenty for a residential property; cap stops a malicious or
  // weird payload from spawning a runaway upload job.
  images: z.array(z.string().url()).max(40).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().max(4000).optional(),
});

const ImportQ = z.object({
  listings: z.array(ImportListingZ).min(1).max(100),
});

function extractAgencyId(input: { url?: string; agencyId?: string }): string | null {
  if (input.agencyId) return input.agencyId;
  if (!input.url) return null;
  const m = input.url.match(/\/realestate\/agency\/(\d+)/);
  return m ? m[1] : null;
}

// ── Per-agent quota ──────────────────────────────────────────────
// Sliding window: 3 agency-wide imports per rolling 60 minutes per
// agent. Each Playwright crawl is ~60-120s and runs through Yad2's
// WAF — a soft cap protects both our IP reputation AND a misbehaving
// client that would otherwise re-trigger the crawl in a tight loop.
//
// The window is computed against the OLDEST attempt in the bucket: if
// you've used your 3 and the oldest was 12min ago, you get one slot
// back at +48min. The frontend renders a countdown to that timestamp.
const YAD2_QUOTA_LIMIT = 3;
const YAD2_QUOTA_WINDOW_MS = 60 * 60 * 1000;

interface QuotaSnapshot {
  limit: number;
  remaining: number;
  used: number;
  // Wall-clock ISO time when the next slot becomes available. null
  // when remaining > 0 (no need to wait).
  resetAt: string | null;
  // Convenience for the UI: ms until reset (0 when no wait).
  msUntilReset: number;
}

async function getYad2Quota(agentId: string): Promise<QuotaSnapshot> {
  const since = new Date(Date.now() - YAD2_QUOTA_WINDOW_MS);
  const attempts = await prisma.yad2ImportAttempt.findMany({
    where: { agentId, attemptedAt: { gt: since } },
    orderBy: { attemptedAt: 'asc' },
    select: { attemptedAt: true },
    take: YAD2_QUOTA_LIMIT + 1, // +1 so we know if the bucket is over
  });
  const used = attempts.length;
  const remaining = Math.max(0, YAD2_QUOTA_LIMIT - used);
  // Reset = the moment the OLDEST attempt falls out of the window.
  // Only meaningful when the agent has hit the cap.
  const oldest = attempts[0]?.attemptedAt;
  const resetAtMs = oldest ? oldest.getTime() + YAD2_QUOTA_WINDOW_MS : 0;
  const msUntilReset = remaining === 0 ? Math.max(0, resetAtMs - Date.now()) : 0;
  return {
    limit: YAD2_QUOTA_LIMIT,
    remaining,
    used,
    resetAt: remaining === 0 ? new Date(resetAtMs).toISOString() : null,
    msUntilReset,
  };
}

async function recordYad2Attempt(agentId: string): Promise<void> {
  await prisma.yad2ImportAttempt.create({ data: { agentId } });
  // Self-cleanup so the table never grows past ~3 rows per agent. Done
  // best-effort; a stray row doesn't hurt correctness because getYad2Quota
  // already filters by the window.
  prisma.yad2ImportAttempt.deleteMany({
    where: { agentId, attemptedAt: { lt: new Date(Date.now() - YAD2_QUOTA_WINDOW_MS) } },
  }).catch(() => { /* ignore */ });
}

function quotaExceededReply(reply: any, quota: QuotaSnapshot) {
  const minutesLeft = Math.ceil(quota.msUntilReset / 60_000);
  return reply.code(429).send({
    error: {
      message: `הגעת למכסה השעתית (${quota.limit} ייבואים). מתחדש בעוד ${minutesLeft} דק׳.`,
      code: 'quota_exceeded',
      quota,
    },
  });
}

export const registerYad2Routes: FastifyPluginAsync = async (app) => {
  if (!yad2FeatureEnabled()) {
    const stub = async (_req: any, reply: any) =>
      reply.code(404).send({ error: { message: 'Yad2 import not enabled in this environment' } });
    app.post('/preview',         stub);
    app.post('/import',          stub);
    app.post('/agency/preview',  stub);
    app.post('/agency/import',   stub);
    // /quota is read-only; still stub when disabled so the frontend gets
    // a consistent 404 instead of a hang.
    app.get('/quota',            stub);
    return;
  }

  // ── Quota — read-only snapshot for the UI to render the "X/3 left
  // this hour, resets in Y min" chip on the import screen.
  app.get('/quota', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    return await getYad2Quota(u.id);
  });

  // ── Legacy single-page preview (left intact for back-compat) ──────
  app.post('/preview', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = PreviewQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid Yad2 URL' } });
    }
    const { url } = parsed.data;
    // If this is an agency URL, defer to the agency endpoint.
    const agencyId = extractAgencyId({ url });
    if (agencyId) {
      const u = getUser(req);
      if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
      const quota = await getYad2Quota(u.id);
      if (quota.remaining === 0) return quotaExceededReply(reply, quota);
      await recordYad2Attempt(u.id);
      const report = await crawlAgency(agencyId);
      const after = await getYad2Quota(u.id);
      return { listings: report.listings, agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone }, sections: report.sections, truncated: report.truncated, quota: after };
    }
    return reply.code(400).send({ error: { message: 'נא להדביק כתובת של דף סוכנות (yad2.co.il/realestate/agency/...)' } });
  });

  // ── Agency-wide preview ──────────────────────────────────────────
  app.post('/agency/preview', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = AgencyPreviewQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'נא להדביק כתובת של דף סוכנות (yad2.co.il/realestate/agency/...)' } });
    }
    const agencyId = extractAgencyId(parsed.data);
    if (!agencyId) {
      return reply.code(400).send({ error: { message: 'לא נמצא מזהה סוכנות בכתובת' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    // Quota check BEFORE the expensive crawl. We deliberately count the
    // attempt up-front (not on success) so a flaky Yad2 / WAF burst
    // doesn't let the agent retry their way around the limit.
    const quotaBefore = await getYad2Quota(u.id);
    if (quotaBefore.remaining === 0) return quotaExceededReply(reply, quotaBefore);
    await recordYad2Attempt(u.id);
    try {
      const report = await crawlAgency(agencyId);
      if (report.listings.length === 0) {
        // Distinguish "Yad2 blocked us" from "agency genuinely has no
        // listings". A WAF block leaves an `error` on every section
        // report; we surface the most informative one.
        const blocked = report.sections.find((s) => s.error?.includes('אימות-בוט'));
        const sectionErr = report.sections.find((s) => s.error)?.error;
        req.log.warn({ agencyId, sections: report.sections }, blocked ? 'yad2 WAF blocked' : 'yad2 returned 0 listings');
        return reply.code(blocked ? 503 : 422).send({
          error: {
            message: sectionErr
              || 'לא נמצאו נכסים בסוכנות זו — בדוק את הקישור או נסה שוב מאוחר יותר',
          },
        });
      }
      // Build the alreadyImported map: { sourceId → propertyId } for any
      // listing in this preview that the agent already has in their
      // catalog (matched by the [yad2:<token>] marker in notes). The
      // frontend uses this to mute already-imported rows + link straight
      // to the existing property page.
      const alreadyImported = await findAlreadyImported(u.id, report.listings.map((l) => l.sourceId));
      const quotaAfter = await getYad2Quota(u.id);

      return {
        listings: report.listings,
        agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone },
        sections: report.sections,
        truncated: report.truncated,
        alreadyImported,
        quota: quotaAfter,
      };
    } catch (err: any) {
      req.log.warn({ err, agencyId }, 'yad2 agency crawl threw');
      const quotaAfter = await getYad2Quota(u.id);
      return reply.code(504).send({ error: { message: 'הסוכנות לא הגיבה — נסה שוב', quota: quotaAfter } });
    }
  });

  // ── Agency import — server-side image re-host ────────────────────
  app.post('/agency/import', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = ImportQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid import payload' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });

    // Skip listings the agent already has via the [yad2:<token>] marker
    // in their existing properties' notes. Same helper the preview
    // endpoint uses so the "already imported" surface stays consistent.
    const existingMap = await findAlreadyImported(u.id, parsed.data.listings.map((l) => l.sourceId));
    const existingSet = new Set<string>(Object.keys(existingMap));

    const created: { sourceId: string; id: string }[] = [];
    const skipped: { sourceId: string; reason: string }[] = [];
    const failed:  { sourceId: string; reason: string }[] = [];

    for (const l of parsed.data.listings) {
      if (existingSet.has(l.sourceId)) {
        skipped.push({ sourceId: l.sourceId, reason: 'already_imported' });
        continue;
      }
      try {
        const map = mapSectionToAssetClass(l as Yad2Listing);
        const noteParts = [
          `[yad2:${l.sourceId}]`,
          `https://www.yad2.co.il/realestate/item/${l.sourceId}`,
          l.title ? `כותרת מ-Yad2: ${l.title}` : null,
          l.tags?.length ? `תגיות: ${l.tags.join(' · ')}` : null,
          l.region ? `אזור: ${l.region}` : null,
          l.description || null,
        ].filter(Boolean) as string[];

        const property = await prisma.property.create({
          data: {
            agentId: u.id,
            assetClass: map.assetClass,
            category: map.category,
            type: l.type || 'דירה',
            street: l.street || '—',
            city: l.city || '—',
            owner: 'בעלים מ-Yad2',
            ownerPhone: '',
            marketingPrice: l.price ?? 0,
            sqm: l.sqm ?? 0,
            rooms: l.rooms ?? null,
            floor: l.floor ?? null,
            notes: noteParts.join('\n'),
          },
        });

        // Re-host every image from the detail-page gallery (or just the
        // cover if the detail fetch didn't enrich). Order is preserved
        // so the agent's "cover" stays the cover. Per-image failures
        // fall back to hot-link rather than skipping silently.
        const sourceUrls = uniqueOrdered(
          (l.images && l.images.length ? l.images : []).concat(l.coverImage ? [l.coverImage] : [])
        );
        for (let i = 0; i < sourceUrls.length; i++) {
          const src = sourceUrls[i];
          try {
            const url = await rehostImage(src, property.id);
            await prisma.propertyImage.create({
              data: { propertyId: property.id, url, sortOrder: i },
            });
          } catch (imgErr: any) {
            req.log.warn({ err: imgErr, propertyId: property.id, src }, 'yad2 image rehost failed');
            // Hot-link fallback so the slot isn't lost — better one ugly
            // referrer-less link than a missing photo.
            await prisma.propertyImage.create({
              data: { propertyId: property.id, url: src, sortOrder: i },
            });
          }
        }

        created.push({ sourceId: l.sourceId, id: property.id });
      } catch (err: any) {
        failed.push({ sourceId: l.sourceId, reason: err?.message || 'create_failed' });
      }
    }

    return { created, skipped, failed };
  });

  // ── Legacy single-page import (kept for back-compat) ─────────────
  // Same shape, but no section field. Maps everything to RES+SALE.
  const LegacyImportQ = z.object({
    listings: z.array(z.object({
      sourceId: z.string().min(1).max(120),
      title: z.string().max(400).optional(),
      street: z.string().max(120),
      city: z.string().max(80),
      rooms: z.number().nullable().optional(),
      sqm: z.number().nullable().optional(),
      floor: z.number().nullable().optional(),
      price: z.number().nonnegative().nullable().optional(),
      photos: z.array(z.string().url()).max(40).optional(),
      description: z.string().max(4000).optional(),
    })).min(1).max(50),
  });
  app.post('/import', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = LegacyImportQ.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { message: 'Invalid import payload' } });
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });

    const existingMap = await findAlreadyImported(u.id, parsed.data.listings.map((l) => l.sourceId));
    const existingSet = new Set<string>(Object.keys(existingMap));

    const created: { sourceId: string; id: string }[] = [];
    const skipped: { sourceId: string; reason: string }[] = [];
    const failed:  { sourceId: string; reason: string }[] = [];

    for (const l of parsed.data.listings) {
      if (existingSet.has(l.sourceId)) {
        skipped.push({ sourceId: l.sourceId, reason: 'already_imported' });
        continue;
      }
      try {
        const property = await prisma.property.create({
          data: {
            agentId: u.id,
            assetClass: 'RESIDENTIAL',
            category: 'SALE',
            type: 'דירה',
            street: l.street, city: l.city,
            owner: 'בעלים מ-Yad2', ownerPhone: '',
            marketingPrice: l.price ?? 0,
            sqm: l.sqm ?? 0,
            floor: l.floor ?? null,
            rooms: l.rooms ?? null,
            notes: [`[yad2:${l.sourceId}]`, l.title, l.description].filter(Boolean).join('\n'),
            images: l.photos?.length
              ? { create: l.photos.map((url, i) => ({ url, sortOrder: i })) }
              : undefined,
          },
        });
        created.push({ sourceId: l.sourceId, id: property.id });
      } catch (err: any) {
        failed.push({ sourceId: l.sourceId, reason: err?.message || 'create_failed' });
      }
    }
    return { created, skipped, failed };
  });
};

// De-dupe an array preserving first-occurrence order. Yad2 sometimes
// repeats the cover URL inside the gallery; we don't want it twice.
function uniqueOrdered<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

// Given an agent + list of Yad2 source tokens, returns a {sourceId →
// propertyId} map for every token that's already imported. Used by
// the preview endpoint (to mute already-imported rows + link to the
// existing property) AND by the import endpoint (to skip duplicates).
//
// Match strategy: each imported property carries `[yad2:<token>]` in
// its notes field. Postgres LIKE on notes is fine at this scale —
// an agent typically has tens to low-hundreds of properties.
async function findAlreadyImported(agentId: string, sourceIds: string[]): Promise<Record<string, string>> {
  if (sourceIds.length === 0) return {};
  const props = await prisma.property.findMany({
    where: {
      agentId,
      OR: sourceIds.map((id) => ({ notes: { contains: `[yad2:${id}]` } })),
    },
    select: { id: true, notes: true },
  });
  const out: Record<string, string> = {};
  for (const p of props) {
    if (!p.notes) continue;
    // A property's notes COULD theoretically carry multiple yad2
    // markers (re-import edge case) — match all of them.
    for (const m of p.notes.matchAll(/\[yad2:([^\]]+)\]/g)) {
      const token = m[1];
      // Only keep if this token was in the request set — defensive
      // against unrelated `[yad2:*]` tokens already on the agent's
      // properties.
      if (sourceIds.includes(token)) {
        out[token] = p.id;
      }
    }
  }
  return out;
}

// ── Image re-host helper ─────────────────────────────────────────
// Downloads the Yad2 image bytes and persists them via the storage
// abstraction — putUpload() routes to S3 in production (UPLOADS_BACKEND=s3)
// and to local disk in dev. The returned URL is the same /uploads/<key>
// shape regardless, so /uploads/* serving (S3 redirect or fastifyStatic)
// finds the bytes either way.
//
// Bug history: the first version wrote with fs.writeFile to UPLOADS_DIR
// directly. On production (S3) that put the bytes on the ephemeral
// container disk while the /uploads/<key> route looked them up in S3 —
// every Yad2-imported property displayed an unresolvable photo URL.
async function rehostImage(srcUrl: string, propertyId: string): Promise<string> {
  const r = await fetch(srcUrl, {
    headers: {
      // Yad2 image CDN doesn't enforce referrer or UA but be consistent.
      'User-Agent': 'EstiaImporter/1.0 (https://estia.tripzio.xyz)',
      'Accept': 'image/jpeg,image/png,image/webp,*/*;q=0.5',
    },
  });
  if (!r.ok) throw new Error(`image fetch ${r.status}`);
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) throw new Error(`not an image: ${ct}`);
  const ext =
    ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' :
    ct.includes('png')  ? 'png' :
    ct.includes('webp') ? 'webp' : 'jpg';
  const mime =
    ext === 'png'  ? 'image/png'  :
    ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const buf = Buffer.from(await r.arrayBuffer());
  const key = `properties/${propertyId}/yad2-cover-${randomUUID()}.${ext}`;
  return putUpload(key, buf, mime);
}
