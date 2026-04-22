// Signed-agreement PDF + lead-linking endpoints.
//
// The public sign kiosk captures a signature + identity fields on the
// Prospect row. This route renders the signed brokerage-services
// agreement as a single-page A4 PDF the agent can download from the
// property page, and lets the agent link/unlink the prospect to an
// existing Lead in their CRM.
//
// PDF engine: pdfkit. MIT-licensed, ~500 KB install, no native deps.
// Noto Sans Hebrew is shipped alongside the code (SIL OFL). RTL
// shaping uses pdfkit's built-in rtla/rtlm OpenType features.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import PDFDocument from 'pdfkit';
import striptags from 'striptags';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

// Resolve fonts relative to this source file so both tsx-dev and
// compiled dist/ invocations find the TTFs.
const FONTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'fonts'
);
const FONT_REG  = path.join(FONTS_DIR, 'NotoSansHebrew-Regular.ttf');
const FONT_BOLD = path.join(FONTS_DIR, 'NotoSansHebrew-Bold.ttf');

// The agreement text the kiosk renders if the agent hasn't supplied
// their own brokerageTermsHtml. Rewritten in-house; do NOT copy from
// a competitor form. Mirrors the statutory duties under the
// Brokerage in Real Estate Act (1996) without borrowing another
// vendor's wording.
const DEFAULT_BROKERAGE_TERMS_HE = [
  'אני הח"מ מאשר/ת כי המתווך הציג בפניי את הנכס שבנדון, וכי פרטי הנכס ' +
    'ועלויותיו הובהרו לי במלואם.',
  'ידוע לי כי המתווך פועל לפי חוק המתווכים במקרקעין, התשנ"ו-1996, וכי ' +
    'עמלת התיווך תשולם אך ורק במקרה של עסקה שתוצאה ישירה של פעילות המתווך.',
  'אני מתחייב/ת שלא להתקשר ישירות עם בעלי הנכס או עם צדדים שלישיים ' +
    'בקשר לנכס מבלי ליידע את המתווך, ולשמור על סודיות מלאה לגבי פרטי ' +
    'הנכס שהועברו אליי.',
  'תוקף ההזמנה — שישה חודשים ממועד החתימה, אלא אם הוסכם אחרת בכתב.',
];

function transactionTypeLabel(assetClass: string | null | undefined, category: string | null | undefined): string {
  if (!assetClass || !category) return '—';
  const ac = assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים';
  const cat = category === 'RENT' ? 'השכרה' : 'מכירה';
  return `${cat} · ${ac}`;
}

function formatIlDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function formatIlDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

function formatPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  return new Intl.NumberFormat('he-IL').format(p) + ' ₪';
}

// Normalise Israeli-format phones/emails for auto-link matching.
function normalizePhone(p: string | null | undefined): string {
  if (!p) return '';
  return p.replace(/[^0-9]/g, '');
}

function normalizeEmail(e: string | null | undefined): string {
  if (!e) return '';
  return e.trim().toLowerCase();
}

/** Best-effort auto-link of a signed prospect to an existing Lead.
 *  Match rule: same agent, AND ( normalized phone exact match
 *  OR normalized email exact match ). If exactly one Lead matches,
 *  set prospect.leadId. Zero / many matches → leave null. */
export async function autoLinkProspectToLead(prospectId: string): Promise<string | null> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { id: true, agentId: true, phone: true, email: true, leadId: true },
  });
  if (!prospect || prospect.leadId) return null;
  const phone = normalizePhone(prospect.phone);
  const email = normalizeEmail(prospect.email);
  if (!phone && !email) return null;
  const candidates = await prisma.lead.findMany({
    where: { agentId: prospect.agentId },
    select: { id: true, phone: true, email: true },
  });
  const matches = candidates.filter((l) => {
    const lp = normalizePhone(l.phone);
    const le = normalizeEmail(l.email);
    return (phone && lp && phone === lp) || (email && le && email === le);
  });
  if (matches.length !== 1) return null;
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { leadId: matches[0].id },
  });
  return matches[0].id;
}

// Render Hebrew text. pdfkit doesn't have CSS-level "text-align right"
// in the obvious way for RTL scripts — you pass `features: ['rtla']`
// and `align: 'right'` and it shapes correctly right-to-left.
function rtlText(doc: PDFKit.PDFDocument, text: string, opts: PDFKit.Mixins.TextOptions = {}) {
  doc.text(text, {
    align: 'right',
    features: ['rtla', 'rtlm'],
    ...opts,
  });
}

