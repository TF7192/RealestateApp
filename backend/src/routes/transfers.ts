import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

// Property transfers — move ownership between agents with an accept/decline
// handshake, or log a WhatsApp-only share for audit purposes.

// Mounted at `/api`. Declares routes across `/transfers/*` and
// `/properties/:id/transfer*` so the REST design stays intuitive.
export const registerTransferRoutes: FastifyPluginAsync = async (app) => {
  // Search for another agent by email (exact match) — used by the transfer
  // dialog so the sender can look up the receiver.
  app.get('/transfers/agents/search', { onRequest: [app.requireAgent] }, async (req) => {
    const { email } = req.query as { email?: string };
    if (!email) return { agent: null };
    const norm = email.trim().toLowerCase();
    // Case-insensitive lookup handles legacy rows stored with mixed
    // case (signup historically preserved the email as typed).
    const agent = await prisma.user.findFirst({
      where: { email: { equals: norm, mode: 'insensitive' } },
      include: { agentProfile: true },
    });
    // Accept AGENT and OWNER (an OWNER of one office can be added to
    // another). CUSTOMER stays blocked.
    if (!agent || agent.role === 'CUSTOMER') return { agent: null };
    if (agent.id === requireUser(req).id) return { agent: null, self: true };
    return {
      agent: {
        id: agent.id,
        email: agent.email,
        displayName: agent.displayName,
        phone: agent.phone,
        avatarUrl: agent.avatarUrl,
        agency: agent.agentProfile?.agency || null,
      },
    };
  });

  // List transfers involving the current agent (incoming + outgoing)
  app.get('/transfers', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const items = await prisma.propertyTransfer.findMany({
      where: { OR: [{ fromAgentId: uid }, { toAgentId: uid }] },
      include: {
        property: {
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        },
        fromAgent: { select: { id: true, displayName: true, email: true, avatarUrl: true, agentProfile: { select: { agency: true } } } },
        toAgent:   { select: { id: true, displayName: true, email: true, avatarUrl: true, agentProfile: { select: { agency: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Decorate with a simple direction flag for the UI
    const decorated = items.map((t: any) => ({
      ...t,
      direction: t.fromAgentId === uid ? 'outgoing' : 'incoming',
    }));
    return { items: decorated };
  });

  // Initiate a transfer. Body: { toAgentEmail, message? }
  const initiateSchema = z.object({
    toAgentEmail: z.string().email(),
    message: z.string().max(500).nullable().optional(),
  });
  app.post('/properties/:id/transfer', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = initiateSchema.parse(req.body);
    const uid = requireUser(req).id;

    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== uid) {
      return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    const toEmail = body.toAgentEmail.trim().toLowerCase();
    const recipient = await prisma.user.findUnique({ where: { email: toEmail } });
    if (!recipient || recipient.role !== 'AGENT') {
      return reply.code(404).send({ error: { message: 'הסוכן לא נמצא במערכת' } });
    }
    if (recipient.id === uid) {
      return reply.code(400).send({ error: { message: 'אי אפשר להעביר נכס לעצמך' } });
    }

    // Block duplicate pending transfers
    const existing = await prisma.propertyTransfer.findFirst({
      where: { propertyId: id, status: 'PENDING' },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: 'קיימת כבר בקשת העברה פתוחה לנכס זה' } });
    }

    const transfer = await prisma.propertyTransfer.create({
      data: {
        propertyId: id,
        fromAgentId: uid,
        toAgentId: recipient.id,
        toAgentEmail: recipient.email,
        message: body.message ?? null,
        status: 'PENDING',
      },
    });
    return { transfer };
  });

  // Log a WhatsApp-only transfer share (no ownership change, just for the log)
  app.post('/properties/:id/transfer/whatsapp', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== uid) {
      return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    const transfer = await prisma.propertyTransfer.create({
      data: {
        propertyId: id,
        fromAgentId: uid,
        status: 'WHATSAPP_SENT',
        respondedAt: new Date(),
      },
    });
    return { transfer };
  });

  // Accept (target agent).
  //
  // In addition to re-assigning the property's agentId, we carry the linked
  // Owner card across to the new agent so the recipient doesn't land on a
  // property with a missing/foreign owner record. The rules:
  //
  //   1. No Owner linked → nothing extra to do.
  //   2. Receiving agent already has an Owner with the same phone
  //      (phone = dedupe key elsewhere in the codebase) → merge: relink
  //      the property to that existing Owner. Delete the sender's Owner
  //      only if the transferred property was its sole link.
  //   3. Sender's Owner has no other properties under the sender →
  //      reassign the Owner wholesale (cheaper than cloning).
  //   4. Sender's Owner is linked to other non-transferred properties →
  //      clone the card into the receiving agent's space so the sender
  //      keeps their record intact.
  app.post('/transfers/:id/accept', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const t = await prisma.propertyTransfer.findUnique({ where: { id } });
    if (!t || t.toAgentId !== uid) return reply.code(404).send({ error: { message: 'Not found' } });
    if (t.status !== 'PENDING') return reply.code(409).send({ error: { message: 'לא בהמתנה' } });

    const property = await prisma.property.findUnique({
      where: { id: t.propertyId },
      include: { propertyOwner: true },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Not found' } });

    const updated = await prisma.$transaction(async (tx) => {
      const owner = property.propertyOwner;
      let newPropertyOwnerId: string | null = property.propertyOwnerId;

      if (owner) {
        const otherLinksUnderSender = await tx.property.count({
          where: {
            propertyOwnerId: owner.id,
            agentId: t.fromAgentId,
            NOT: { id: property.id },
          },
        });

        const existingForReceiver = owner.phone
          ? await tx.owner.findFirst({
              where: { agentId: uid, phone: owner.phone },
            })
          : null;

        if (existingForReceiver) {
          // (2) Merge into the receiver's existing card.
          newPropertyOwnerId = existingForReceiver.id;
          if (otherLinksUnderSender === 0) {
            // The sender's card is orphaned now — drop it so it doesn't
            // linger in the sender's Owners list with zero properties.
            await tx.owner.delete({ where: { id: owner.id } }).catch(() => {});
          }
        } else if (otherLinksUnderSender === 0) {
          // (3) Sole link — reassign the Owner to the receiver.
          await tx.owner.update({
            where: { id: owner.id },
            data: { agentId: uid },
          });
          // newPropertyOwnerId unchanged — same row, new agent.
        } else {
          // (4) Sender keeps their card; clone for the receiver.
          const clone = await tx.owner.create({
            data: {
              agentId: uid,
              name: owner.name,
              phone: owner.phone,
              email: owner.email,
              notes: owner.notes,
              relationship: owner.relationship,
            },
          });
          newPropertyOwnerId = clone.id;
        }
      }

      await tx.property.update({
        where: { id: property.id },
        data: {
          agentId: uid,
          propertyOwnerId: newPropertyOwnerId,
        },
      });

      return tx.propertyTransfer.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
    });
    return { transfer: updated };
  });

  // Decline (target agent)
  app.post('/transfers/:id/decline', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const t = await prisma.propertyTransfer.findUnique({ where: { id } });
    if (!t || t.toAgentId !== uid) return reply.code(404).send({ error: { message: 'Not found' } });
    if (t.status !== 'PENDING') return reply.code(409).send({ error: { message: 'לא בהמתנה' } });
    const updated = await prisma.propertyTransfer.update({
      where: { id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return { transfer: updated };
  });

  // Cancel (sender)
  app.post('/transfers/:id/cancel', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const t = await prisma.propertyTransfer.findUnique({ where: { id } });
    if (!t || t.fromAgentId !== uid) return reply.code(404).send({ error: { message: 'Not found' } });
    if (t.status !== 'PENDING') return reply.code(409).send({ error: { message: 'לא בהמתנה' } });
    const updated = await prisma.propertyTransfer.update({
      where: { id },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    return { transfer: updated };
  });
};
