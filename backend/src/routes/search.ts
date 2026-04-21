// Sprint 5 / MLS parity — Task H1. Global search: one query spans
// properties, leads, owners, and deals for the signed-in agent.
// Always owner-scoped, capped at 20 hits per entity so the result
// stays small enough for a spotlight-style popover.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const q = z.object({
  q:    z.string().min(1).max(120),
  take: z.coerce.number().int().min(1).max(50).optional(),
});

export const registerSearchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const parsed = q.parse(req.query);
    const uid  = requireUser(req).id;
    const term = parsed.q;
    const take = parsed.take ?? 10;

    const [properties, leads, owners, deals] = await Promise.all([
      prisma.property.findMany({
        where: {
          agentId: uid,
          OR: [
            { street:      { contains: term, mode: 'insensitive' } },
            { city:        { contains: term, mode: 'insensitive' } },
            { type:        { contains: term, mode: 'insensitive' } },
            { neighborhood:{ contains: term, mode: 'insensitive' } },
            { owner:       { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, street: true, city: true, type: true, marketingPrice: true },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.lead.findMany({
        where: {
          agentId: uid,
          OR: [
            { name:  { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            { email: { contains: term, mode: 'insensitive' } },
            { city:  { contains: term, mode: 'insensitive' } },
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
            { name:  { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, email: true },
        take,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: {
          agentId: uid,
          OR: [
            { propertyStreet: { contains: term, mode: 'insensitive' } },
            { city:           { contains: term, mode: 'insensitive' } },
            { buyerAgent:     { contains: term, mode: 'insensitive' } },
            { sellerAgent:    { contains: term, mode: 'insensitive' } },
          ],
        },
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
