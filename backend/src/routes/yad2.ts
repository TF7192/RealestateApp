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

const FEATURE_FLAG = (process.env.FEATURE_YAD2_IMPORT ?? '').toLowerCase() === 'true';

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

export const registerYad2Routes: FastifyPluginAsync = async (app) => {
  if (!FEATURE_FLAG) {
    const stub = async (_req: any, reply: any) =>
      reply.code(404).send({ error: { message: 'Yad2 import not enabled in this environment' } });
    app.post('/preview',         stub);
    app.post('/import',          stub);
    app.post('/agency/preview',  stub);
    app.post('/agency/import',   stub);
    return;
  }

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
      const report = await crawlAgency(agencyId);
      return { listings: report.listings, agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone }, sections: report.sections, truncated: report.truncated };
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
    try {
      const report = await crawlAgency(agencyId);
      if (report.listings.length === 0) {
        // Log enough to debug structural changes without leaking per-listing PII
        req.log.warn({ agencyId, sections: report.sections }, 'yad2 agency crawl returned 0 listings');
        return reply.code(422).send({
          error: { message: 'לא נמצאו נכסים בסוכנות זו — בדוק את הקישור או נסה שוב מאוחר יותר' },
        });
      }
      return {
        listings: report.listings,
        agency: { id: report.agencyId, name: report.agencyName, phone: report.agencyPhone },
        sections: report.sections,
        truncated: report.truncated,
      };
    } catch (err: any) {
      req.log.warn({ err, agencyId }, 'yad2 agency crawl threw');
      return reply.code(504).send({ error: { message: 'הסוכנות לא הגיבה — נסה שוב' } });
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
    // in their existing properties' notes.
    const markers = parsed.data.listings.map((l) => `[yad2:${l.sourceId}]`);
    const existing = await prisma.property.findMany({
      where: {
        agentId: u.id,
        OR: markers.map((m) => ({ notes: { contains: m } })),
      },
      select: { notes: true },
    });
    const existingSet = new Set<string>();
    for (const p of existing) {
      const m = p.notes?.match(/\[yad2:([^\]]+)\]/);
      if (m) existingSet.add(m[1]);
    }

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

        // Re-host the cover image: download from img.yad2.co.il and
        // write to uploads/properties/<propertyId>/yad2-cover-<uuid>.jpg.
        // Hot-link is fragile (Yad2 may rotate CDN paths or block
        // referrer-less requests later) — better to own the bytes.
        if (l.coverImage) {
          try {
            const url = await rehostImage(l.coverImage, property.id);
            await prisma.propertyImage.create({
              data: { propertyId: property.id, url, sortOrder: 0 },
            });
          } catch (imgErr: any) {
            req.log.warn({ err: imgErr, propertyId: property.id, src: l.coverImage }, 'yad2 image rehost failed');
            // Fall back to hot-link so the property still has a photo
            await prisma.propertyImage.create({
              data: { propertyId: property.id, url: l.coverImage, sortOrder: 0 },
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

    const markers = parsed.data.listings.map((l) => `[yad2:${l.sourceId}]`);
    const existing = await prisma.property.findMany({
      where: { agentId: u.id, OR: markers.map((m) => ({ notes: { contains: m } })) },
      select: { notes: true },
    });
    const existingSet = new Set<string>();
    for (const p of existing) {
      const m = p.notes?.match(/\[yad2:([^\]]+)\]/);
      if (m) existingSet.add(m[1]);
    }

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
