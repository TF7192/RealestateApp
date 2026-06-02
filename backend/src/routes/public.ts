import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { slugify, propertySlug, ensureUniqueSlug } from '../lib/slug.js';

// Shared OG renderer used by both the slug-based and id-based property
// endpoints. Generates a minimal HTML page with og: + twitter: meta
// tags so WhatsApp / Telegram / Twitter / Facebook crawlers see a
// property-specific preview (image, title, price line) instead of the
// site-level fallback.
function sendPropertyOg(
  reply: FastifyReply,
  agent: { id: string; displayName?: string | null; slug?: string | null },
  property: { type: string; street: string; city: string; rooms: number | null; sqm: number; marketingPrice: number; images: Array<{ url: string }> },
  agentSlug: string | null,
  propSlug: string | null,
): FastifyReply {
  const origin = process.env.PUBLIC_ORIGIN || 'https://estia.co.il';
  const url = `${origin}/agents/${agentSlug}/${propSlug}`;
  const img = property.images[0]?.url || '';
  const imgAbs = img.startsWith('http') ? img : `${origin}${img}`;
  const title = `${property.type} ב${property.street}, ${property.city}`;
  const parts: string[] = [];
  if (property.rooms) parts.push(`${property.rooms} חדרים`);
  if (property.sqm) parts.push(`${property.sqm} מ״ר`);
  const price = `₪${property.marketingPrice.toLocaleString('he-IL')}`;
  const desc = [price, ...parts, agent.displayName].filter(Boolean).join(' · ');
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  const html = `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(imgAbs)}">
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(imgAbs)}">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`;
  reply.header('Content-Type', 'text/html; charset=utf-8');
  reply.header('Cache-Control', 'public, max-age=300');
  // SEC-011 — server-wide helmet CSP is "default-src 'none'", which
  // is right for the JSON API but would block this HTML page's
  // og:image (loaded by the social-bot crawler) and its meta-refresh
  // navigation in some clients. Override with a minimal HTML CSP:
  // images allowed over https, no scripts at all, framing forbidden.
  reply.header(
    'Content-Security-Policy',
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none';",
  );
  return reply.send(html);
}

/**
 * Public, unauthenticated, SEO-friendly routes for client-facing pages.
 *
 *   GET /api/public/agents/:agentSlug
 *       → { agent: {…}, properties: [...] }
 *
 *   GET /api/public/agents/:agentSlug/properties/:propertySlug
 *       → { agent: {…}, property: {…} }
 *
 * The legacy /api/agents/:id/public route still exists for backwards
 * compat (older shared links keep working).
 */
