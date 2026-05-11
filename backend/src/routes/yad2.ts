import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';
import { processPropertyImage } from '../lib/imageVariants.js';
import { crawlAgency, crawlSingleListing, mapSectionToAssetClass, type Yad2Listing } from '../lib/yad2-crawler.js';
import { normalizeAddress } from '../lib/addressNormalize.js';
import { assertRehostUrlSafe } from '../lib/rehostGuards.js';

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
const YAD2_QUOTA_LIMIT_DEFAULT = 3;
const YAD2_QUOTA_WINDOW_MS = 60 * 60 * 1000;

// Platform-owner emails get a much higher cap so internal QA isn't
// blocked by the 3/hour residential cap. Mirrors the ADMIN_EMAILS
// allowlist used in routes/chat.ts and frontend Layout.jsx — keeping
// it inline here so this file doesn't pick up a cross-route import.
const YAD2_ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);
const YAD2_QUOTA_LIMIT_ADMIN = 50;

async function quotaLimitFor(agentId: string): Promise<number> {
  const u = await prisma.user.findUnique({
    where: { id: agentId },
    select: { email: true },
  });
  if (u?.email && YAD2_ADMIN_EMAILS.has(u.email.toLowerCase())) {
    return YAD2_QUOTA_LIMIT_ADMIN;
  }
  return YAD2_QUOTA_LIMIT_DEFAULT;
}

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
  const limit = await quotaLimitFor(agentId);
  const attempts = await prisma.yad2ImportAttempt.findMany({
    where: { agentId, attemptedAt: { gt: since } },
    orderBy: { attemptedAt: 'asc' },
    select: { attemptedAt: true },
    take: limit + 1, // +1 so we know if the bucket is over
  });
  const used = attempts.length;
  const remaining = Math.max(0, limit - used);
  // Reset = the moment the OLDEST attempt falls out of the window.
  // Only meaningful when the agent has hit the cap.
  const oldest = attempts[0]?.attemptedAt;
  const resetAtMs = oldest ? oldest.getTime() + YAD2_QUOTA_WINDOW_MS : 0;
  const msUntilReset = remaining === 0 ? Math.max(0, resetAtMs - Date.now()) : 0;
  return {
    limit,
    remaining,
    used,
    resetAt: remaining === 0 ? new Date(resetAtMs).toISOString() : null,
    msUntilReset,
  };
}

// Atomic check-and-insert: prevents the TOCTOU where two concurrent
// requests both see remaining > 0 and both insert, blowing past the
// rolling cap. Postgres advisory lock keyed on hashtext(agentId)
// serializes the read+write within a transaction so concurrent
// requests for the same agent queue behind each other; different
// agents don't contend.
async function tryReserveYad2Quota(
  agentId: string,
): Promise<{ reserved: boolean; quota: QuotaSnapshot }> {
  const limit = await quotaLimitFor(agentId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      agentId,
    );
    const since = new Date(Date.now() - YAD2_QUOTA_WINDOW_MS);
    const attempts = await tx.yad2ImportAttempt.findMany({
      where: { agentId, attemptedAt: { gt: since } },
      orderBy: { attemptedAt: 'asc' },
      select: { attemptedAt: true },
      take: limit + 1,
    });
    const used = attempts.length;
    const oldest = attempts[0]?.attemptedAt;
    const resetAtMs = oldest ? oldest.getTime() + YAD2_QUOTA_WINDOW_MS : 0;
    if (used >= limit) {
      const msUntilReset = Math.max(0, resetAtMs - Date.now());
      return {
        reserved: false,
        quota: {
          limit,
          used,
          remaining: 0,
          resetAt: new Date(resetAtMs).toISOString(),
          msUntilReset,
        },
      };
    }
    await tx.yad2ImportAttempt.create({ data: { agentId } });
    // Self-cleanup so the table doesn't grow unbounded. Best-effort,
    // fire-and-forget outside the transaction; a stray row is harmless
    // because the read above filters by the window.
    prisma.yad2ImportAttempt.deleteMany({
      where: { agentId, attemptedAt: { lt: since } },
    }).catch(() => { /* ignore */ });
    const usedAfter = used + 1;
    const remaining = limit - usedAfter;
    return {
      reserved: true,
      quota: {
        limit,
        used: usedAfter,
        remaining,
        resetAt: remaining === 0 ? new Date(resetAtMs).toISOString() : null,
        msUntilReset: remaining === 0 ? Math.max(0, resetAtMs - Date.now()) : 0,
      },
    };
  });
}