// Strip HTML (from agentProfile.brokerageTermsHtml) and split into
// paragraphs for pdfkit. Collapses runs of whitespace.
function htmlToParagraphs(html: string): string[] {
  // Treat <br>, <p>, block-level closers as paragraph breaks.
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const stripped = striptags(normalized);
  return stripped
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export const registerProspectPdfRoutes: FastifyPluginAsync = async (app) => {
  // Render the signed agreement as a PDF. Only the owning agent of
  // the prospect's property can fetch it. 404 for unsigned prospects.
  app.get(
    '/prospects/:id/agreement.pdf',
    { onRequest: [app.requireAgent] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const u = getUser(req);
      if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });

      const prospect = await prisma.prospect.findUnique({
        where: { id },
        include: {
          property: {
            select: {
              id: true, agentId: true, type: true, street: true, city: true,
              neighborhood: true, marketingPrice: true,
              assetClass: true, category: true, agentCommissionPct: true,
            },
          },
        },
      });
      if (!prospect || prospect.property.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }
      if (!prospect.signedAt || !prospect.signatureDataUrl) {
        return reply.code(404).send({ error: { message: 'Not signed yet' } });
      }

      const agent = await prisma.user.findUnique({
        where: { id: prospect.property.agentId },
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
              brokerageTermsHtml: true,
            },
          },
        },
      });

      // Assemble content strings up-front so layout stays scan-able.
      const orderNumber = prospect.orderNumber ?? 0;
      const signedAt    = prospect.signedAt!;
      const validUntil  = new Date(signedAt.getTime() + 1000 * 60 * 60 * 24 * 30 * 6); // ~6 months
      const commissionPct = prospect.property.agentCommissionPct;
      const commissionText = commissionPct != null
        ? `${commissionPct.toFixed(2)}% + מע״מ`
        : 'כמוסכם';

      const terms = agent?.agentProfile?.brokerageTermsHtml
        ? htmlToParagraphs(agent.agentProfile.brokerageTermsHtml)
        : DEFAULT_BROKERAGE_TERMS_HE;

      // Build the PDF in-memory so we can stream a single Buffer out.
      // pdfkit insists on a File backend if you call .pipe() to fs;
      // collecting via events keeps everything async-friendly.
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      if (fs.existsSync(FONT_REG))  doc.registerFont('He',      FONT_REG);
      if (fs.existsSync(FONT_BOLD)) doc.registerFont('He-Bold', FONT_BOLD);
      doc.font(fs.existsSync(FONT_REG) ? 'He' : 'Helvetica');

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      const PAGE_W = doc.page.width;
      const M = 40;
      const innerW = PAGE_W - M * 2;

      // Header band — agent identity.
      doc.fontSize(10).fillColor('#111');
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      rtlText(doc, agent?.displayName || '—', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      const headerBits: string[] = [];
      if (agent?.agentProfile?.agency)          headerBits.push(agent.agentProfile.agency);
      if (agent?.agentProfile?.businessAddress) headerBits.push(agent.agentProfile.businessAddress);
      if (agent?.phone)                         headerBits.push(`טל׳ ${agent.phone}`);
      if (agent?.agentProfile?.license)         headerBits.push(`מ.ר. ${agent.agentProfile.license}`);
      if (agent?.agentProfile?.personalId)      headerBits.push(`ת.ז. ${agent.agentProfile.personalId}`);
      if (headerBits.length) rtlText(doc, headerBits.join(' · '), { width: innerW });

      doc.moveDown(0.6);
      doc.strokeColor('#e5e7eb').lineWidth(0.75).moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).stroke();
      doc.moveDown(0.4);

      // Title + law citation.
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(15);
      rtlText(doc, `הזמנת שירותי תיווך — הזמנה מס׳ ${orderNumber || '—'}`, { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fontSize(9).fillColor('#555');
      rtlText(doc, 'נדרשת עפ״י חוק המתווכים במקרקעין, התשנ״ו-1996', { width: innerW });
      doc.fillColor('#111');
      doc.moveDown(0.5);

      // Property block.
      const p = prospect.property;
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(11);
      rtlText(doc, 'פרטי הנכס', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fontSize(10);
      const propertyLine1 = `${p.type || 'נכס'} — ${p.street || ''}${p.city ? ', ' + p.city : ''}`;
      rtlText(doc, propertyLine1.trim(), { width: innerW });
      if (p.neighborhood) rtlText(doc, `שכונה: ${p.neighborhood}`, { width: innerW });
      rtlText(doc, `מחיר מבוקש: ${formatPrice(p.marketingPrice)}`, { width: innerW });
      doc.moveDown(0.5);

      // Transaction terms.
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(11);
      rtlText(doc, 'תנאי העסקה', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fontSize(10);
      rtlText(doc, `סוג עסקה: ${transactionTypeLabel(p.assetClass, p.category)}`, { width: innerW });
      rtlText(doc, `עמלת תיווך: ${commissionText}`, { width: innerW });
      rtlText(doc,
        `תוקף ההזמנה: ${formatIlDate(signedAt)} עד ${formatIlDate(validUntil)}`,
        { width: innerW });
      rtlText(doc, 'בלעדיות: לא', { width: innerW });
      doc.moveDown(0.5);

      // Brokerage terms body.
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(11);
      rtlText(doc, 'תנאי התיווך', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fontSize(9.5);
      for (const para of terms) {
        rtlText(doc, para, { width: innerW, paragraphGap: 4, lineGap: 1 });
      }
      doc.moveDown(0.4);

      // Client details block.
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(11);
      rtlText(doc, 'פרטי הלקוח', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fontSize(10);
      rtlText(doc, `שם מלא: ${prospect.name}`, { width: innerW });
      if (prospect.idNumber) {
        const idLabel = prospect.idType === 'PASSPORT' ? 'דרכון' : 'ת.ז.';
        rtlText(doc, `${idLabel}: ${prospect.idNumber}`, { width: innerW });
      }
      if (prospect.address) rtlText(doc, `כתובת: ${prospect.address}`, { width: innerW });
      if (prospect.phone)   rtlText(doc, `טלפון: ${prospect.phone}`, { width: innerW });
      if (prospect.email)   rtlText(doc, `דוא״ל: ${prospect.email}`, { width: innerW });
      if (prospect.notes)   rtlText(doc, `הערות: ${prospect.notes}`, { width: innerW });
      doc.moveDown(0.6);

      // Signature image — extract the base64 payload from the data-URL.
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(prospect.signatureDataUrl);
      if (m) {
        try {
          const buf = Buffer.from(m[2], 'base64');
          // Measure where to place so the label hugs the image.
          const sigW = 160;
          const sigH = 60;
          const y = doc.y;
          // pdfkit paints from x,y and we want the signature right-aligned.
          const x = PAGE_W - M - sigW;
          doc.image(buf, x, y, { fit: [sigW, sigH] });
          doc.y = y + sigH + 4;
        } catch {
          // Unreadable signature payload — skip image, keep label.
        }
      }
      if (fs.existsSync(FONT_BOLD)) doc.font('He-Bold');
      doc.fontSize(9).fillColor('#555');
      rtlText(doc, 'חתימת הלקוח/ה', { width: innerW });
      if (fs.existsSync(FONT_REG)) doc.font('He');
      doc.fillColor('#111');

      // Footer — always at the bottom of page 1.
      doc.fontSize(8).fillColor('#777');
      const footerY = doc.page.height - M - 14;
      doc.text(
        `נחתם: ${formatIlDateTime(signedAt)}   ·   מזהה הזמנה: ${prospect.id}`,
        M, footerY,
        { width: innerW, align: 'right', features: ['rtla'] }
      );

      doc.end();
      const buf = await done;

      reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `inline; filename="agreement-${orderNumber || prospect.id}.pdf"`
        )
        .header('Cache-Control', 'private, no-store');
      return reply.send(buf);
    }
  );

  // Link a prospect to an existing Lead. Agent-scoped both ways: the
  // prospect must be on a property the agent owns, and the lead must
  // be one of the agent's leads.
  app.post(
    '/prospects/:id/link-lead',
    { onRequest: [app.requireAgent] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const u = getUser(req);
      if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
      const parsed = z.object({ leadId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { message: 'leadId required' } });
      }
      const prospect = await prisma.prospect.findUnique({
        where: { id },
        include: { property: { select: { agentId: true } } },
      });
      if (!prospect || prospect.property.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }
      const lead = await prisma.lead.findUnique({
        where: { id: parsed.data.leadId },
        select: { id: true, agentId: true },
      });
      if (!lead) {
        return reply.code(404).send({ error: { message: 'Lead not found' } });
      }
      if (lead.agentId !== u.id) {
        return reply.code(403).send({ error: { message: 'Forbidden' } });
      }
      const updated = await prisma.prospect.update({
        where: { id },
        data: { leadId: lead.id },
      });
      return { prospect: updated };
    }
  );

  // Clear the lead link. Same agent scoping as the link endpoint.
  app.post(
    '/prospects/:id/unlink-lead',
    { onRequest: [app.requireAgent] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const u = getUser(req);
      if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
      const prospect = await prisma.prospect.findUnique({
        where: { id },
        include: { property: { select: { agentId: true } } },
      });
      if (!prospect || prospect.property.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }
      const updated = await prisma.prospect.update({
        where: { id },
        data: { leadId: null },
      });
      return { prospect: updated };
    }
  );
};
