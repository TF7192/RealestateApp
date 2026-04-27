// Purge worker for soft-deleted users.
//
// The privacy policy at /privacy promises that an account marked for
// deletion is permanently removed within 30 days. The historic
// behaviour was to set User.deletedAt and never come back to it —
// rows lived forever. This worker honours the promise.
//
// Cadence: hourly. The threshold is 30d, so an hourly tick is plenty
// — at most a deletion lands ~1h late.
//
// Cleanup chain:
//   1. find users with deletedAt < now - 30d
//   2. for each, list every UploadedFile they own + every PropertyImage /
//      PropertyVideo / agreement PDF and call deleteUpload to remove the
//      S3 object (best-effort; deleteUpload swallows ENOENT).
//   3. prisma.user.delete(...) — Cascade FKs handle the rest of the
//      schema (Property, Lead, Owner, etc all CASCADE on User delete).
//
// Idempotent — safe to run twice if a previous tick was interrupted.

import { prisma } from '../lib/prisma.js';
import { deleteUpload } from '../lib/storage.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * ONE_HOUR_MS;

let timer: NodeJS.Timeout | null = null;

async function purgeOnce(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const stale = await prisma.user.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, email: true },
  });
  if (!stale.length) return;
  for (const u of stale) {
    try {
      const [files, propImages, propVideos] = await Promise.all([
        prisma.uploadedFile.findMany({ where: { ownerId: u.id }, select: { path: true } }),
        prisma.propertyImage.findMany({ where: { property: { agentId: u.id } }, select: { url: true } }),
        prisma.propertyVideo.findMany({ where: { property: { agentId: u.id }, kind: 'upload' }, select: { url: true } }),
      ]);
      // Agreements link to UploadedFile via fileId — those files are
      // already in the `files` set above (UploadedFile is owner-scoped
      // via ownerId). No separate cleanup loop needed.
      const keys: string[] = [];
      for (const f of files) keys.push(f.path);
      for (const i of propImages) {
        const m = (i.url || '').replace(/^\/uploads\//, '');
        if (m && m !== i.url) keys.push(m);
      }
      for (const v of propVideos) {
        const m = (v.url || '').replace(/^\/uploads\//, '');
        if (m && m !== v.url) keys.push(m);
      }
      for (const key of keys) {
        try { await deleteUpload(key); } catch { /* best-effort */ }
      }
      await prisma.user.delete({ where: { id: u.id } });

      console.warn(`[purge-deleted-users] hard-deleted user ${u.id} (${u.email}) + ${keys.length} blobs`);
    } catch (err) {

      console.error('[purge-deleted-users] failed for', u.id, err);
    }
  }
}

export function startPurgeDeletedUsersWorker(): void {
  if (timer) return;
  // Stagger by 90s on boot so this doesn't pile on top of the other
  // start-up DB queries; then run hourly.
  setTimeout(() => {
    purgeOnce().catch(() => {});
    timer = setInterval(() => { purgeOnce().catch(() => {}); }, ONE_HOUR_MS);
  }, 90_000);
}
