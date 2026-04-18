import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { slugify, propertySlug, ensureUniqueSlug } from '../lib/slug.js';

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
    if (!agent || agent.role !== 'AGENT') {
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
    if (!agent || agent.role !== 'AGENT') {
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
    return { agent: { id: agent.id, slug: agent.slug, displayName: agent.displayName }, property };
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
