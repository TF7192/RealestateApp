// Prospect intake — per-property lead capture with signature.
//
// Two flows share the same record shape:
//   1. In-person: the agent fills the form on their phone / laptop,
//      the prospect draws their signature on the canvas right there.
//      POST /properties/:id/prospects with the full payload (incl. signatureDataUrl).
//
//   2. Digital: the agent starts a record with name/phone only and
//      gets a short-lived public link (`publicToken`) the prospect
//      opens on their own phone to sign. The kiosk page is at
//      /public/p/:token (frontend) and POSTs to this backend's
//      /prospects/public/:token endpoint to attach the signature.
//
// Each completed prospect counts toward the property's "visits + inquiries"
// tile on PropertyDetail — the UI computes the combined number from
// `viewings.count + inquiries.count + prospects.count`.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

const ProspectInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  source: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  // Data-URL string, e.g. "data:image/png;base64,iVBORw0KG..."; max 500kB
  // after base64 overhead (~375kB raw PNG). Bigger signatures are signs
  // of an accidentally-giant canvas, not a genuine need.
  signatureDataUrl: z.string().max(500_000).optional(),
});

const PUBLIC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export const registerProspectRoutes: FastifyPluginAsync = async (app) => {
  // List prospects for a property.
  app.get('/properties/:propertyId/prospects', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const items = await prisma.prospect.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  });

  // Create an in-person prospect (agent + prospect co-located; signature
  // is captured right there on the canvas).
  app.post('/properties/:propertyId/prospects', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const parsed = ProspectInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: parsed.error.issues[0]?.message || 'Invalid input' } });
    }
    const { signatureDataUrl, email, ...rest } = parsed.data;
    const prospect = await prisma.prospect.create({
      data: {
        propertyId,
        agentId: u.id,
        ...rest,
        email: email || null,
        signatureDataUrl: signatureDataUrl || null,
        signedAt: signatureDataUrl ? new Date() : null,
      },
    });
    return { prospect };
  });

  // Create a digital prospect — returns a publicToken the agent can
  // share with the prospect. The record lives without a signature
  // until the prospect visits /public/p/:token and signs.
  app.post('/properties/:propertyId/prospects/digital', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    // Minimal shape: name + phone are required up-front so the agent
    // has something to refer to while the link is out.
    const InitShape = z.object({
      name: z.string().min(1).max(120),
      phone: z.string().max(40).optional(),
    });
    const parsed = InitShape.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'name required' } });
    }
    const publicToken = crypto.randomBytes(24).toString('base64url');
    const prospect = await prisma.prospect.create({
      data: {
        propertyId,
        agentId: u.id,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        publicToken,
        tokenExpiresAt: new Date(Date.now() + PUBLIC_TOKEN_TTL_MS),
      },
    });
    const origin = process.env.PUBLIC_ORIGIN || 'https://estia.tripzio.xyz';
    return {
      prospect,
      signUrl: `${origin}/public/p/${publicToken}`,
    };
  });

  // Public sign endpoint — no auth, gated by the unguessable token.
  // Accepts the signed payload and stamps signedAt; token then expires
  // so the link can't be re-signed.
  app.get('/prospects/public/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const prospect = await prisma.prospect.findUnique({ where: { publicToken: token } });
    if (!prospect) return reply.code(404).send({ error: { message: 'Link not found' } });
    if (prospect.tokenExpiresAt && prospect.tokenExpiresAt.getTime() < Date.now()) {
      return reply.code(410).send({ error: { message: 'Link expired' } });
    }
    const property = await prisma.property.findUnique({
      where: { id: prospect.propertyId },
      select: { street: true, city: true, type: true, marketingPrice: true },
    });
    return {
      prospect: {
        id: prospect.id,
        name: prospect.name,
        phone: prospect.phone,
        email: prospect.email,
        signed: !!prospect.signedAt,
      },
      property,
    };
  });

  app.post('/prospects/public/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const existing = await prisma.prospect.findUnique({ where: { publicToken: token } });
    if (!existing) return reply.code(404).send({ error: { message: 'Link not found' } });
    if (existing.tokenExpiresAt && existing.tokenExpiresAt.getTime() < Date.now()) {
      return reply.code(410).send({ error: { message: 'Link expired' } });
    }
    if (existing.signedAt) {
      return reply.code(409).send({ error: { message: 'Already signed' } });
    }
    const parsed = ProspectInput.partial({ name: true }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid input' } });
    }
    const { signatureDataUrl, email, ...rest } = parsed.data;
    if (!signatureDataUrl) return reply.code(400).send({ error: { message: 'Signature required' } });
    const updated = await prisma.prospect.update({
      where: { id: existing.id },
      data: {
        ...rest,
        email: email || null,
        signatureDataUrl,
        signedAt: new Date(),
        // Burn the token — one-time use.
        publicToken: null,
        tokenExpiresAt: null,
      },
    });
    return { ok: true, prospect: { id: updated.id, signed: true } };
  });

  // Delete — agent only.
  app.delete('/properties/:propertyId/prospects/:id', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { propertyId, id } = req.params as { propertyId: string; id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const existing = await prisma.prospect.findUnique({ where: { id } });
    if (!existing || existing.propertyId !== propertyId || existing.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.prospect.delete({ where: { id } });
    return { ok: true };
  });
};
