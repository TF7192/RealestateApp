// Sprint 2 / MLS parity — Task K4.
//
// Repeatable `הנכס המבוקש` profiles. A lead can have multiple (e.g.
// "buying residence in Tel Aviv" + "investing commercial in Haifa"),
// and the matching engine hits all of them. Mounted as a child of
// /api/leads so the same ownership check gates access.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const profileInput = z.object({
  label:          z.string().max(120).nullable().optional(),
  domain:         z.enum(['RESIDENTIAL', 'COMMERCIAL']).nullable().optional(),
  dealType:       z.enum(['SALE', 'RENT']).nullable().optional(),
  propertyTypes:  z.array(z.string().max(60)).optional(),
  cities:         z.array(z.string().max(120)).optional(),
  neighborhoods:  z.array(z.string().max(120)).optional(),
  streets:        z.array(z.string().max(120)).optional(),
  minRoom:        z.number().nullable().optional(),
  maxRoom:        z.number().nullable().optional(),
  minPrice:       z.number().int().nullable().optional(),
  maxPrice:       z.number().int().nullable().optional(),
  minPricePerSqm: z.number().int().nullable().optional(),
  maxPricePerSqm: z.number().int().nullable().optional(),
  minFloor:       z.number().int().nullable().optional(),
  maxFloor:       z.number().int().nullable().optional(),
  minBuilt:       z.number().int().nullable().optional(),
  maxBuilt:       z.number().int().nullable().optional(),
  minPlot:        z.number().int().nullable().optional(),
  maxPlot:        z.number().int().nullable().optional(),
  parkingReq:     z.boolean().optional(),
  elevatorReq:    z.boolean().optional(),
  balconyReq:     z.boolean().optional(),
  furnitureReq:   z.boolean().optional(),
  mamadReq:       z.boolean().optional(),
  storeroomReq:   z.boolean().optional(),
});

export const registerLeadSearchProfileRoutes: FastifyPluginAsync = async (app) => {
  // Helper — ensures the authed agent owns the lead. Sends 404 on mismatch.
  async function ensureOwnsLead(agentId: string, leadId: string, reply: any) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, agentId } });
    if (!lead) {
      reply.code(404).send({ error: { message: 'Lead not found' } });
      return null;
    }
    return lead;
  }

  // GET /api/leads/:leadId/search-profiles
  app.get('/leads/:leadId/search-profiles', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const u = requireUser(req);
    if (!(await ensureOwnsLead(u.id, leadId, reply))) return;
    const items = await prisma.leadSearchProfile.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
    });
    return { items };
  });

  // POST /api/leads/:leadId/search-profiles — create a new profile.
  app.post('/leads/:leadId/search-profiles', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const body = profileInput.parse(req.body);
    const u = requireUser(req);
    if (!(await ensureOwnsLead(u.id, leadId, reply))) return;
    const profile = await prisma.leadSearchProfile.create({
      data: { leadId, ...body },
    });
    return { profile };
  });

  // PATCH /api/leads/:leadId/search-profiles/:id
  app.patch('/leads/:leadId/search-profiles/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { leadId, id } = req.params as { leadId: string; id: string };
    const body = profileInput.partial().parse(req.body);
    const u = requireUser(req);
    if (!(await ensureOwnsLead(u.id, leadId, reply))) return;
    const existing = await prisma.leadSearchProfile.findFirst({ where: { id, leadId } });
    if (!existing) return reply.code(404).send({ error: { message: 'Profile not found' } });
    const profile = await prisma.leadSearchProfile.update({
      where: { id }, data: body,
    });
    return { profile };
  });

  // DELETE /api/leads/:leadId/search-profiles/:id
  app.delete('/leads/:leadId/search-profiles/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { leadId, id } = req.params as { leadId: string; id: string };
    const u = requireUser(req);
    if (!(await ensureOwnsLead(u.id, leadId, reply))) return;
    const existing = await prisma.leadSearchProfile.findFirst({ where: { id, leadId } });
    if (!existing) return reply.code(404).send({ error: { message: 'Profile not found' } });
    await prisma.leadSearchProfile.delete({ where: { id } });
    return { ok: true };
  });
};