export const registerPublicRoutes: FastifyPluginAsync = async (app) => {
  // Helper — find an agent by slug, lazily generating one if it's still null.
  async function findOrCreateAgentSlug(agentId: string): Promise<string | null> {
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, displayName: true, slug: true },
    });
    if (!agent) return null;
    if (agent.slug) return agent.slug;
    const base = slugify(agent.displayName) || `agent-${agent.id.slice(-6)}`;
    const free = await ensureUniqueSlug(base, async (cand) => {
      const x = await prisma.user.findUnique({ where: { slug: cand } });
      return !!x;
    });
    await prisma.user.update({ where: { id: agentId }, data: { slug: free } });
    return free;
  }

  async function findOrCreatePropertySlug(propertyId: string): Promise<string | null> {
    const p = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, agentId: true, slug: true, type: true, rooms: true, city: true, street: true },
    });
    if (!p) return null;
    if (p.slug) return p.slug;
    const base = propertySlug(p) || `property-${p.id.slice(-6)}`;
    const free = await ensureUniqueSlug(base, async (cand) => {
      const x = await prisma.property.findFirst({
        where: { agentId: p.agentId, slug: cand },
      });
      return !!x;
    });
    await prisma.property.update({ where: { id: propertyId }, data: { slug: free } });
    return free;
  }

  /** Resolve an /agents/<slug> URL — also accepts an old cuid as a fallback. */
  app.get('/agents/:agentSlug', async (req, reply) => {
    const { agentSlug } = req.params as { agentSlug: string };
    const agent =
      (await prisma.user.findUnique({ where: { slug: agentSlug }, include: { agentProfile: true } })) ||
      (await prisma.user.findUnique({ where: { id: agentSlug }, include: { agentProfile: true } }));
    if (!agent || agent.role !== 'AGENT' && agent.role !== 'OWNER') {
      return reply.code(404).send({ error: { message: 'Agent not found' } });
    }
    // Lazy slug-fill so older agents migrate over time
    if (!agent.slug) {
      const fresh = await findOrCreateAgentSlug(agent.id);
      if (fresh) (agent as any).slug = fresh;
    }
    const properties = await prisma.property.findMany({
      where: { agentId: agent.id, status: 'ACTIVE' },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    type PropertyRow = (typeof properties)[number];
    return {
      agent: {
        id: agent.id,
        slug: agent.slug,
        displayName: agent.displayName,
        phone: agent.phone,
        avatarUrl: agent.avatarUrl,
        agency: agent.agentProfile?.agency || null,
        title: agent.agentProfile?.title || null,
        bio: agent.agentProfile?.bio || null,
      },
      properties: properties.map((p: PropertyRow) => ({
        id: p.id,
        slug: p.slug,
        url: `/agents/${agent.slug}/${p.slug}`,
        assetClass: p.assetClass,
        category: p.category,
        type: p.type,
        street: p.street,
        city: p.city,
        rooms: p.rooms,
        sqm: p.sqm,
        marketingPrice: p.marketingPrice,
        image: p.images[0]?.url || null,
      })),
    };
  });

  /** Resolve an /agents/<slug>/<propSlug> URL. */
  app.get('/agents/:agentSlug/properties/:propertySlug', async (req, reply) => {
    const { agentSlug, propertySlug: propSlug } = req.params as {
      agentSlug: string; propertySlug: string;
    };
    const agent =
      (await prisma.user.findUnique({ where: { slug: agentSlug } })) ||
      (await prisma.user.findUnique({ where: { id: agentSlug } }));
    if (!agent || agent.role !== 'AGENT' && agent.role !== 'OWNER') {
      return reply.code(404).send({ error: { message: 'Agent not found' } });
    }
    const property =
      (await prisma.property.findFirst({
        where: { agentId: agent.id, slug: propSlug },
        include: { images: { orderBy: { sortOrder: 'asc' } }, videos: true },
      })) ||
      (await prisma.property.findFirst({
        where: { agentId: agent.id, id: propSlug },
        include: { images: { orderBy: { sortOrder: 'asc' } }, videos: true },
      }));
    if (!property) {
      return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    // Flatten images to the shape CustomerPropertyView expects:
    // - `images`: string[] (URLs) so `<img src={images[0]}>` renders.
    // - `imageThumbs` / `imageList`: parallel structures the desktop
    //   detail page uses. Without these the public page rendered the
    //   PropertyImage objects directly into <img src=…>, producing
    //   broken image tiles. Mirrors the `serialize()` output of
    //   /api/properties/:id.
    const imageRows = property.images || [];
    const flatProperty: any = {
      ...property,
      images: imageRows.map((i: any) => i.url),
      imageThumbs: imageRows.map((i: any) => i.urlThumb || i.urlCard || i.url),
      imageList: imageRows.map((i: any) => ({
        id: i.id, url: i.url, urlCard: i.urlCard, urlThumb: i.urlThumb, sortOrder: i.sortOrder,
      })),
    };
    return {
      agent: {
        id: agent.id,
        slug: agent.slug,
        displayName: agent.displayName,
        // Surface the agent avatar so the public page can show a
        // profile pic next to the name + contact card.
        avatarUrl: (agent as any).avatarUrl ?? null,
      },
      property: flatProperty,
      // 2026-05-11 — premium agents can author a per-property landing
      // config via /properties/:id/landing-editor. Public renderer
      // treats `null` as "use the hard-coded default layout".
      landingPageConfig: (property as any).landingPageConfig ?? null,
    };
  });

  // 2.2 — Server-rendered Open Graph preview. Nginx should route crawler
  // user-agents (WhatsApp, Twitterbot, Facebook, Telegram, LinkedIn) to
  // this endpoint so link-unfurling in chat apps gets a real image +
  // title without needing to execute the SPA's JavaScript. Regular
  // browsers still hit the SPA via the /agents/<slug>/<slug> route.
  app.get('/og/property/:agentSlug/:propertySlug', async (req, reply) => {
    const { agentSlug, propertySlug: propSlug } = req.params as { agentSlug: string; propertySlug: string };
    const agent =
      (await prisma.user.findUnique({ where: { slug: agentSlug } })) ||
      (await prisma.user.findUnique({ where: { id: agentSlug } }));
    if (!agent) return reply.code(404).send('Not found');
    const property =
      (await prisma.property.findFirst({
        where: { agentId: agent.id, slug: propSlug },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      })) ||
      (await prisma.property.findFirst({
        where: { agentId: agent.id, id: propSlug },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      }));
    if (!property) return reply.code(404).send('Not found');
    return sendPropertyOg(reply, agent, property, agentSlug, propSlug);
  });

  // Companion to the slug-based OG endpoint above. The legacy /p/:id
  // short links share to WhatsApp / Telegram / Twitter — without this
  // route the social-bot rewrite has nowhere to send the crawler, so
  // the preview fell back to index.html's site-level meta tags
  // ("ניהול נכסים ולידים — Estia") with no property image. Resolves
  // the id internally and forwards the canonical agent slug + property
  // slug to the same renderer the slug endpoint uses.
  app.get('/og/property-by-id/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    if (!property) return reply.code(404).send('Not found');
    const agent = await prisma.user.findUnique({ where: { id: property.agentId } });
    if (!agent) return reply.code(404).send('Not found');
    const agentSlug = await findOrCreateAgentSlug(agent.id);
    const propSlug = await findOrCreatePropertySlug(property.id);
    return sendPropertyOg(reply, agent, property, agentSlug, propSlug);
  });

  /** Public inquiry — lead form on the per-asset landing page (/l/:agentSlug/:propertySlug).
   *  Accepts name + phone + optional email / message. Stored as a
   *  PropertyInquiry row on the owning property; the agent sees it
   *  in the property detail "פניות" counter + activity stream.
   *  Rate-limited via the global plugin default; no auth required. */
  app.post('/agents/:agentSlug/properties/:propertySlug/inquiry', async (req, reply) => {
    const { agentSlug, propertySlug: propSlug } = req.params as {
      agentSlug: string; propertySlug: string;
    };
    const body = (req.body || {}) as {
      contactName?: unknown; contactPhone?: unknown;
      contactEmail?: unknown; message?: unknown;
    };
    const name = String(body.contactName || '').trim().slice(0, 120);
    const phone = String(body.contactPhone || '').trim().slice(0, 40);
    const email = body.contactEmail ? String(body.contactEmail).trim().slice(0, 120) : null;
    const message = body.message ? String(body.message).trim().slice(0, 2000) : null;
    if (!name || !phone) {
      return reply.code(400).send({ error: { message: 'שם וטלפון הם שדות חובה' } });
    }
    const agent =
      (await prisma.user.findUnique({ where: { slug: agentSlug } })) ||
      (await prisma.user.findUnique({ where: { id: agentSlug } }));
    if (!agent || agent.role !== 'AGENT' && agent.role !== 'OWNER') {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const property =
      (await prisma.property.findFirst({ where: { agentId: agent.id, slug: propSlug } })) ||
      (await prisma.property.findFirst({ where: { agentId: agent.id, id: propSlug } }));
    if (!property) return reply.code(404).send({ error: { message: 'Not found' } });
    await prisma.propertyInquiry.create({
      data: {
        propertyId: property.id,
        contactName: name,
        contactPhone: phone,
        contactEmail: email,
        message,
      },
    });
    return reply.code(201).send({ ok: true });
  });

  /** Slug lookup helper — given an internal id, return the public URL.
   *  Public (no auth) so the dashboard can call it without elevation; the
   *  result only contains a slug pair, which is itself public anyway. */
  app.get('/lookup/property/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await prisma.property.findUnique({
      where: { id },
      select: { id: true, agentId: true },
    });
    if (!p) return reply.code(404).send({ error: { message: 'Not found' } });
    const agentSlug = await findOrCreateAgentSlug(p.agentId);
    const propSlug = await findOrCreatePropertySlug(p.id);
    return {
      agentSlug,
      propertySlug: propSlug,
      publicPath: `/agents/${agentSlug}/${propSlug}`,
    };
  });
};
