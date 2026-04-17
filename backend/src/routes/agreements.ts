import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const sendSchema = z.object({
  leadId: z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  signerName: z.string().min(1).max(120),
  signerPhone: z.string().max(40).nullable().optional(),
  signerEmail: z.string().email().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const registerAgreementRoutes: FastifyPluginAsync = async (app) => {
  // "Send agreement for digital signature"  — stubbed: records the request.
  // In production this would call DocuSign/Signwell; here we just mark it SENT.
  app.post('/send', { onRequest: [app.requireAgent] }, async (req) => {
    const body = sendSchema.parse(req.body);
    const agreement = await prisma.agreement.create({
      data: {
        leadId: body.leadId ?? null,
        propertyId: body.propertyId ?? null,
        signerName: body.signerName,
        signerPhone: body.signerPhone ?? null,
        signerEmail: body.signerEmail ?? null,
        note: body.note ?? null,
        status: 'SENT',
      },
    });
    return { agreement };
  });

  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q = req.query as any;
    const where: any = {};
    if (q.leadId) where.leadId = q.leadId;
    if (q.propertyId) where.propertyId = q.propertyId;
    const items = await prisma.agreement.findMany({
      where,
      include: { file: true },
      orderBy: { sentAt: 'desc' },
    });
    return { items };
  });

  // Upload the signed file (PDF) — gets attached to the agreement.
  app.post('/:id/upload', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const agreement = await prisma.agreement.findUnique({ where: { id } });
    if (!agreement) return reply.code(404).send({ error: { message: 'Not found' } });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    const subDir = path.join(uploadsDir, 'agreements', id);
    await fs.mkdir(subDir, { recursive: true });
    const ext = path.extname(file.filename) || '.pdf';
    const name = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(subDir, name);
    const buffer = await file.toBuffer();
    await fs.writeFile(filePath, buffer);
    const rel = path.relative(uploadsDir, filePath).replaceAll(path.sep, '/');
    const uploaded = await prisma.uploadedFile.create({
      data: {
        ownerId: requireUser(req).id,
        kind: 'signed_agreement',
        originalName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: buffer.byteLength,
        path: rel,
      },
    });
    const updated = await prisma.agreement.update({
      where: { id },
      data: {
        fileId: uploaded.id,
        status: 'SIGNED',
        signedAt: new Date(),
      },
      include: { file: true },
    });
    return { agreement: updated };
  });
};
