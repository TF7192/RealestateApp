// Sprint 1 / MLS parity — Task A2.
//
// Tags ("מדבקות") are per-agent labels that can be attached to any mix
// of properties, leads, and customers. This route surface covers CRUD
// on the tag itself plus attach/detach against an entity.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const ENTITY = z.enum(['PROPERTY', 'LEAD', 'CUSTOMER']);
const SCOPE = z.enum(['PROPERTY', 'LEAD', 'CUSTOMER', 'ALL']);

export const registerTagRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/tags?scope=PROPERTY|LEAD|CUSTOMER — caller's own tags.
  // `scope` narrows to tags whose scope is ALL or the requested one,
  // which is how the filter chips on each list page will query them.
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const { scope } = req.query as { scope?: string };
    const filter = scope && ['PROPERTY', 'LEAD', 'CUSTOMER'].includes(scope)
      ? { OR: [{ scope: 'ALL' as const }, { scope: scope as 'PROPERTY' | 'LEAD' | 'CUSTOMER' }] }
      : {};
    const tags = await prisma.tag.findMany({
      where: { agentId: u.id, ...filter },
      orderBy: { name: 'asc' },
    });
    return { tags };
  });

  // POST /api/tags — create a tag.
  const createSchema = z.object({
    name:  z.string().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    scope: SCOPE.optional(),
  });
  app.post('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const u = requireUser(req);
    try {
      const tag = await prisma.tag.create({
        data: {
          agentId: u.id,
          name:    body.name.trim(),
          color:   body.color ?? '#C9A14B',
          scope:   body.scope ?? 'ALL',
        },
      });
      return { tag };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: { message: 'Tag name already exists' } });
      }
      throw e;
    }
  });

  // PATCH /api/tags/:id — rename / recolor / rescope.
  const patchSchema = createSchema.partial();
  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = patchSchema.parse(req.body);
    const u = requireUser(req);
    const existing = await prisma.tag.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Tag not found' } });
    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(body.name  !== undefined ? { name:  body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.scope !== undefined ? { scope: body.scope } : {}),
      },
    });
    return { tag };
  });

  // DELETE /api/tags/:id — also cascades assignments via the schema.
  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.tag.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Tag not found' } });
    await prisma.tag.delete({ where: { id } });
    return { ok: true };
  });

  // ── Assignments ─────────────────────────────────────────────────
  // POST /api/tags/:id/assign — attach this tag to an entity.
  const assignSchema = z.object({
    entityType: ENTITY,
    entityId:   z.string().min(1),
  });
  app.post('/:id/assign', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = assignSchema.parse(req.body);
    const u = requireUser(req);
    const tag = await prisma.tag.findFirst({ where: { id, agentId: u.id } });
    if (!tag) return reply.code(404).send({ error: { message: 'Tag not found' } });
    // Soft scope enforcement — only reject if scope is set AND doesn't
    // match. `ALL` scope accepts any entity type.
    if (tag.scope !== 'ALL' && tag.scope !== body.entityType) {
      return reply.code(400).send({
        error: { message: `Tag scope ${tag.scope} does not match entity ${body.entityType}` },
      });
    }
    // Verify the entity belongs to the caller. Keeps one agent from
    // leaking tags onto another agent's rows by id guessing.
    if (!(await agentOwnsEntity(u.id, body.entityType, body.entityId))) {
      return reply.code(404).send({ error: { message: `${body.entityType} not found` } });
    }
    const assignment = await prisma.tagAssignment.upsert({
      where: {
        tagId_entityType_entityId: {
          tagId: id, entityType: body.entityType, entityId: body.entityId,
        },
      },
      create: { tagId: id, entityType: body.entityType, entityId: body.entityId },
      update: {},
    });
    return { assignment };
  });

  // DELETE /api/tags/:id/assign — detach (idempotent).
  app.delete('/:id/assign', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = assignSchema.parse(req.body);
    const u = requireUser(req);
    const tag = await prisma.tag.findFirst({ where: { id, agentId: u.id } });
    if (!tag) return reply.code(404).send({ error: { message: 'Tag not found' } });
    await prisma.tagAssignment.deleteMany({
      where: { tagId: id, entityType: body.entityType, entityId: body.entityId },
    });
    return { ok: true };
  });

  // Detach variant that accepts the entity in the query string — useful
  // for tag-removal buttons that don't want to send a JSON body.
  app.delete('/:id/assign/:entityType/:entityId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, entityType, entityId } = req.params as {
      id: string; entityType: string; entityId: string;
    };
    const ent = ENTITY.safeParse(entityType);
    if (!ent.success) return reply.code(400).send({ error: { message: 'Invalid entityType' } });
    const u = requireUser(req);
    const tag = await prisma.tag.findFirst({ where: { id, agentId: u.id } });
    if (!tag) return reply.code(404).send({ error: { message: 'Tag not found' } });
    await prisma.tagAssignment.deleteMany({
      where: { tagId: id, entityType: ent.data, entityId },
    });
    return { ok: true };
  });

  // GET /api/tags/for?entityType=PROPERTY&entityId=abc — list tags on
  // a single entity. Useful for the chip bar on a detail page.
  app.get('/for', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const q = z.object({ entityType: ENTITY, entityId: z.string().min(1) }).parse(req.query);
    const u = requireUser(req);
    if (!(await agentOwnsEntity(u.id, q.entityType, q.entityId))) {
      return reply.code(404).send({ error: { message: `${q.entityType} not found` } });
    }
    const rows = await prisma.tagAssignment.findMany({
      where: { entityType: q.entityType, entityId: q.entityId, tag: { agentId: u.id } },
      include: { tag: true },
      orderBy: { tag: { name: 'asc' } },
    });
    return { tags: rows.map((r) => r.tag) };
  });
};

// Returns true iff the authenticated agent actually owns the entity —
// keeps one agent from leaking tags onto another's rows by id guessing.
async function agentOwnsEntity(
  agentId: string,
  entityType: 'PROPERTY' | 'LEAD' | 'CUSTOMER',
  entityId: string,
): Promise<boolean> {
  if (entityType === 'PROPERTY') {
    return !!(await prisma.property.findFirst({ where: { id: entityId, agentId } }));
  }
  // Estia's customer concept is the customer-side User profile; agents
  // tag by the underlying Lead they own, so CUSTOMER and LEAD both
  // resolve through `Lead.agentId` for scoping.
  return !!(await prisma.lead.findFirst({ where: { id: entityId, agentId } }));
}