// Refund the most recently-reserved quota slot. Called when a crawl
// fails for reasons that are NOT the agent's fault — bad agency URL
// (404 from Yad2), WAF challenge we can't pass, network timeout, or
// any envelope status >= 422 from the crawler. The original reserve
// is intentionally up-front (so two concurrent imports can't race
// past the limit) but billing the agent for an outcome they couldn't
// influence is bad UX. We delete the most recent attempt row for this
// agent inside the same advisory lock so a concurrent reserve can't
// see a refund mid-flight.
async function refundYad2Quota(agentId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        agentId,
      );
      const latest = await tx.yad2ImportAttempt.findFirst({
        where: { agentId },
        orderBy: { attemptedAt: 'desc' },
        select: { id: true },
      });
      if (latest) {
        await tx.yad2ImportAttempt.delete({ where: { id: latest.id } });
      }
    });
  } catch {
    // Best-effort; if refund fails the agent loses a slot but the
    // window resets in <=1h. Don't let it mask the underlying error.
  }
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

// ── Async job queue ───────────────────────────────────────────────
// Cloudflare's edge has a 100s hard cap on HTTP requests; a Yad2
// agency crawl routinely runs longer. Rather than die at the CF
// edge with a "Failed to fetch" (which surfaced to agents as
// "אין חיבור לשרת"), the /agency/* endpoints return a jobId
// immediately and the client polls /jobs/:id for the result.
//
// In-memory is fine for a single-container deploy: a restart loses
// in-flight crawls but (a) the client will time out and let the user
// retry, and (b) the cost is just one wasted quota slot. Jobs are
// GC'd 30min after completion so the map can't grow unbounded.
type Yad2JobKind = 'agency-preview' | 'agency-import';
// Progress report surfaced via /jobs/:id so the frontend bar can show
// the real stage instead of a client-side time estimate. `pct` is
// monotonic 0..100 — the runner bumps it at the start of each stage
// and again when the stage finishes.
export interface Yad2JobProgress {
  pct: number;          // 0..100
  stage: string;        // Hebrew label, shown verbatim
  page?: number;        // optional — current page within the stage
  totalPages?: number;  // optional — if the scraper knows it
}
interface Yad2Job {
  id: string;
  kind: Yad2JobKind;
  agentId: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  progress?: Yad2JobProgress;
  // Hebrew-friendly error envelope — mirrors what the sync endpoints
  // used to return so the frontend can render it verbatim.
  error?: { message: string; code?: string; status?: number; quota?: QuotaSnapshot };
}

const jobs = new Map<string, Yad2Job>();
const JOB_TTL_MS = 30 * 60 * 1000;

// Periodic GC — unref'd so it doesn't pin the process open in tests.
const jobGcTimer = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    const stamp = j.finishedAt ?? j.startedAt;
    if (stamp < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);
jobGcTimer.unref?.();

// Reporter handed to the runner so it can emit progress as it
// traverses sale → rent → commercial. Runner calls `report({ pct,
// stage })` at each stage boundary; /jobs/:id surfaces the latest
// snapshot verbatim.
export type Yad2ProgressReport = (p: Yad2JobProgress) => void;

function startJob(
  kind: Yad2JobKind,
  agentId: string,
  run: (report: Yad2ProgressReport) => Promise<unknown>,
): Yad2Job {
  const job: Yad2Job = {
    id: randomUUID(),
    kind,
    agentId,
    status: 'running',
    startedAt: Date.now(),
    progress: { pct: 0, stage: 'מכין סריקה' },
  };
  jobs.set(job.id, job);
  const report: Yad2ProgressReport = (p) => {
    // Monotonic — a slow stage update after a faster one shouldn't
    // regress the bar.
    const prev = job.progress?.pct ?? 0;
    job.progress = { ...p, pct: Math.max(prev, Math.min(100, p.pct)) };
  };
  // Fire-and-forget — the client polls /jobs/:id for the outcome.
  Promise.resolve().then(async () => {
    try {
      const out = await run(report);
      job.result = out;
      job.status = 'done';
      job.progress = { pct: 100, stage: 'הושלם' };
    } catch (err: any) {
      // Preserve any structured error envelope thrown by the runner so
      // the client still gets the right Hebrew message + quota chip.
      if (err && typeof err === 'object' && err.__yad2Envelope) {
        job.error = err.__yad2Envelope;
      } else {
        job.error = { message: err?.message || 'שגיאה לא צפויה', status: 500 };
      }
      job.status = 'error';
    } finally {
      job.finishedAt = Date.now();
    }
  });
  return job;
}

