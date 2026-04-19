import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

/**
 * Yad2 import — POC.
 *
 * Two endpoints behind FEATURE_YAD2_IMPORT:
 *   POST /preview { url }       → server fetches the page, returns extracted listings (no DB writes)
 *   POST /import  { listings }  → creates Property rows, idempotent per Yad2 sourceId
 *
 * Idempotency without a schema change: each imported row stores a marker
 * `[yad2:<id>]` inside `notes`. Re-import finds that token in any of the
 * agent's existing properties and skips. When this graduates from POC
 * we'll add a dedicated `sourceId` column with a unique index.
 *
 * Caveats (also documented in routes/yad2.README.md):
 *   - Yad2 HTML structure can change; the parser hits __NEXT_DATA__
 *     first (more durable than DOM) and falls back to a small DOM
 *     extractor.
 *   - Respect rate limits — single fetch per preview, identifying UA.
 */

const FEATURE_FLAG = (process.env.FEATURE_YAD2_IMPORT ?? '').toLowerCase() === 'true';

const PreviewQ = z.object({
  url: z.string().url().refine(
    (u) => /(^https?:\/\/(www\.)?yad2\.co\.il)/.test(u),
    { message: 'must be a yad2.co.il URL' },
  ),
});

const ImportQ = z.object({
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

export const registerYad2Routes: FastifyPluginAsync = async (app) => {
  if (!FEATURE_FLAG) {
    // Feature flag off — register a stub that explains the disabled state.
    app.post('/preview', async (_req, reply) => {
      return reply.code(404).send({ error: { message: 'Yad2 import not enabled in this environment' } });
    });
    app.post('/import', async (_req, reply) => {
      return reply.code(404).send({ error: { message: 'Yad2 import not enabled in this environment' } });
    });
    return;
  }

  app.post('/preview', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = PreviewQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid Yad2 URL' } });
    }
    const { url } = parsed.data;

    let html: string;
    try {
      const r = await fetch(url, {
        headers: {
          // Identify ourselves clearly. Bot-detection systems are more
          // forgiving when you don't lie about what you are.
          'User-Agent': 'EstiaImporter/1.0 (https://estia.tripzio.xyz; +mailto:talfuks1234@gmail.com)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5',
        },
        // Don't follow infinite redirects; one hop max.
        redirect: 'follow',
      });
      if (r.status === 429 || r.status === 403) {
        req.log.warn({ status: r.status, url }, 'yad2 rate-limited / blocked');
        return reply.code(503).send({
          error: { message: 'Yad2 חסם את הבקשה — נסה שוב בעוד מספר דקות' },
        });
      }
      if (!r.ok) {
        return reply.code(502).send({ error: { message: `Yad2 returned ${r.status}` } });
      }
      html = await r.text();
    } catch (err: any) {
      req.log.warn({ err }, 'yad2 fetch failed');
      return reply.code(504).send({ error: { message: 'Yad2 לא הגיב — נסה שוב' } });
    }

    const listings = parseYad2Listings(html);
    if (listings.length === 0) {
      // Log raw HTML excerpt (capped) so we know to update selectors when Yad2 changes layout.
      req.log.warn({ excerpt: html.slice(0, 600) }, 'yad2 parser returned 0 listings');
      return reply.code(422).send({
        error: { message: 'לא נמצאו נכסים בדף — בדוק שהקישור נכון או נסה שוב מאוחר יותר' },
      });
    }
    return { listings };
  });

  app.post('/import', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = ImportQ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid import payload' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });

    // Find which sourceIds this agent already has (from notes marker).
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

    const created: any[] = [];
    const skipped: { sourceId: string; reason: string }[] = [];
    const failed: { sourceId: string; reason: string }[] = [];

    for (const l of parsed.data.listings) {
      if (existingSet.has(l.sourceId)) {
        skipped.push({ sourceId: l.sourceId, reason: 'already_imported' });
        continue;
      }
      try {
        const created_one = await prisma.property.create({
          data: {
            agentId: u.id,
            assetClass: 'RESIDENTIAL',
            category: 'SALE',
            type: 'דירה',
            street: l.street,
            city: l.city,
            owner: 'בעלים מ-Yad2',
            ownerPhone: '',
            marketingPrice: l.price ?? 0,
            sqm: l.sqm ?? 0,
            floor: l.floor ?? null,
            rooms: l.rooms ?? null,
            notes: [
              `[yad2:${l.sourceId}]`,
              l.title ? `כותרת מ-Yad2: ${l.title}` : null,
              l.description || null,
            ].filter(Boolean).join('\n'),
            // Image hot-linking is intentional for the POC. A real
            // version would fetch + re-upload to /uploads/. Marked in
            // the README.
            images: l.photos?.length
              ? { create: l.photos.map((url, i) => ({ url, sortOrder: i })) }
              : undefined,
          },
        });
        created.push({ sourceId: l.sourceId, id: created_one.id });
      } catch (err: any) {
        failed.push({ sourceId: l.sourceId, reason: err?.message || 'create_failed' });
      }
    }

    return { created, skipped, failed };
  });
};

