import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';

// GET /sitemap.xml — dynamic sitemap for Google Search Console.
//
// Three categories of URL:
//   1. Hard-coded marketing / public app routes (landing, legal,
//      login).
//   2. Every agent portal we've published — one URL per user with a
//      public `slug`.
//   3. Every shareable property page — `/agents/<agent>/<property>`
//      for properties that have both a slug and a known agent slug.
//
// Cached for 1 hour at the edge + locally so Googlebot's re-crawl
// schedule doesn't hit Postgres every time. If the sitemap grows
// past 50 000 URLs we'll need to split into indexes; until then a
// single file is well under Google's limits.

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://estia.co.il';

const STATIC_ROUTES: { path: string; priority: number; changefreq: string }[] = [
  { path: '/',        priority: 1.0, changefreq: 'weekly' },
  { path: '/login',   priority: 0.7, changefreq: 'monthly' },
  { path: '/terms',   priority: 0.3, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.3, changefreq: 'yearly' },
];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlTag(opts: {
  loc: string;
  lastmod?: Date | null;
  priority?: number;
  changefreq?: string;
}): string {
  const lines = [`  <url>`, `    <loc>${xmlEscape(opts.loc)}</loc>`];
  if (opts.lastmod) lines.push(`    <lastmod>${opts.lastmod.toISOString().slice(0, 10)}</lastmod>`);
  if (opts.changefreq) lines.push(`    <changefreq>${opts.changefreq}</changefreq>`);
  if (opts.priority != null) lines.push(`    <priority>${opts.priority.toFixed(1)}</priority>`);
  lines.push(`  </url>`);
  return lines.join('\n');
}

export const registerSitemapRoute: FastifyPluginAsync = async (app) => {
  app.get('/sitemap.xml', async (_req, reply) => {
    const today = new Date();

    const entries: string[] = [];

    for (const r of STATIC_ROUTES) {
      entries.push(urlTag({
        loc: `${PUBLIC_ORIGIN}${r.path}`,
        lastmod: today,
        priority: r.priority,
        changefreq: r.changefreq,
      }));
    }

    // Public agent portals — every user with a slug.
    try {
      const agents = await prisma.user.findMany({
        where: { slug: { not: null }, deletedAt: null },
        select: { slug: true, updatedAt: true },
      });
      for (const a of agents) {
        if (!a.slug) continue;
        entries.push(urlTag({
          loc: `${PUBLIC_ORIGIN}/agents/${encodeURIComponent(a.slug)}`,
          lastmod: a.updatedAt,
          priority: 0.6,
          changefreq: 'weekly',
        }));
      }
    } catch (e) {
      (app.log as any).warn({ err: e }, 'sitemap: agents query failed');
    }

    // Public property pages — need both the property slug and the
    // owning agent's slug.
    try {
      const properties = await prisma.property.findMany({
        where: {
          slug: { not: null },
          agent: { slug: { not: null } },
        },
        select: {
          slug: true,
          updatedAt: true,
          agent: { select: { slug: true } },
        },
        take: 10_000,
      });
      for (const p of properties) {
        if (!p.slug || !p.agent?.slug) continue;
        entries.push(urlTag({
          loc: `${PUBLIC_ORIGIN}/agents/${encodeURIComponent(p.agent.slug)}/${encodeURIComponent(p.slug)}`,
          lastmod: p.updatedAt,
          priority: 0.8,
          changefreq: 'weekly',
        }));
      }
    } catch (e) {
      (app.log as any).warn({ err: e }, 'sitemap: properties query failed');
    }

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries.join('\n') + '\n' +
      `</urlset>\n`;

    reply
      .type('application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      .send(body);
  });
};
