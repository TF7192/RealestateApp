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

// RTL rendering — pdfkit with `features: ['rtla', 'rtlm']` and
// `align: 'right'` correctly shapes Hebrew right-to-left, but ONLY
// when the string contains Hebrew. In that case pdfkit reverses the
// CHARACTER ORDER of the entire string so Hebrew reads RTL; as a
// side-effect, any Latin / digit / punctuation runs embedded in the
// Hebrew come out flipped (phone numbers, dates, emails, IDs).
//
// Pure-LTR strings (e.g. a standalone phone "050-9876543") are NOT
// reversed by pdfkit, so pre-reversing them would double-flip.
//
// Fix: only when the string contains Hebrew, pre-reverse each LTR
// run so the later rtla whole-string flip lands them right-side-up.
// Pass-through otherwise.
//
// An "LTR run" is any maximal sequence of Latin letters, digits, and
// LTR-internal punctuation we want to read left-to-right (`-`, `.`,
// `/`, `:`, `,`, `@`, `+`, `#`, `%`, and space inside the run). We
// DO NOT include the Hebrew middle-dot "·" (U+00B7) — it's a
// bidi-neutral separator between tokens.
const HEBREW_RE = /[֐-׿יִ-ﭏ₪]/;
function rtl(text: string): string {
  if (!text) return '';
  // Pure-LTR strings: pdfkit's rtla is a no-op, pass through untouched.
  if (!HEBREW_RE.test(text)) return text;
  // Hebrew present: rtla will flip the full character order at draw
  // time. Pre-reverse each digit-containing LTR run so it lands
  // right-side-up after the flip. Pure-letter runs (emails, URLs)
  // aren't re-reversed by rtla, so leave them alone.
  return text.replace(/[A-Za-z0-9_\-@.,/:+#%]+/g, (run) => {
    if (!/\d/.test(run)) return run;
    return run.split('').reverse().join('');
  });
}

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
  // ₪ first (LTR order) — pdfkit's rtla reversal behaves
  // inconsistently when the string has ₪ but no Hebrew letters, and a
  // trailing-currency format comes out as "000,058,3 ₪". Leading the
  // currency keeps the string pure-LTR and renders unchanged.
  return '₪ ' + new Intl.NumberFormat('he-IL').format(p);
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