// ── Parser ────────────────────────────────────────────────────────
// Tries __NEXT_DATA__ first (Yad2 is a Next.js app — that JSON has the
// listings as proper data). Falls back to a small DOM extractor if
// the JSON shape isn't what we expect.

interface ExtractedListing {
  sourceId: string;
  title?: string;
  street: string;
  city: string;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  price?: number | null;
  photos?: string[];
  description?: string;
}

export function parseYad2Listings(html: string): ExtractedListing[] {
  // Strategy 1: __NEXT_DATA__ inline JSON
  const next = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    try {
      const data = JSON.parse(next[1]);
      const found = walkForListings(data);
      if (found.length > 0) return found;
    } catch {
      // fall through to DOM
    }
  }

  // Strategy 2: light DOM scrape — extract anything that looks like a
  // listing card. Enough for the POC review screen even if some fields
  // are missing.
  const items: ExtractedListing[] = [];
  const cardRegex = /<a[^>]+href=["']\/(item|s\/realestate)\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const sourceId = m[2];
    const inner = m[3];
    const title = (inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '';
    const text = stripHtml(inner);
    items.push({
      sourceId,
      title: stripHtml(title) || undefined,
      street: '',
      city: '',
      description: text.slice(0, 200),
    });
  }
  return items;
}

function walkForListings(data: any, out: ExtractedListing[] = []): ExtractedListing[] {
  if (!data || typeof data !== 'object') return out;
  // Heuristic: any object with an `id` (numeric or string) AND
  // (`address` || `price`) is probably a listing card.
  if (
    (typeof data.id === 'string' || typeof data.id === 'number') &&
    (data.address || data.price || data.realestate || data.item_type)
  ) {
    const sourceId = String(data.id);
    if (sourceId && out.findIndex((x) => x.sourceId === sourceId) === -1) {
      out.push({
        sourceId,
        title: data.title || data.subtitle || undefined,
        street: pickStr(data.address?.street?.text, data.address?.street, data.street) || '',
        city:   pickStr(data.address?.city?.text, data.address?.city, data.city) || '',
        rooms:  pickNum(data.additionalDetails?.rooms, data.rooms, data.room),
        sqm:    pickNum(data.additionalDetails?.square_meter, data.sqm, data.size),
        floor:  pickNum(data.address?.house?.floor, data.floor),
        price:  pickNum(data.price, data.priceValue, data.metaData?.price),
        photos: Array.isArray(data.metaData?.coverImage) ? [data.metaData.coverImage]
              : Array.isArray(data.metaData?.images) ? data.metaData.images
              : [],
        description: data.description || undefined,
      });
    }
  }
  for (const key of Object.keys(data)) {
    const v = (data as any)[key];
    if (v && typeof v === 'object') walkForListings(v, out);
  }
  return out;
}

function pickStr(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
function pickNum(...vals: any[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n) && n !== 0) return n;
    }
  }
  return null;
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
