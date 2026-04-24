// Sprint 5 / MLS parity — Task H1. Global search: one query spans
// properties, leads, owners, and deals for the signed-in agent.
// Always owner-scoped, capped at 20 hits per entity so the result
// stays small enough for a spotlight-style popover.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { normalizeCity } from '../lib/addressNormalize.js';

// Generate all spellings we should search for. When the user types a
// known city variant ("ת"א", "תל-אביב", "Tel Aviv" later) we want to
// also match rows stored under the canonical ("תל אביב - יפו") — and
// vice versa. We can't do the same for streets here because street
// disambiguation needs a city hint, which global search doesn't have.
function expandTerm(term: string): string[] {
  const out = new Set<string>([term]);
  const canonical = normalizeCity(term)?.value;
  if (canonical && canonical !== term) out.add(canonical);
  return [...out];
}

const q = z.object({
  // Sprint 4 — empty q is valid and returns empty buckets so the
  // cmd-K palette can mount & reset without firing a doomed request.
  q:    z.string().max(120).optional().default(''),
  take: z.coerce.number().int().min(1).max(50).optional(),
});

export const registerSearchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const parsed = q.parse(req.query);
    const uid  = requireUser(req).id;
    const term = (parsed.q ?? '').trim();
    // Sprint 4 default = 5 per bucket (spotlight-style palette). Callers
    // who want more explicitly pass `take`. Max is still 50.
    const take = parsed.take ?? 5;
    // Empty query → empty buckets, no DB round-trips.
    if (!term) {
      return {
        query: '',
        total: 0,
        properties: [],
        leads: [],
        owners: [],
        deals: [],
      };
    }
    const terms = expandTerm(term);
    // For each field × each term, emit a `contains` clause.
    const anyOf = (fields: string[]) =>
      fields.flatMap((f) =>
        terms.map((t) => ({ [f]: { contains: t, mode: 'insensitive' } as const })),
      );

    const [properties, leads, owners, deals] = await Promise.all([
      prisma.property.findMany({
        where: { agentId: uid, OR: anyOf(['street', 'city', 'type', 'neighborhood', 'owner']) },
        select: { id: true, street: true, city: true, type: true, marketingPrice: true },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.lead.findMany({
        where: {
          agentId: uid,
          OR: [
            ...anyOf(['name', 'email', 'city']),
            ...terms.map((t) => ({ phone: { contains: t } })),
          ],
        },
        select: { id: true, name: true, phone: true, city: true, status: true },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.owner.findMany({
        where: {
          agentId: uid,
          OR: [
            ...anyOf(['name', 'email']),
            ...terms.map((t) => ({ phone: { contains: t } })),
          ],
        },
        select: { id: true, name: true, phone: true, email: true },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: { agentId: uid, OR: anyOf(['propertyStreet', 'city', 'buyerAgent', 'sellerAgent']) },
        select: {
          id: true, propertyStreet: true, city: true, status: true, closedPrice: true,
        },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      query: term,
      total: properties.length + leads.length + owners.length + deals.length,
      properties,
      leads,
      owners,
      deals,
    };
  });
};