// (Legacy helper — the new render path below uses the top-level `rtl()`
// function to reorder logical → visual via bidi-js, then passes plain
// strings to pdfkit with no OpenType RTL features. Kept here so any
// future caller that imports rtlText still compiles.)
function rtlText(doc: PDFKit.PDFDocument, text: string, opts: PDFKit.Mixins.TextOptions = {}) {
  doc.text(rtl(text), { align: 'right', features: ['rtla', 'rtlm'], ...opts });
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
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      if (!fs.existsSync(FONT_REG) || !fs.existsSync(FONT_BOLD)) {
        // Fonts must ship with the image — see Dockerfile. Helvetica
        // fallback has no Hebrew glyphs, so fail loudly here rather
        // than silently render gibberish.
        return reply.code(500).send({ error: { message: 'PDF fonts missing on server' } });
      }
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

      // Brand palette — matches the web app + iOS splash.
      const GOLD       = '#b48b4c';
      const GOLD_DEEP  = '#7a5c2c';
      const INK        = '#1e1a14';
      const INK_SOFT   = '#555';
      const INK_MUTED  = '#888';
      const RULE_LIGHT = '#e5e7eb';

      // ── HEADER BAND ─────────────────────────────────────────────
      // Estia logo (gold diamond, rendered with pdfkit primitives) on
      // the top-left; agent identity on the right. A full-width gold
      // hairline below.
      const HEADER_TOP = M;
      const LOGO_SIZE = 28;
      const logoX = M;
      const logoCy = HEADER_TOP + LOGO_SIZE / 2;
      // Outer gold diamond.
      doc.save();
      doc.fillColor(GOLD);
      doc.moveTo(logoX + LOGO_SIZE / 2, HEADER_TOP)
         .lineTo(logoX + LOGO_SIZE,      logoCy)
         .lineTo(logoX + LOGO_SIZE / 2, HEADER_TOP + LOGO_SIZE)
         .lineTo(logoX,                  logoCy)
         .closePath()
         .fill();
      // Inner negative-space diamond (same shape as the favicon).
      doc.fillColor('#fff');
      const inset = 6;
      doc.moveTo(logoX + LOGO_SIZE / 2,       HEADER_TOP + inset)
         .lineTo(logoX + LOGO_SIZE - inset,   logoCy)
         .lineTo(logoX + LOGO_SIZE / 2,       HEADER_TOP + LOGO_SIZE - inset)
         .lineTo(logoX + inset,               logoCy)
         .closePath()
         .fill();
      doc.restore();

      // Wordmark next to logo.
      doc.fillColor(INK).font('He-Bold').fontSize(16)
         .text('Estia', logoX + LOGO_SIZE + 8, HEADER_TOP + 3, { lineBreak: false });
      // (No subtitle — the logo + Estia wordmark is enough branding.)

      // Agent identity block — right-aligned, occupies the right half.
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

      // Contact + license — slightly smaller, muted.
      const contactBits: string[] = [];
      if (agent?.phone)                    contactBits.push(`טל׳ ${agent.phone}`);
      if (agent?.email)                    contactBits.push(agent.email);
      if (agent?.agentProfile?.license)    contactBits.push(`מ.ר. ${agent.agentProfile.license}`);
      if (agent?.agentProfile?.personalId) contactBits.push(`ת.ז. ${agent.agentProfile.personalId}`);
      if (contactBits.length) {
        doc.fontSize(8.5).fillColor(INK_MUTED);
        doc.text(rtl(contactBits.join(' · ')), rightColX, ry, {
          width: RIGHT_COL_W, align: 'right', features: ['rtla', 'rtlm'],
        });
        ry = doc.y;
      }

      // Header separator rule.
      const headerBottom = Math.max(HEADER_TOP + LOGO_SIZE + 6, ry + 6);
      doc.strokeColor(GOLD).lineWidth(1.25)
         .moveTo(M, headerBottom).lineTo(PAGE_W - M, headerBottom).stroke();
      doc.y = headerBottom + 14;

      // ── TITLE (centered) ────────────────────────────────────────
      doc.font('He-Bold').fontSize(20).fillColor(INK);
      doc.text(rtl('הזמנת שירותי תיווך'), M, doc.y, {
        width: innerW, align: 'center', features: ['rtla', 'rtlm'],
      });
      doc.font('He').fontSize(11).fillColor(GOLD_DEEP);
      doc.text(rtl(`הזמנה מס׳ ${orderNumber || '—'}`), M, doc.y + 2, {
        width: innerW, align: 'center', features: ['rtla', 'rtlm'],
      });
      doc.fontSize(8.5).fillColor(INK_MUTED);
      doc.text(rtl('נדרשת עפ״י חוק המתווכים במקרקעין, התשנ״ו-1996'), M, doc.y + 2, {
        width: innerW, align: 'center', features: ['rtla', 'rtlm'],
      });

      // Short gold decorative rule under the title.
      const titleRuleY = doc.y + 8;
      const ruleW = 64;
      doc.strokeColor(GOLD).lineWidth(1.5)
         .moveTo((PAGE_W - ruleW) / 2, titleRuleY)
         .lineTo((PAGE_W + ruleW) / 2, titleRuleY)
         .stroke();
      doc.y = titleRuleY + 18;

      // ── Helpers for sections + key-value rows ───────────────────
      const sectionHeader = (title: string) => {
        doc.font('He-Bold').fontSize(12).fillColor(GOLD_DEEP);
        doc.text(rtl(title), M, doc.y, {
          width: innerW, align: 'right', features: ['rtla', 'rtlm'],
        });
        const y = doc.y + 2;
        doc.strokeColor(GOLD).lineWidth(0.6)
           .moveTo(M, y).lineTo(PAGE_W - M, y).stroke();
        doc.y = y + 6;
        doc.font('He').fontSize(10).fillColor(INK);
      };

      const kvRow = (label: string, value: string) => {
        // Right-aligned "label: value". Label bold, value regular.
        const startY = doc.y;
        doc.font('He-Bold').fontSize(10).fillColor(INK_SOFT);
        const labelText = rtl(`${label}:`);
        const labelW = doc.widthOfString(labelText) + 6;
        doc.text(labelText, PAGE_W - M - labelW, startY, {
          width: labelW, align: 'right', features: ['rtla', 'rtlm'],
          lineBreak: false,
        });
        doc.font('He').fontSize(10).fillColor(INK);
        doc.text(rtl(value), M, startY, {
          width: innerW - labelW - 4,
          align: 'right', features: ['rtla', 'rtlm'],
        });
      };

      // ── PROPERTY ────────────────────────────────────────────────
      const p = prospect.property;
      sectionHeader('פרטי הנכס');
      kvRow('סוג נכס', p.type || 'נכס');
      kvRow('כתובת', `${p.street || ''}${p.city ? ', ' + p.city : ''}`.trim() || '—');
      if (p.neighborhood) kvRow('שכונה', p.neighborhood);
      kvRow('מחיר מבוקש', formatPrice(p.marketingPrice));
      doc.moveDown(0.8);

      // ── TRANSACTION TERMS ───────────────────────────────────────
      sectionHeader('תנאי העסקה');
      kvRow('סוג עסקה', transactionTypeLabel(p.assetClass, p.category));
      kvRow('עמלת תיווך', commissionText);
      kvRow('תוקף ההזמנה', `${formatIlDate(signedAt)} עד ${formatIlDate(validUntil)}`);
      kvRow('בלעדיות', 'לא');
      doc.moveDown(0.8);

      // ── BROKERAGE TERMS ─────────────────────────────────────────
      sectionHeader('תנאי התיווך');
      doc.font('He').fontSize(9.5).fillColor(INK);
      for (const para of terms) {
        doc.text(rtl(para), M, doc.y, {
          width: innerW,
          align: 'right', features: ['rtla', 'rtlm'],
          paragraphGap: 5,
          lineGap: 1.5,
        });
      }
      doc.moveDown(0.6);

      // ── CLIENT DETAILS ──────────────────────────────────────────
      sectionHeader('פרטי הלקוח');
      kvRow('שם מלא', prospect.name);
      if (prospect.idNumber) {
        const idLabel = prospect.idType === 'PASSPORT' ? 'דרכון' : 'ת.ז.';
        kvRow(idLabel, prospect.idNumber);
      }
      if (prospect.address) kvRow('כתובת', prospect.address);
      if (prospect.phone)   kvRow('טלפון', prospect.phone);
      if (prospect.email)   kvRow('דוא״ל', prospect.email);
      if (prospect.notes)   kvRow('הערות', prospect.notes);
      doc.moveDown(1.2);

      // ── SIGNATURE (centered) ────────────────────────────────────
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(prospect.signatureDataUrl);
      const sigW = 180;
      const sigH = 70;
      const sigX = (PAGE_W - sigW) / 2;
      const sigTop = doc.y;
      if (m) {
        try {
          const sbuf = Buffer.from(m[2], 'base64');
          doc.image(sbuf, sigX, sigTop, { fit: [sigW, sigH] });
        } catch { /* ignore */ }
      }
      // Baseline rule under the signature.
      const sigBaseY = sigTop + sigH + 2;
      doc.strokeColor(INK_MUTED).lineWidth(0.5)
         .moveTo(sigX, sigBaseY).lineTo(sigX + sigW, sigBaseY).stroke();
      doc.font('He-Bold').fontSize(9).fillColor(INK_SOFT);
      doc.text(rtl('חתימת הלקוח/ה'), M, sigBaseY + 4, {
        width: innerW, align: 'center', features: ['rtla', 'rtlm'],
      });

      // ── FOOTER ──────────────────────────────────────────────────
      const footerY = PAGE_H - M - 20;
      doc.strokeColor(RULE_LIGHT).lineWidth(0.5)
         .moveTo(M, footerY - 6).lineTo(PAGE_W - M, footerY - 6).stroke();
      doc.font('He').fontSize(8).fillColor(INK_MUTED);
      doc.text(
        rtl(`נחתם: ${formatIlDateTime(signedAt)}   ·   מזהה הזמנה: ${prospect.id}`),
        M, footerY,
        { width: innerW, align: 'center', features: ['rtla', 'rtlm'] }
      );
      doc.text(rtl('נוצר אוטומטית באמצעות Estia · estia.co.il'), M, footerY + 10, {
        width: innerW, align: 'center', features: ['rtla', 'rtlm'],
      });

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