// Helper to throw a structured envelope from inside a job runner so
// startJob() can surface it verbatim via /jobs/:id.
function throwYad2Envelope(envelope: Yad2Job['error']): never {
  const err: any = new Error(envelope?.message || 'שגיאה');
  err.__yad2Envelope = envelope;
  throw err;
}

export const registerYad2Routes: FastifyPluginAsync = async (app) => {
  if (!yad2FeatureEnabled()) {
    const stub = async (_req: any, reply: any) =>
      reply.code(404).send({ error: { message: 'Yad2 import not enabled in this environment' } });
    app.post('/preview',                stub);
    app.post('/import',                 stub);
    app.post('/agency/preview',         stub);
    app.post('/agency/import',          stub);
    app.post('/agency/preview/start',   stub);
    app.post('/agency/import/start',    stub);
    app.get ('/jobs/:id',               stub);
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
      const reservation = await tryReserveYad2Quota(u.id);
      if (!reservation.reserved) return quotaExceededReply(reply, reservation.quota);
      try {
        const report = await crawlAgency(agencyId);
        // Empty result = bad URL / agency-doesn't-exist; refund the slot.
        if (report.listings.length === 0) {
          await refundYad2Quota(u.id);
          const quotaAfter = await getYad2Quota(u.id);
          return reply.code(422).send({ error: { message: 'לא נמצאו נכסים בסוכנות זו — בדוק את הקישור', quota: quotaAfter } });
        }
        return { listings: report.listings, agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone }, sections: report.sections, truncated: report.truncated, quota: reservation.quota };
      } catch (err) {
        await refundYad2Quota(u.id);
        throw err;
      }
    }
    return reply.code(400).send({ error: { message: 'נא להדביק כתובת של דף סוכנות (yad2.co.il/realestate/agency/...)' } });
  });

  // ── Single-listing preview + import ──────────────────────────────
  // 2026-05-11 — "ייבא נכס ספציפי" entry point. Accepts a
  // yad2.co.il/realestate/item/<token> URL, scrapes that one row, and
  // returns the normalised listing. The frontend then either bins it
  // or POSTs it back to /single/import to create a Property.
  //
  // Costs 1 quota slot per preview (same as agency preview); we
  // refund on empty result so a bad URL doesn't burn the agent's
  // quota.
  const SingleQ = z.object({
    url: z.string().refine(
      (u) => /\/realestate\/item\/[A-Za-z0-9_-]+/.test(u) || /^[A-Za-z0-9_-]{4,}$/.test(u),
      { message: 'יש להזין קישור של נכס בודד (yad2.co.il/realestate/item/...)' },
    ),
  });
  app.post('/single/preview', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = SingleQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: parsed.error.errors[0]?.message || 'קישור לא תקין' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const reservation = await tryReserveYad2Quota(u.id);
    if (!reservation.reserved) return quotaExceededReply(reply, reservation.quota);
    try {
      const listing = await crawlSingleListing(parsed.data.url);
      if (!listing) {
        await refundYad2Quota(u.id);
        const quotaAfter = await getYad2Quota(u.id);
        return reply.code(422).send({
          error: { message: 'לא הצלחתי למשוך פרטים מהקישור — ייתכן שהמודעה הוסרה או שיש לבדוק את הקישור', quota: quotaAfter },
        });
      }
      const alreadyImported = await findAlreadyImported(u.id, [listing.sourceId]);
      return {
        listing,
        alreadyImported,
        quota: reservation.quota,
      };
    } catch (err) {
      await refundYad2Quota(u.id);
      throw err;
    }
  });

  // Persist a single previewed listing as a Property row. Reuses
  // runAgencyImport so cover image rehosting, [yad2:<token>] idempotency
  // and address normalisation match the agency-bulk path exactly.
  app.post('/single/import', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const parsed = ImportListingZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: parsed.error.errors[0]?.message || 'נתונים לא תקינים' } });
    }
    // runAgencyImport is declared inside this registerYad2Routes closure
    // and accepts an array. We just pass a one-element list.
    const result = await runAgencyImport([parsed.data], u.id, req.log);
    return result;
  });

  // ── Agency-wide preview ──────────────────────────────────────────
  // Shared runner used by BOTH the legacy sync endpoint and the new
  // async /agency/preview/start flow. The sync path still exists for
  // integration tests; prod traffic goes through the job queue so
  // Cloudflare's 100s edge timeout can't kill the long crawl.
  async function runAgencyPreview(
    agencyId: string,
    agentId: string,
    log: any,
    onProgress?: (p: Yad2JobProgress) => void,
  ) {
    const report = await crawlAgency(agencyId, onProgress
      ? (e) => onProgress({ pct: e.pct, stage: e.stage })
      : undefined);
    if (report.listings.length === 0) {
      const blocked = report.sections.find((s) => s.error?.includes('אימות-בוט'));
      const sectionErr = report.sections.find((s) => s.error)?.error;
      log.warn({ agencyId, sections: report.sections }, blocked ? 'yad2 WAF blocked' : 'yad2 returned 0 listings');
      throwYad2Envelope({
        status: blocked ? 503 : 422,
        message: sectionErr || 'לא נמצאו נכסים בסוכנות זו — בדוק את הקישור או נסה שוב מאוחר יותר',
      });
    }
    const alreadyImported = await findAlreadyImported(agentId, report.listings.map((l) => l.sourceId));
    const quotaAfter = await getYad2Quota(agentId);
    return {
      listings: report.listings,
      agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone },
      sections: report.sections,
      truncated: report.truncated,
      alreadyImported,
      quota: quotaAfter,
    };
  }

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
    // The reserve is atomic so two concurrent requests can't both pass.
    // 2026-05-03 — refund the slot if the crawl fails for reasons that
    // are NOT the agent's fault (bad agency URL → 422 envelope, WAF
    // block → 503 envelope, timeout → 504). Original anti-abuse intent
    // is preserved because successful and rate-limited paths still bill.
    const reservation = await tryReserveYad2Quota(u.id);
    if (!reservation.reserved) return quotaExceededReply(reply, reservation.quota);
    try {
      return await runAgencyPreview(agencyId, u.id, req.log);
    } catch (err: any) {
      if (err?.__yad2Envelope) {
        await refundYad2Quota(u.id);
        const env = err.__yad2Envelope;
        const refunded = await getYad2Quota(u.id);
        return reply.code(env.status || 500).send({ error: { ...env, quota: refunded } });
      }
      req.log.warn({ err, agencyId }, 'yad2 agency crawl threw');
      await refundYad2Quota(u.id);
      const quotaAfter = await getYad2Quota(u.id);
      return reply.code(504).send({ error: { message: 'הסוכנות לא הגיבה — נסה שוב', quota: quotaAfter } });
    }
  });

  // ── Async agency preview (jobId-based) ────────────────────────────
  // Responds in <100ms with a jobId — caller polls /jobs/:id. Designed
  // to dodge the Cloudflare 100s edge timeout on the long crawl.
  app.post('/agency/preview/start', { onRequest: [app.requireAuth] }, async (req, reply) => {
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
    const reservation = await tryReserveYad2Quota(u.id);
    if (!reservation.reserved) return quotaExceededReply(reply, reservation.quota);
    const log = req.log;
    const job = startJob('agency-preview', u.id, async (report) => {
      try {
        // Real per-page progress — the crawler now emits
        // CrawlProgressEvents for each section page + each detail
        // fetch, and we forward them to the job's reporter (which
        // is monotonic, so out-of-order ticks won't regress the bar).
        report({ pct: 2, stage: 'מכין סריקה' });
        return await runAgencyPreview(agencyId, u.id, log, report);
      } catch (err: any) {
        // 2026-05-03 — refund the quota slot on any not-our-fault
        // failure (envelope from upstream OR thrown error). Quota was
        // reserved up-front to defeat retry-the-limit-away abuse, but
        // billing the agent for a 422/503/504 they couldn't influence
        // is bad UX.
        await refundYad2Quota(u.id);
        if (err?.__yad2Envelope) {
          const refunded = await getYad2Quota(u.id);
          err.__yad2Envelope = { ...err.__yad2Envelope, quota: refunded };
          throw err;
        }
        log.warn({ err, agencyId }, 'yad2 agency crawl threw (async)');
        const quotaAfter = await getYad2Quota(u.id);
        throwYad2Envelope({ status: 504, message: 'הסוכנות לא הגיבה — נסה שוב', quota: quotaAfter });
      }
    });
    return reply.code(202).send({ jobId: job.id });
  });

  // ── Agency import — server-side image re-host ────────────────────
  async function runAgencyImport(
    listings: z.infer<typeof ImportQ>['listings'],
    agentId: string,
    log: any,
  ) {
    const existingMap = await findAlreadyImported(agentId, listings.map((l) => l.sourceId));
    const existingSet = new Set<string>(Object.keys(existingMap));

    const created: { sourceId: string; id: string }[] = [];
    const skipped: { sourceId: string; reason: string }[] = [];
    const failed:  { sourceId: string; reason: string }[] = [];

    for (const l of listings) {
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

        // Snap Yad2's raw street/city strings to the government
        // registry's canonical spellings so rows from different
        // agencies stay comparable. If the registry doesn't recognize
        // the value (rare neighborhoods, new developments), keep
        // Yad2's original rather than writing '—' and losing the signal.
        const addr = normalizeAddress({ city: l.city, street: l.street });
        const property = await prisma.property.create({
          data: {
            agentId,
            assetClass: map.assetClass,
            category: map.category,
            type: l.type || 'דירה',
            street: addr.street ?? l.street ?? '',
            city:   addr.city   ?? l.city   ?? '',
            owner: 'בעלים מ-Yad2',
            ownerPhone: '',
            marketingPrice: l.price ?? 0,
            sqm: l.sqm ?? 0,
            rooms: l.rooms ?? null,
            floor: l.floor ?? null,
            notes: noteParts.join('\n'),
          },
        });

        const sourceUrls = uniqueOrdered(
          (l.images && l.images.length ? l.images : []).concat(l.coverImage ? [l.coverImage] : [])
        );
        for (let i = 0; i < sourceUrls.length; i++) {
          const src = sourceUrls[i];
          try {
            const { url, urlCard, urlThumb } = await rehostImage(src, property.id);
            await prisma.propertyImage.create({
              data: { propertyId: property.id, url, urlCard, urlThumb, sortOrder: i },
            });
          } catch (imgErr: any) {
            log.warn({ err: imgErr, propertyId: property.id, src }, 'yad2 image rehost failed');
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
  }

  app.post('/agency/import', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = ImportQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid import payload' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    return await runAgencyImport(parsed.data.listings, u.id, req.log);
  });

  // ── Async agency import (jobId-based) ─────────────────────────────
  app.post('/agency/import/start', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = ImportQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid import payload' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const listings = parsed.data.listings;
    const log = req.log;
    const job = startJob('agency-import', u.id, async (report) => {
      report({ pct: 10, stage: 'מאחסן תמונות' });
      const result = await runAgencyImport(listings, u.id, log);
      report({ pct: 95, stage: 'שומר במסד הנתונים' });
      return result;
    });
    return reply.code(202).send({ jobId: job.id });
  });

  // ── Job status — shared by /agency/preview/start + /agency/import/start
  app.get('/jobs/:id', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const { id } = req.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: { message: 'Job not found or expired' } });
    if (job.agentId !== u.id) return reply.code(403).send({ error: { message: 'Forbidden' } });
    // Explicit no-store so neither the browser disk cache nor any
    // intermediary (CloudFront, nginx, corporate proxies) returns a
    // stale snapshot during the 1-2 s polling cadence. The frontend
    // also cache-busts via `?_t=`; this is belt-and-braces.
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    // The caller sees { status, result?, error?, progress? } — same
    // envelope for both job kinds so the client can reuse one polling
    // helper. `progress` is present while the job is running so the
    // Yad2Import page can show a real bar instead of a client estimate.
    const body: any = { status: job.status, kind: job.kind, startedAt: job.startedAt };
    if (job.finishedAt) body.finishedAt = job.finishedAt;
    if (job.progress) body.progress = job.progress;
    if (job.status === 'done')  body.result = job.result;
    if (job.status === 'error') body.error  = job.error;
    return body;
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
        const addr = normalizeAddress({ city: l.city, street: l.street });
        const property = await prisma.property.create({
          data: {
            agentId: u.id,
            assetClass: 'RESIDENTIAL',
            category: 'SALE',
            type: 'דירה',
            street: addr.street ?? l.street,
            city:   addr.city   ?? l.city,
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
// Downloads the Yad2 image bytes and runs them through the same
// `processPropertyImage` variant pipeline agent uploads use, so each
// import lands with thumb (256 px) + card (768 px) + full (2400 px)
// JPEGs already in S3. List pages then paint from the 256 px thumb
// instead of the raw 50–100 KB original.
//
// Bug history: the first version wrote with fs.writeFile to UPLOADS_DIR
// directly. On production (S3) that put the bytes on the ephemeral
// container disk while the /uploads/<key> route looked them up in S3 —
// every Yad2-imported property displayed an unresolvable photo URL.
// SEC-006 — cap re-host body at 10MB. Yad2 image CDN serves originals
// in the 100s-of-KB range, so anything beyond this is suspect (and would
// gum up the EC2 root filesystem on its way through). We verify against
// the Content-Length header here; an attacker who omits the header could
// in principle stream more bytes, but `await r.arrayBuffer()` will still
// OOM the container before delivering them anywhere — the gap is
// tracked rather than fixed because the fetch host is now allowlisted
// to Yad2's CDN, which always sets Content-Length.
const REHOST_MAX_BYTES = 10 * 1024 * 1024;

async function rehostImage(
  srcUrl: string,
  propertyId: string,
): Promise<{ url: string; urlCard: string; urlThumb: string }> {
  // SEC-006 — refuse anything that isn't a Yad2 CDN https URL up-front,
  // before the fetch is even issued. Throws on the SSRF cases (private
  // IP, loopback, AWS metadata endpoint, non-https, off-allowlist host).
  assertRehostUrlSafe(srcUrl);

  // `redirect: 'manual'` so we can re-validate the Location target
  // against the same allowlist instead of letting the runtime follow a
  // 302 → 169.254.169.254 silently. The Yad2 CDN does occasionally 301
  // (uppercase → lowercase path), so we follow ONE hop after re-guard.
  let r = await fetch(srcUrl, {
    redirect: 'manual',
    headers: {
      // Yad2 image CDN doesn't enforce referrer or UA but be consistent.
      'User-Agent': 'EstiaImporter/1.0 (https://estia.co.il)',
      'Accept': 'image/jpeg,image/png,image/webp,*/*;q=0.5',
    },
  });
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('location');
    if (!loc) throw new Error(`image fetch ${r.status} (no Location)`);
    // Resolve relative redirects against the source URL so a Location
    // of "/Pic/foo.jpg" still gets validated as the full origin.
    const next = new URL(loc, srcUrl).toString();
    assertRehostUrlSafe(next);
    r = await fetch(next, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'EstiaImporter/1.0 (https://estia.co.il)',
        'Accept': 'image/jpeg,image/png,image/webp,*/*;q=0.5',
      },
    });
    // Refuse to follow a second hop — Yad2 doesn't chain redirects.
    if (r.status >= 300 && r.status < 400) {
      throw new Error(`image fetch redirect loop`);
    }
  }
  if (!r.ok) throw new Error(`image fetch ${r.status}`);
  const cl = Number(r.headers.get('content-length') || '0');
  if (cl > REHOST_MAX_BYTES) {
    throw new Error(`image too large: ${cl} bytes (max ${REHOST_MAX_BYTES})`);
  }
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) throw new Error(`not an image: ${ct}`);
  const buf = Buffer.from(await r.arrayBuffer());
  // Defence-in-depth: re-check actual byte length in case Content-Length
  // was missing or wrong.
  if (buf.byteLength > REHOST_MAX_BYTES) {
    throw new Error(`image too large: ${buf.byteLength} bytes (max ${REHOST_MAX_BYTES})`);
  }
  // Run the same variant pipeline agent uploads use, so cards land with
  // a 256 px thumb (~10 KB) and a 768 px gallery instead of the raw
  // 50–100 KB Yad2 original. Without this, list pages download the
  // full file just to paint a 360 px slot.
  const { url, urlCard, urlThumb } = await processPropertyImage(
    buf, ct, 'yad2-cover.jpg', propertyId,
  );
  return { url, urlCard, urlThumb };
}
