// Sprint 1 / MLS parity — Task D1.
//
// Standalone reminder entity. Orthogonal to LeadMeeting (which is a
// calendar-synced meeting with a lead). A reminder can stand alone or
// anchor to a lead / property / customer for quick navigation.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const createSchema = z.object({
  title:      z.string().min(1).max(200),
  notes:      z.string().max(4000).nullable().optional(),
  dueAt:      z.string().datetime(),
  leadId:     z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
});

const patchSchema = createSchema.partial();

export const registerReminderRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/reminders?status=PENDING|COMPLETED|CANCELLED&from=&to=
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const q = z.object({
      status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
      from:   z.string().datetime().optional(),
      to:     z.string().datetime().optional(),
      leadId: z.string().optional(),
      propertyId: z.string().optional(),
    }).parse(req.query);
    const where: any = { agentId: u.id };
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.dueAt = {};
      if (q.from) where.dueAt.gte = new Date(q.from);
      if (q.to)   where.dueAt.lte = new Date(q.to);
    }
    if (q.leadId)     where.leadId = q.leadId;
    if (q.propertyId) where.propertyId = q.propertyId;
    const items = await prisma.reminder.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
    return { items };
  });

  // POST /api/reminders — create.
  app.post('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const u = requireUser(req);
    if (body.leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: body.leadId, agentId: u.id } });
      if (!lead) return reply.code(404).send({ error: { message: 'Lead not found' } });
    }
    if (body.propertyId) {
      const prop = await prisma.property.findFirst({ where: { id: body.propertyId, agentId: u.id } });
      if (!prop) return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    const reminder = await prisma.reminder.create({
      data: {
        agentId:    u.id,
        title:      body.title.trim(),
        notes:      body.notes?.trim() || null,
        dueAt:      new Date(body.dueAt),
        leadId:     body.leadId ?? null,
        propertyId: body.propertyId ?? null,
        customerId: body.customerId ?? null,
      },
    });
    return { reminder };
  });

  // PATCH /api/reminders/:id — edit.
  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = patchSchema.parse(req.body);
    const u = requireUser(req);
    const existing = await prisma.reminder.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Reminder not found' } });
    const data: any = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.notes !== undefined) data.notes = body.notes?.trim() ?? null;
    if (body.dueAt !== undefined) data.dueAt = new Date(body.dueAt);
    if (body.leadId !== undefined) data.leadId = body.leadId ?? null;
    if (body.propertyId !== undefined) data.propertyId = body.propertyId ?? null;
    if (body.customerId !== undefined) data.customerId = body.customerId ?? null;
    const reminder = await prisma.reminder.update({ where: { id }, data });
    return { reminder };
  });

  // POST /api/reminders/:id/complete — mark as done.
  app.post('/:id/complete', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.reminder.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Reminder not found' } });
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), cancelledAt: null },
    });
    return { reminder };
  });

  // POST /api/reminders/:id/cancel — soft-cancel.
  app.post('/:id/cancel', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.reminder.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Reminder not found' } });
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), completedAt: null },
    });
    return { reminder };
  });

  // DELETE /api/reminders/:id — hard delete.
  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.reminder.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Reminder not found' } });
    await prisma.reminder.delete({ where: { id } });
    return { ok: true };
  });
};
