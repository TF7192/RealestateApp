// Public sign-by-link surface for Contract.
//
// Endpoints (mounted under `/api/public/contracts`):
//   GET    /:token        — review payload (contract + agent + clauses)
//   POST   /:token/sign   — capture signature + lock the row
//   GET    /:token/pdf    — download the (signed) PDF
//
// No auth gate — the 24-byte token is the access control. Token is
// generated at contract-create time and expires 30 days later. Once
// signed, the row is locked: subsequent POSTs return 409.
//
// This route file lives alongside `contracts.ts` rather than inside it
// because (a) the auth posture is fundamentally different — every other
// contracts handler is `requireAgent`, these are public — and (b) the
// public payload shape is a deliberately narrowed projection of the
// internal Contract row (no agent PII leakage beyond what the signer
// legally needs to see).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { extractClientIp, renderContractPdf } from './contracts.js';

const FONTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'fonts'
);
const FONT_REG  = path.join(FONTS_DIR, 'NotoSansHebrew-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'NotoSansHebrew-Bold.ttf');

// 200KB cap on the inbound signature PNG. A reasonable hand-drawn
// signature from the kiosk canvas (~600x180 px @ 2x DPR) lands at
// 15-50KB; anything bigger is either a screenshot or a malicious
// payload trying to bloat the row.
const MAX_SIG_BYTES = 200 * 1024;

const SignInput = z.object({
  signatureDataUrl: z.string().min(40).max(280_000), // ~200KB base64-padded
  signerName: z.string().min(1).max(120).optional(),
  signerIdType: z.enum(['ID', 'PASSPORT']).optional(),
  signerIdNumber: z.string().max(40).optional(),
  signerAddress: z.string().max(300).optional(),
  signerEmail: z.string().email().max(200).optional().or(z.literal('')),
  notes: z.string().max(2_000).optional(),
  consentAccepted: z.literal(true),
});

function computeSignatureHash(contractId: string, signerName: string, signedAtIso: string): string {
  return crypto.createHash('sha256')
    .update(`${contractId}\n${signerName}\n${signedAtIso}`)
    .digest('hex');
}

export const registerContractPublicRoutes: FastifyPluginAsync = async (app) => {
  // GET — review payload. Returns 404 for unknown / expired tokens, 410
  // Gone once the contract is signed (the token is intentionally NOT
  // burned on sign so the customer can re-pull the same payload after
  // success, but the POST is locked).
  app.get('/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const contract = await prisma.contract.findUnique({
      where: { publicSignToken: token },
    });
    if (!contract) {
      return reply.code(404).send({ error: { message: 'הקישור לא נמצא' } });
    }
    if (contract.publicSignTokenExpiresAt
        && contract.publicSignTokenExpiresAt.getTime() < Date.now()) {
      return reply.code(404).send({ error: { message: 'הקישור פג' } });
    }
    if (contract.signedAt) {
      return reply.code(410).send({ error: { message: 'ההסכם כבר נחתם' } });
    }

    const agent = await prisma.user.findUnique({
      where: { id: contract.agentId },
      select: {
        displayName: true,
        email: true,
        phone: true,
        agentProfile: {
          select: {
            agency: true,
            license: true,
            personalId: true,
            businessAddress: true,
          },
        },
      },
    });

    // Hydrate base BROKERAGE order for EXCLUSIVITY addenda so the
    // sign UI can render the "supplements order #XXX" reference.
    let baseContract: { id: string; signedAt: Date | null; createdAt: Date } | null = null;
    if (contract.baseContractId) {
      const b = await prisma.contract.findUnique({
        where: { id: contract.baseContractId },
        select: { id: true, signedAt: true, createdAt: true },
      });
      if (b) baseContract = b;
    }

    return {
      contract: {
        id:                  contract.id,
        type:                contract.type,
        title:               contract.title,
        body:                contract.body,
        signerName:          contract.signerName,
        signerPhone:         contract.signerPhone,
        signerEmail:         contract.signerEmail,
        propertiesSnapshot:  contract.propertiesSnapshot,
        baseContractId:      contract.baseContractId,
        createdAt:           contract.createdAt,
      },
      agent: agent ? {
        displayName:     agent.displayName,
        email:           agent.email,
        phone:           agent.phone,
        agency:          agent.agentProfile?.agency          || null,
        licenseNumber:   agent.agentProfile?.license         || null,
        idNumber:        agent.agentProfile?.personalId      || null,
        businessAddress: agent.agentProfile?.businessAddress || null,
      } : null,
      baseContract,
    };
  });

  // POST /:token/sign — lock the row.
  app.post('/:token/sign', async (req, reply) => {
    const { token } = req.params as { token: string };
    const existing = await prisma.contract.findUnique({
      where: { publicSignToken: token },
    });
    if (!existing) {
      return reply.code(404).send({ error: { message: 'הקישור לא נמצא' } });
    }
    if (existing.publicSignTokenExpiresAt
        && existing.publicSignTokenExpiresAt.getTime() < Date.now()) {
      return reply.code(404).send({ error: { message: 'הקישור פג' } });
    }
    if (existing.signedAt) {
      return reply.code(409).send({ error: { message: 'ההסכם כבר נחתם' } });
    }

    const parsed = SignInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { message: 'Invalid request body', issues: parsed.error.issues },
      });
    }
    const input = parsed.data;

    // Size cap on the data-URL. base64 expands payload ~4/3 so we cap
    // the on-the-wire string length, not the decoded byte count.
    if (input.signatureDataUrl.length > MAX_SIG_BYTES * 1.4) {
      return reply.code(413).send({ error: { message: 'החתימה גדולה מדי' } });
    }
    if (!input.signatureDataUrl.startsWith('data:image/')) {
      return reply.code(400).send({ error: { message: 'פורמט חתימה לא תקין' } });
    }

    const finalSignerName = (input.signerName?.trim()) || existing.signerName;
    const signedAt = new Date();
    const signatureHash = computeSignatureHash(
      existing.id, finalSignerName, signedAt.toISOString(),
    );
    const signedIp = extractClientIp(req as { ip?: string; headers: Record<string, unknown> });
    const ua = req.headers['user-agent'];
    const signedUserAgent = typeof ua === 'string' ? ua.slice(0, 200) : null;

    // Consent snapshot — kept verbatim so we can prove what the signer
    // accepted, even if the kiosk wording changes later. Matches the
    // checkbox label rendered on the public sign page.
    const consentText =
      'בחתימתי אני מאשר/ת את תוכן ההסכם ואת מדיניות הפרטיות';

    // Build the "notes" persistence — we glue the structured identity
    // fields into the row's consentText prefix so existing audit-trail
    // rendering picks them up without a schema explosion. The notes
    // field is the only one with free-form text; everything else is
    // structured.
    const identityBits: string[] = [];
    if (input.signerIdType && input.signerIdNumber) {
      identityBits.push(
        `${input.signerIdType === 'PASSPORT' ? 'דרכון' : 'ת.ז.'} ${input.signerIdNumber}`,
      );
    }
    if (input.signerAddress) identityBits.push(`כתובת: ${input.signerAddress}`);
    if (input.signerEmail)   identityBits.push(`דוא״ל: ${input.signerEmail}`);
    if (input.notes)         identityBits.push(`הערות: ${input.notes}`);
    const consentTextFinal = identityBits.length
      ? `${consentText} · ${identityBits.join(' · ')}`
      : consentText;

    const updated = await prisma.contract.update({
      where: { id: existing.id },
      data: {
        signedAt,
        signatureName:     finalSignerName,
        signatureHash,
        signedIp,
        signedUserAgent,
        consentText:       consentTextFinal,
        consentAcceptedAt: signedAt,
        signatureImage:    input.signatureDataUrl,
      },
    });

    return {
      contract: {
        id:            updated.id,
        signedAt:      updated.signedAt,
        signatureName: updated.signatureName,
        signatureHash: updated.signatureHash,
      },
    };
  });

  // GET /:token/pdf — public PDF download. Reuses the same renderer as
  // the agent-side route; access control is the token + (optionally)
  // signed-status — we serve the signed PDF after sign so the customer
  // can download a copy from the thank-you panel.
  app.get('/:token/pdf', async (req, reply) => {
    const { token } = req.params as { token: string };
    const contract = await prisma.contract.findUnique({
      where: { publicSignToken: token },
    });
    if (!contract) {
      return reply.code(404).send({ error: { message: 'הקישור לא נמצא' } });
    }
    if (contract.publicSignTokenExpiresAt
        && contract.publicSignTokenExpiresAt.getTime() < Date.now()
        && !contract.signedAt) {
      // Expired but not yet signed — refuse. After-sign downloads are
      // allowed indefinitely (the signer needs their copy).
      return reply.code(404).send({ error: { message: 'הקישור פג' } });
    }
    const agent = await prisma.user.findUnique({
      where: { id: contract.agentId },
      select: {
        displayName: true, email: true, phone: true,
        agentProfile: {
          select: {
            agency: true, license: true, personalId: true, businessAddress: true,
          },
        },
      },
    });
    if (!fs.existsSync(FONT_REG) || !fs.existsSync(FONT_BOLD)) {
      return reply.code(500).send({ error: { message: 'PDF fonts missing on server' } });
    }
    let baseContract: { id: string; signedAt: Date | null; createdAt: Date } | null = null;
    if (contract.baseContractId) {
      const b = await prisma.contract.findUnique({
        where: { id: contract.baseContractId },
        select: { id: true, signedAt: true, createdAt: true },
      });
      if (b) baseContract = b;
    }
    const buf = await renderContractPdf(
      {
        ...contract,
        propertiesSnapshot: contract.propertiesSnapshot as never,
        baseContract,
        signatureImage: contract.signatureImage ?? null,
      },
      agent,
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="contract-${contract.id}.pdf"`)
      .header('Cache-Control', 'private, no-store');
    return reply.send(buf);
  });
};
