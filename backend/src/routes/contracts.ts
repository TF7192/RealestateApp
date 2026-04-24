// Sprint 6 / ScreenContract — In-house digital contract e-sign flow.
//
// Contracts (exclusivity / brokerage / offer) are rendered and signed
// entirely inside Estia using the same pdfkit + Noto Sans Hebrew path
// already proven by prospect-pdf. No DocuSign / HelloSign / third-party
// vendor — the agent's clients sign by typing their name, the server
// stamps a SHA-256 hash + timestamp, and the row is permanently locked.
//
// Endpoints (mounted under `/api/contracts`):
//   POST   /                     — create a draft contract (unsigned)
//   GET    /                     — list agent's contracts
//   GET    /:id                  — fetch a contract (with pdfUrl)
//   GET    /:id/pdf              — render the signed/unsigned PDF
//   POST   /:id/sign             — stamp signature + lock the row
//
// All endpoints are agent-scoped: cross-agent reads return 404, signing
// a row twice returns 409 (signed-lock).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

// Same bidi-aware RTL shim as prospect-pdf — reverse the digit-
// containing LTR runs before pdfkit's whole-string rtla flip so phone
// numbers + dates land right-side-up.
const HEBREW_RE = /[֐-׿יִ-ﭏ₪]/;
function rtl(text: string): string {
  if (!text) return '';
  if (!HEBREW_RE.test(text)) return text;
  return text.replace(/[A-Za-z0-9_\-@.,/:+#%]+/g, (run) => {
    if (!/\d/.test(run)) return run;
    return run.split('').reverse().join('');
  });
}

const FONTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'fonts'
);
const FONT_REG  = path.join(FONTS_DIR, 'NotoSansHebrew-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'NotoSansHebrew-Bold.ttf');

// Default contract body, per type. The agent can override any of these
// when creating a contract; these are the fallbacks so the first-run
// UX doesn't force the agent to draft Hebrew legalese from scratch.
const DEFAULT_BODIES: Record<string, string> = {
  EXCLUSIVITY: [
    'אני הח"מ, בעל הזכויות בנכס שבנדון, מעניק/ה בזאת בלעדיות מלאה למתווך ' +
      'לתקופה של 6 חודשים מיום חתימת הסכם זה.',
    'במהלך תקופת הבלעדיות, לא אתקשר במישרין או בעקיפין עם מתווך אחר, ' +
      'ואפנה כל פונה ישירות למתווך החתום.',
    'עמלת התיווך המוסכמת הינה 2% + מע"מ ממחיר המכירה בפועל.',
    'הסכם זה ייחשב כמופר אם הנכס יימכר במהלך תקופת הבלעדיות שלא באמצעות ' +
      'המתווך.',
  ].join('\n\n'),
  BROKERAGE: [
    'אני הח"מ מאשר/ת כי המתווך הציג בפניי את הנכס שבנדון, וכי פרטי הנכס ' +
      'ועלויותיו הובהרו לי במלואם.',
    'ידוע לי כי המתווך פועל לפי חוק המתווכים במקרקעין, התשנ"ו-1996, וכי ' +
      'עמלת התיווך תשולם אך ורק במקרה של עסקה שתוצאה ישירה של פעילות ' +
      'המתווך.',
    'אני מתחייב/ת שלא להתקשר ישירות עם בעלי הנכס או עם צדדים שלישיים ' +
      'בקשר לנכס מבלי ליידע את המתווך.',
  ].join('\n\n'),
  OFFER: [
    'אני הח"מ מציע/ה לרכוש את הנכס שבנדון בתמורה לסכום הנקוב להלן.',
    'הצעה זו תקפה לתקופה של 7 ימים מיום חתימתה, ומותנית בקבלת משכנתא ' +
      'ובבדיקת רישום הזכויות בנכס.',
    'במידה וההצעה תתקבל, אני מתחייב/ת לחתום על זכרון דברים תוך 14 יום.',
  ].join('\n\n'),
};

function contractTypeLabel(type: string): string {
  if (type === 'EXCLUSIVITY') return 'הסכם בלעדיות';
  if (type === 'BROKERAGE')   return 'הסכם תיווך';
  if (type === 'OFFER')       return 'הצעת רכישה';
  return 'חוזה';
}

function formatIlDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

// Deterministic tamper-evident hash printed on the signed badge. NOT a
// cryptographic signature in the legal sense — it's a visible change-
// detector so the agent can notice if the stored row was meddled with.
function computeSignatureHash(
  contractId: string, signerName: string, signedAt: Date
): string {
  const data = `${contractId}|${signerName}|${signedAt.toISOString()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Validation schemas. Bodies are bounded so a rogue payload can't blow
// up the PDF buffer size.
const CreateInput = z.object({
  type: z.enum(['EXCLUSIVITY', 'BROKERAGE', 'OFFER']),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20_000).optional(),
  signerName: z.string().min(1).max(120),
  signerPhone: z.string().max(40).optional(),
  signerEmail: z.string().email().max(200).optional().or(z.literal('')),
  propertyId: z.string().optional(),
  leadId: z.string().optional(),
});

const SignInput = z.object({
  signatureName: z.string().min(2).max(120),
});

// Render the contract to a PDF Buffer. Shared between the signed and
// unsigned fetch paths — the unsigned PDF just omits the signature
// block.
async function renderContractPdf(contract: {
  id: string;
  type: string;
  title: string;
  body: string;
  signerName: string;
  signerPhone: string | null;
  signerEmail: string | null;
  signedAt: Date | null;
  signatureName: string | null;
  signatureHash: string | null;
  createdAt: Date;
}, agent: {
  displayName: string | null;
  email: string | null;
  phone: string | null;
  agentProfile: {
    agency: string | null;
    license: string | null;
    personalId: string | null;
    businessAddress: string | null;
  } | null;
} | null): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  doc.registerFont('He',      FONT_REG);
  doc.registerFont('He-Bold', FONT_BOLD);
  doc.font('He');

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const M = 48;
  const innerW = PAGE_W - M * 2;

  // Brand palette — matches the web app + prospect-pdf.
  const GOLD       = '#b48b4c';
  const GOLD_DEEP  = '#7a5c2c';
  const INK        = '#1e1a14';
  const INK_SOFT   = '#555';
  const INK_MUTED  = '#888';
  const RULE_LIGHT = '#e5e7eb';

  // Header band — gold diamond logo + Estia wordmark on top-left,
  // agent block on the right.
  const HEADER_TOP = M;
  const LOGO_SIZE = 28;
  const logoX = M;
  const logoCy = HEADER_TOP + LOGO_SIZE / 2;
  doc.save();
  doc.fillColor(GOLD);
  doc.moveTo(logoX + LOGO_SIZE / 2, HEADER_TOP)
     .lineTo(logoX + LOGO_SIZE,      logoCy)
     .lineTo(logoX + LOGO_SIZE / 2, HEADER_TOP + LOGO_SIZE)
     .lineTo(logoX,                  logoCy)
     .closePath()
     .fill();
  doc.fillColor('#fff');
  const inset = 6;
  doc.moveTo(logoX + LOGO_SIZE / 2,       HEADER_TOP + inset)
     .lineTo(logoX + LOGO_SIZE - inset,   logoCy)
     .lineTo(logoX + LOGO_SIZE / 2,       HEADER_TOP + LOGO_SIZE - inset)
     .lineTo(logoX + inset,               logoCy)
     .closePath()
     .fill();
  doc.restore();

  doc.fillColor(INK).font('He-Bold').fontSize(16)
     .text('Estia', logoX + LOGO_SIZE + 8, HEADER_TOP + 3, { lineBreak: false });

  const RIGHT_COL_W = 300;
  const rightColX = PAGE_W - M - RIGHT_COL_W;
  let ry = HEADER_TOP;
  doc.font('He-Bold').fontSize(12).fillColor(INK);
  doc.text(rtl(agent?.displayName || '—'), rightColX, ry, {
    width: RIGHT_COL_W, align: 'right', features: ['rtla', 'rtlm'],
  });
  ry = doc.y + 1;

  const subBits: string[] = [];
  if (agent?.agentProfile?.agency)          subBits.push(agent.agentProfile.agency);
  if (agent?.agentProfile?.businessAddress) subBits.push(agent.agentProfile.businessAddress);
  doc.font('He').fontSize(9).fillColor(INK_SOFT);
  if (subBits.length) {
    doc.text(rtl(subBits.join(' · ')), rightColX, ry, {
      width: RIGHT_COL_W, align: 'right', features: ['rtla', 'rtlm'],
    });
    ry = doc.y + 1;
  }

  const contactBits: string[] = [];
  if (agent?.phone)                    contactBits.push(`טל׳ ${agent.phone}`);
  if (agent?.email)                    contactBits.push(agent.email);
  if (agent?.agentProfile?.license)    contactBits.push(`מ.ר. ${agent.agentProfile.license}`);
  if (contactBits.length) {
    doc.fontSize(8.5).fillColor(INK_MUTED);
    doc.text(rtl(contactBits.join(' · ')), rightColX, ry, {
      width: RIGHT_COL_W, align: 'right', features: ['rtla', 'rtlm'],
    });
    ry = doc.y;
  }

  const headerBottom = Math.max(HEADER_TOP + LOGO_SIZE + 6, ry + 6);
  doc.strokeColor(GOLD).lineWidth(1.25)
     .moveTo(M, headerBottom).lineTo(PAGE_W - M, headerBottom).stroke();
  doc.y = headerBottom + 14;

  // Title — type label + agent's custom title.
  doc.font('He-Bold').fontSize(20).fillColor(INK);
  doc.text(rtl(contractTypeLabel(contract.type)), M, doc.y, {
    width: innerW, align: 'center', features: ['rtla', 'rtlm'],
  });
  if (contract.title && contract.title !== contractTypeLabel(contract.type)) {
    doc.font('He').fontSize(11).fillColor(GOLD_DEEP);
    doc.text(rtl(contract.title), M, doc.y + 2, {
      width: innerW, align: 'center', features: ['rtla', 'rtlm'],
    });
  }

  // Short gold rule.
  const titleRuleY = doc.y + 8;
  const ruleW = 64;
  doc.strokeColor(GOLD).lineWidth(1.5)
     .moveTo((PAGE_W - ruleW) / 2, titleRuleY)
     .lineTo((PAGE_W + ruleW) / 2, titleRuleY)
     .stroke();
  doc.y = titleRuleY + 18;

  // Signer block.
  doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
  doc.text(rtl('פרטי החותם'), M, doc.y, {
    width: innerW, align: 'right', features: ['rtla', 'rtlm'],
  });
  doc.font('He').fontSize(10).fillColor(INK);
  const signerBits: string[] = [`שם: ${contract.signerName}`];
  if (contract.signerPhone) signerBits.push(`טלפון: ${contract.signerPhone}`);
  if (contract.signerEmail) signerBits.push(`דוא״ל: ${contract.signerEmail}`);
  for (const line of signerBits) {
    doc.text(rtl(line), M, doc.y + 2, {
      width: innerW, align: 'right', features: ['rtla', 'rtlm'],
    });
  }
  doc.moveDown(0.8);

  // Body — split into paragraphs on blank lines.
  doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
  doc.text(rtl('תנאי החוזה'), M, doc.y, {
    width: innerW, align: 'right', features: ['rtla', 'rtlm'],
  });
  doc.font('He').fontSize(10).fillColor(INK);
  const paragraphs = contract.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const para of paragraphs) {
    doc.text(rtl(para), M, doc.y + 4, {
      width: innerW, align: 'right', features: ['rtla', 'rtlm'],
      paragraphGap: 4, lineGap: 1.5,
    });
  }
  doc.moveDown(0.8);

  // Signature block — only when signed.
  if (contract.signedAt && contract.signatureName) {
    doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
    doc.text(rtl('חתימה'), M, doc.y, {
      width: innerW, align: 'right', features: ['rtla', 'rtlm'],
    });
    // Type-to-sign: render the typed name in a script-ish style on a
    // baseline rule.
    const sigY = doc.y + 10;
    const sigCenter = PAGE_W / 2;
    const sigLineW = 220;
    doc.font('He-Bold').fontSize(18).fillColor(INK);
    doc.text(rtl(contract.signatureName), sigCenter - sigLineW / 2, sigY, {
      width: sigLineW, align: 'center', features: ['rtla', 'rtlm'],
    });
    const baselineY = sigY + 28;
    doc.strokeColor(INK_MUTED).lineWidth(0.5)
       .moveTo(sigCenter - sigLineW / 2, baselineY)
       .lineTo(sigCenter + sigLineW / 2, baselineY).stroke();
    doc.font('He').fontSize(9).fillColor(INK_SOFT);
    doc.text(rtl(`נחתם: ${formatIlDateTime(contract.signedAt)}`), M, baselineY + 4, {
      width: innerW, align: 'center', features: ['rtla', 'rtlm'],
    });
    if (contract.signatureHash) {
      doc.fontSize(7.5).fillColor(INK_MUTED);
      doc.text(`Hash: ${contract.signatureHash.slice(0, 32)}…`, M, doc.y + 1, {
        width: innerW, align: 'center',
      });
    }
  } else {
    // Unsigned watermark.
    doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
    doc.text(rtl('טרם נחתם — המתן לחתימה דיגיטלית'), M, doc.y, {
      width: innerW, align: 'center', features: ['rtla', 'rtlm'],
    });
  }

  // Footer.
  const footerY = PAGE_H - M - 20;
  doc.strokeColor(RULE_LIGHT).lineWidth(0.5)
     .moveTo(M, footerY - 6).lineTo(PAGE_W - M, footerY - 6).stroke();
  doc.font('He').fontSize(8).fillColor(INK_MUTED);
  doc.text(rtl(`מזהה חוזה: ${contract.id}`), M, footerY, {
    width: innerW, align: 'center', features: ['rtla', 'rtlm'],
  });
  doc.text(rtl('נוצר אוטומטית באמצעות Estia · estia.co.il'), M, footerY + 10, {
    width: innerW, align: 'center', features: ['rtla', 'rtlm'],
  });

  doc.end();
  return done;
}

export const registerContractRoutes: FastifyPluginAsync = async (app) => {
  // List contracts for the authed agent. Optional filter by type or by
  // property so PropertyDetail can show just its contracts.
  app.get('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const q = req.query as { type?: string; propertyId?: string };
    const where: Record<string, unknown> = { agentId: u.id };
    if (q.type) where.type = q.type;
    if (q.propertyId) where.propertyId = q.propertyId;
    const items = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  });

  // Create a draft contract. Falls back to default body text by type.
  app.post('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const parsed = CreateInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid request body', issues: parsed.error.issues } });
    }
    const input = parsed.data;

    // Cross-agent guard on optional relation ids — don't let an agent
    // attach a contract to another agent's property / lead.
    if (input.propertyId) {
      const prop = await prisma.property.findUnique({
        where: { id: input.propertyId }, select: { agentId: true },
      });
      if (!prop || prop.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Property not found' } });
      }
    }
    if (input.leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId }, select: { agentId: true },
      });
      if (!lead || lead.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Lead not found' } });
      }
    }

    const contract = await prisma.contract.create({
      data: {
        agentId:     u.id,
        type:        input.type,
        title:       input.title ?? contractTypeLabel(input.type),
        body:        input.body ?? DEFAULT_BODIES[input.type] ?? '',
        signerName:  input.signerName,
        signerPhone: input.signerPhone ?? null,
        signerEmail: input.signerEmail && input.signerEmail !== '' ? input.signerEmail : null,
        propertyId:  input.propertyId ?? null,
        leadId:      input.leadId ?? null,
      },
    });
    return { contract };
  });

  // Fetch a single contract. Agent-scoped: cross-agent reads return 404.
  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract || contract.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    return {
      contract,
      pdfUrl: `/api/contracts/${id}/pdf`,
    };
  });

  // Render the contract PDF. Signed + unsigned variants share the
  // renderer; the unsigned one just omits the signature block.
  app.get('/:id/pdf', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract || contract.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
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
    const buf = await renderContractPdf(contract, agent);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="contract-${contract.id}.pdf"`)
      .header('Cache-Control', 'private, no-store');
    return reply.send(buf);
  });

  // Sign the contract. Stamps the signature name + hash + timestamp
  // and locks the row forever. Second-sign attempts return 409.
  app.post('/:id/sign', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const parsed = SignInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid request body', issues: parsed.error.issues } });
    }
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract || contract.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    // Signed-lock — second sign attempt is a 409 Conflict so the client
    // can surface "already signed" cleanly instead of overwriting history.
    if (contract.signedAt) {
      return reply.code(409).send({
        error: { message: 'Contract already signed', code: 'already_signed' },
      });
    }
    const signedAt = new Date();
    const signatureName = parsed.data.signatureName.trim();
    const signatureHash = computeSignatureHash(contract.id, signatureName, signedAt);
    const updated = await prisma.contract.update({
      where: { id },
      data: { signedAt, signatureName, signatureHash },
    });
    return { contract: updated };
  });
};
