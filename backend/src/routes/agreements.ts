import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { putUpload, resolveUpload } from '../lib/storage.js';

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
    const ext = path.extname(file.filename) || '.pdf';
    const name = `${crypto.randomUUID()}${ext}`;
    const key = `agreements/${id}/${name}`;
    const buffer = await file.toBuffer();
    await putUpload(key, buffer, file.mimetype);
    const rel = key;
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

  // Downloadable PDF — either the uploaded signed file (preferred)
  // or a server-rendered pdfkit draft that captures the core fields
  // so the agent always has something to send. Inline `Content-
  // Disposition: attachment` so browsers trigger a save.
  app.get('/:id/pdf', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const agreement = await prisma.agreement.findUnique({
      where: { id },
      include: {
        file: true,
        property: { select: { street: true, city: true } },
        lead: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!agreement) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }

    // If the agent already uploaded a signed PDF, serve it. resolveUpload
    // returns { kind: 'redirect', url } in S3 prod and { kind: 'file',
    // path } in local dev — handle both.
    if (agreement.file) {
      const resolved = await resolveUpload(agreement.file.path);
      if (resolved.kind === 'redirect') {
        return reply.redirect(resolved.url);
      }
      try {
        const buf = await fs.readFile(resolved.path);
        reply.header('Content-Type', agreement.file.mimeType || 'application/pdf');
        reply.header(
          'Content-Disposition',
          `attachment; filename="${agreement.file.originalName || `agreement-${agreement.id}.pdf`}"`,
        );
        return reply.send(buf);
      } catch {
        // Fall through to the generated PDF if the file went missing.
      }
    }

    // Otherwise render a minimal brokerage-agreement PDF on the fly.
    // Same pdfkit recipe the prospect-pdf route uses; Hebrew text is
    // drawn RTL via the shared util (kept inline here — the prospect
    // path exports its own copy and we don't want to pull it in via
    // a cross-route import just for a heading).
    const doc = new PDFDocument({ size: 'A4', margin: 64 });
    reply.header('Content-Type', 'application/pdf');
    reply.header(
      'Content-Disposition',
      `attachment; filename="agreement-${agreement.id}.pdf"`,
    );
    reply.send(doc);

    const statusLabel =
      agreement.status === 'SIGNED' ? 'נחתם' :
      agreement.status === 'SENT' ? 'ממתין לחתימה' :
      agreement.status === 'EXPIRED' ? 'פג תוקף' :
      agreement.status === 'CANCELLED' ? 'בוטל' :
      agreement.status;

    doc.fontSize(18).text('הסכם תיווך', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#6b6356').text(
      `Agreement ID: ${agreement.id}`,
      { align: 'left' },
    );
    doc.moveDown(1);
    doc.fillColor('#1e1a14').fontSize(12);
    const lines: Array<[string, string]> = [
      ['חותם',    agreement.signerName],
      ['טלפון',   agreement.signerPhone || '—'],
      ['אימייל',  agreement.signerEmail || '—'],
      ['סטטוס',   statusLabel],
      ['נשלח',    agreement.sentAt.toISOString().slice(0, 10)],
      ['נחתם',    agreement.signedAt ? agreement.signedAt.toISOString().slice(0, 10) : '—'],
    ];
    if (agreement.property) {
      lines.push(['נכס', [agreement.property.street, agreement.property.city].filter(Boolean).join(', ')]);
    }
    if (agreement.lead) {
      lines.push(['ליד', agreement.lead.name]);
    }
    for (const [k, v] of lines) {
      doc.text(`${k}: ${v}`, { align: 'right' });
    }
    if (agreement.note) {
      doc.moveDown(0.7);
      doc.fontSize(11).fillColor('#6b6356').text('הערות', { align: 'right' });
      doc.fontSize(11).fillColor('#1e1a14').text(agreement.note, { align: 'right' });
    }
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#6b6356').text(
      `טיוטת הסכם — הופק אוטומטית על ידי Estia. יש לחתום על גרסה סופית לפני העברה.`,
      { align: 'right' },
    );
    doc.end();
  });
};
