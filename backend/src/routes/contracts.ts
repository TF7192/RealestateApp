// Sprint 6 / ScreenContract — In-house digital contract e-sign flow.
//
// Contracts (four types — see below) are rendered and signed entirely
// inside Estia using the same pdfkit + Noto Sans Hebrew path already
// proven by prospect-pdf. No DocuSign / HelloSign / third-party vendor.
//
// Document types:
//   BROKERAGE        — seller's non-exclusive brokerage-services order
//                      (הזמנת שירותי תיווך)
//   EXCLUSIVITY      — seller's exclusive listing addendum that
//                      supplements a BROKERAGE order via `baseContractId`
//   BUYER_BROKERAGE  — buyer's brokerage-services order over a captured
//                      list of properties (`propertiesSnapshot`)
//   OFFER            — buyer's price offer against a listing
//
// Endpoints (mounted under `/api/contracts`):
//   POST   /                     — create a draft contract (unsigned)
//   GET    /                     — list agent's contracts
//   GET    /:id                  — fetch a contract (with pdfUrl + baseContract)
//   GET    /:id/pdf              — render the signed/unsigned PDF
//
// Agent-side type-to-sign was removed 2026-06-02 — the only remaining
// sign surface is the customer-facing token flow (frontend task).
// All endpoints are agent-scoped: cross-agent reads return 404.

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
//
// Legal note: these clauses are Estia's own phrasing of the statutory
// disclosures every Israeli real-estate brokerage must cover under
// חוק המתווכים במקרקעין, התשנ"ו-1996. The legal effect is identical
// to comparable templates on the market; the wording is ours.
const DEFAULT_BODIES: Record<string, string> = {
  // BROKERAGE — seller's non-exclusive order. Seven statutory clauses.
  BROKERAGE: [
    '1. הח"מ מצהיר/ה כי הינו/ה בעל/ת הזכויות בנכס נשוא הזמנה זו, או כי ' +
      'הינו/ה מורשה/ית כדין לפעול בשמו, וכי כל הפרטים שמסר/ה למתווך ' +
      'אודות הנכס מלאים, נכונים ועדכניים. המתווך רשאי להעביר את פרטי ' +
      'הנכס לקונים, שוכרים ולמתווכים נוספים לצורך קידום עסקה.',
    '2. הח"מ מתחייב/ת להמציא למתווך נסח טאבו עדכני ו/או אישור זכויות ' +
      'מחברה משכנת, לפי העניין, ככל שיידרשו לצורך השלמת העסקה.',
    '3. דמי התיווך ישולמו למתווך במועד החתימה על הסכם מחייב לעסקה, או ' +
      'במועד מתן התחייבות בלתי-חוזרת לביצועה, לפי המוקדם מביניהם, ' +
      'ובשיעורים הקבועים בסעיף 4 להלן.',
    '4. שיעור דמי התיווך: במכר — 2% ממחיר המכירה בפועל בתוספת מע"מ ' +
      'כדין; בשכירות — דמי שכירות של חודש אחד בתוספת מע"מ כדין. ' +
      'מובהר כי המתווך זכאי לדמי תיווך גם מן הקונה/השוכר.',
    '5. עם השלמת מכירת הנכס יהא המתווך רשאי לפרסם כי הנכס נמכר.',
    '6. הח"מ מאשר/ת כי המתווך המליץ בפניו/ה להיעזר בעורך-דין ובאנשי ' +
      'מקצוע נוספים לצורך ליווי העסקה.',
    '7. הח"מ מאשר/ת כי דמי התיווך נגבים כנגד חשבונית מס כדין.',
  ].join('\n\n'),

  // EXCLUSIVITY — seller's exclusive listing addendum. Eleven clauses.
  // The base-contract reference header is rendered by the PDF renderer
  // when `baseContractId` is set; not part of the body text itself.
  EXCLUSIVITY: [
    '1. הח"מ מצהיר/ה כי הינו/ה בעל/ת הזכויות בנכס נשוא הסכם זה, או כי ' +
      'הינו/ה מורשה/ית כדין לפעול בשמו, וכי הפרטים שנמסרו למתווך ' +
      'הינם מהותיים, נכונים, מלאים ועדכניים. המתווך רשאי להעביר את ' +
      'פרטי הנכס לקונים, שוכרים ולמתווכים נוספים לצורך קידום עסקה.',
    '2. הח"מ ימציא/תמציא למתווך נסח טאבו עדכני ו/או אישור זכויות ' +
      'מחברה משכנת, ומסמיך/ה בזאת את המתווך לפנות בשמו/ה לכל רשות ' +
      'מוסמכת לצורך קבלת מידע הדרוש לקידום העסקה.',
    '3. הח"מ ממנה/ה בזאת את המתווך באופן בלעדי לשיווק הנכס לתקופה ' +
      'שתחילתה ביום חתימת הסכם זה וסיומה במועד שנקבע בכותרת ההסכם. ' +
      'בתום תקופת הבלעדיות, יהפוך ההסכם להזמנת תיווך רגילה (שאינה ' +
      'בלעדית), ויישמר למתווך זכות לדמי תיווך מקונה שהוצג על-ידו ' +
      'במהלך תקופת הבלעדיות וביצע עסקה לאחריה, בכפוף לסעיף 14(ב) ' +
      'לחוק המתווכים במקרקעין, התשנ"ו-1996.',
    '4. הח"מ מתחייב/ת לשלם למתווך את דמי התיווך באופן מיידי עם חתימת ' +
      'הסכם מחייב לעסקה או במועד מתן התחייבות בלתי-חוזרת לביצועה, אם ' +
      'אלה ייחתמו: (1) במהלך תקופת הבלעדיות — גם אם, לכאורה, ללא ' +
      'מעורבות המתווך, וזאת בכפוף לסעיף 14(ב) לחוק; או (2) לאחר ' +
      'תקופת הבלעדיות, עם צד שנודע לו על הנכס או שהנכס הוצג בפניו ' +
      'במהלך תקופת הבלעדיות, וזאת בכפוף לסעיף 14(ב) לחוק.',
    '5. שיעורי דמי התיווך הינם כקבוע בהזמנת התיווך אשר הסכם בלעדיות ' +
      'זה משלים אותה.',
    '6. הח"מ מאשר/ת כי דמי התיווך נגבים כנגד חשבונית מס כדין.',
    '7. הח"מ מאשר/ת כי המתווך המליץ בפניו/ה להיעזר בעורך-דין ובאנשי ' +
      'מקצוע נוספים לצורך ליווי העסקה.',
    '8. במהלך תקופת הבלעדיות מתחייב/ת הח"מ שלא להתקשר עם מתווך אחר ' +
      'בקשר לנכס, ולהפנות כל פונה ישירות אל המתווך החתום. הפרת ' +
      'התחייבות זו עשויה לזכות את המתווך במלוא דמי התיווך כפיצוי ' +
      'מוסכם, וזאת מבלי לגרוע מכל סעד אחר העומד לו בדין.',
    '9. הח"מ מתחייב/ת להודיע לכל פונה ישיר ולכל גורם עמו היו לו ' +
      'מגעים קודמים בקשר לנכס על קיומה של בלעדיות זו, ולסיים כל ' +
      'התקשרות קודמת שעלולה לעמוד בסתירה להסכם זה.',
    '10. המתווך מתחייב לפעול בשקידה ובתום-לב, לשתף פעולה עם מתווכים ' +
      'אחרים ככל הנדרש לקידום העסקה, ולגבש ולהפעיל תוכנית שיווק ' +
      'בהתאם לשיקול דעתו המקצועי.',
    '11. משמונה המתווך כמתווך הפעיל היחיד בנכס, יראו כל פנייה או ' +
      'עסקה כפועל יוצא של פעילותו, וזאת בכפוף לסעיף 14(ב) לחוק ' +
      'המתווכים במקרקעין.',
  ].join('\n\n'),

  // BUYER_BROKERAGE — buyer's brokerage order. Ten clauses. The
  // property table is rendered by the PDF renderer from
  // `propertiesSnapshot`; not part of the body text itself.
  BUYER_BROKERAGE: [
    '1. הח"מ מתקשר/ת בזאת עם המתווך לקבלת שירותי תיווך בנוגע לנכסים ' +
      'המפורטים בהזמנה זו.',
    '2. הח"מ מאשר/ת כי המתווך הציג בפניו/ה את הנכסים המפורטים בהזמנה, ' +
      'ומתחייב/ת להודיע למתווך על כל משא-ומתן שיתנהל על-ידו/ה לגבי ' +
      'מי מן הנכסים האמורים.',
    '3. הח"מ מתחייב/ת לשלם למתווך דמי תיווך כקבוע בסעיף 5 להלן, עם ' +
      'חתימה על הסכם מחייב או על התחייבות בלתי-חוזרת לביצוע עסקה, ' +
      'לפי המוקדם מביניהם, ביחס לאחד או יותר מן הנכסים המפורטים.',
    '4. הח"מ מתחייב/ת שלא להעביר לצדדים שלישיים מידע שנמסר לו/ה על-' +
      'ידי המתווך אודות הנכסים המפורטים, ומתחייב/ת לשפות את המתווך ' +
      'בגין כל נזק שייגרם לו עקב הפרת התחייבות זו.',
    '5. שיעור דמי התיווך: ברכישה — 2% ממחיר הרכישה בפועל בתוספת מע"מ ' +
      'כדין; בשכירות — דמי שכירות של חודש אחד בתוספת מע"מ כדין. ' +
      'מובהר כי המתווך זכאי לדמי תיווך גם מן המוכר/המשכיר. התשלום ' +
      'יבוצע באופן מיידי עם חתימת הסכם מחייב או התחייבות לעסקה; ' +
      'בפיגור בתשלום יישאו דמי התיווך הפרשי הצמדה וריבית בשיעור ' +
      'המקובל לחשבונות חח"ד, מן המועד שנקבע לתשלום ועד לפירעון בפועל.',
    '6. במידה והשוכר/ת ירכוש/תרכוש את הנכס המושכר בתקופת השכירות או ' +
      'בתוך שלושה חודשים מסיומה, יחויבו הצדדים בדמי תיווך בשיעורים ' +
      'הקבועים בסעיף 5 לעיל, בתוספת מע"מ כדין.',
    '7. הח"מ מאשר/ת כי המתווך המליץ בפניו/ה להיעזר בעורך-דין ובאנשי ' +
      'מקצוע נוספים לצורך ליווי העסקה.',
    '8. הח"מ מאשר/ת כי דמי התיווך נגבים כנגד חשבונית מס כדין.',
    '9. הח"מ מסכים/ה לקבל מהמתווך הצעות נוספות לנכסים העשויים להתאים ' +
      'לצרכיו/ה.',
    '10. הח"מ מסכים/ה כי המתווך רשאי לייצג גם את הצד השני בעסקה, וכי ' +
      'הוא רשאי להעביר את פרטיו/ה האישיים אל הצד השני, באי-כוחו או ' +
      'מי מטעמו, לצורך קידום העסקה.',
  ].join('\n\n'),

  // OFFER — buyer's purchase offer. Kept as the original three clauses.
  OFFER: [
    'אני הח"מ מציע/ה לרכוש את הנכס שבנדון בתמורה לסכום הנקוב להלן.',
    'הצעה זו תקפה לתקופה של 7 ימים מיום חתימתה, ומותנית בקבלת משכנתא ' +
      'ובבדיקת רישום הזכויות בנכס.',
    'במידה וההצעה תתקבל, אני מתחייב/ת לחתום על זכרון דברים תוך 14 יום.',
  ].join('\n\n'),
};

function contractTypeLabel(type: string): string {
  if (type === 'EXCLUSIVITY')     return 'הסכם בלעדיות';
  if (type === 'BROKERAGE')       return 'הזמנת שירותי תיווך';
  if (type === 'BUYER_BROKERAGE') return 'הזמנת שירותי תיווך לקניה';
  if (type === 'OFFER')           return 'הצעת רכישה';
  return 'חוזה';
}

// Format a Date as dd/MM/yyyy in Asia/Jerusalem — used by the
// EXCLUSIVITY base-contract reference header.
function formatIlDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

// Short, human-friendly contract reference number for display in
// headers. Full cuid stays in the row id; this is the visible label.
function shortContractRef(id: string): string {
  return id.slice(-8).toUpperCase();
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

// SHA-256 of the contract body — the canonical tamper-evidence anchor
// for tier-2 admissibility under חוק חתימה אלקטרונית, התשס"א-2001.
// Computed at create time so the signed PDF can render the hash, and
// any post-signing edit to `body` will fail to round-trip against this
// stored value (we re-compute on demand and compare).
function computeDocumentHash(title: string, body: string): string {
  return crypto.createHash('sha256').update(`${title}\n${body}`).digest('hex');
}
// `computeSignatureHash` + `extractClientIp` were removed 2026-06-02
// when the agent-side type-to-sign endpoint was deleted. The customer-
// via-token sign route (frontend pending) will reintroduce its own
// chain-of-custody capture when it ships.

// Validation schemas. Bodies are bounded so a rogue payload can't blow
// up the PDF buffer size.
//
// `propertiesSnapshot` is captured once at create time so subsequent
// edits to the underlying Property rows don't mutate a signed PDF.
// Only meaningful for BUYER_BROKERAGE; we accept it on any type rather
// than branch the schema, but the renderer only uses it for that type.
const PropertySnapshotEntry = z.object({
  propertyId:     z.string().optional(),
  address:        z.string().min(1).max(300),
  city:           z.string().max(120).optional(),
  rooms:          z.number().nullable().optional(),
  sqm:            z.number().nullable().optional(),
  marketingPrice: z.number().nullable().optional(),
  kind:           z.string().max(40).optional(),
});

const CreateInput = z.object({
  type: z.enum(['BROKERAGE', 'EXCLUSIVITY', 'BUYER_BROKERAGE', 'OFFER']),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20_000).optional(),
  signerName: z.string().min(1).max(120),
  signerPhone: z.string().max(40).optional(),
  signerEmail: z.string().email().max(200).optional().or(z.literal('')),
  propertyId: z.string().optional(),
  leadId: z.string().optional(),
  // BUYER_BROKERAGE: snapshot of the property list at create time.
  propertiesSnapshot: z.array(PropertySnapshotEntry).max(50).optional(),
  // EXCLUSIVITY: id of the BROKERAGE order this addendum supplements.
  baseContractId: z.string().optional(),
});

// Render the contract to a PDF Buffer. Shared between the signed and
// unsigned fetch paths — the unsigned PDF just omits the signature
// block.
// Shape of one row in the BUYER_BROKERAGE property table, as stored in
// `Contract.propertiesSnapshot`. Captured at create time; immutable.
type ContractPropertySnapshot = {
  propertyId?:    string | null;
  address:        string;
  city?:          string | null;
  rooms?:         number | null;
  sqm?:           number | null;
  marketingPrice?: number | null;
  kind?:          string | null;
};

// Optional thin reference to the underlying BROKERAGE order an
// EXCLUSIVITY addendum supplements. Passed in by the route after a
// targeted lookup so the renderer doesn't need a Prisma client.
type ContractBaseRef = {
  id: string;
  signedAt: Date | null;
  createdAt: Date;
};

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
  // 2026-05-03 — chain-of-custody fields rendered in the audit-trail
  // block on signed PDFs. All optional/nullable: legacy contracts
  // signed before these were captured render with the existing block.
  documentHash?: string | null;
  signedIp?: string | null;
  signedUserAgent?: string | null;
  consentText?: string | null;
  consentAcceptedAt?: Date | null;
  // 2026-06-02 — type-specific extensions.
  propertiesSnapshot?: ContractPropertySnapshot[] | null;
  baseContract?: ContractBaseRef | null;
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

  // BUYER_BROKERAGE — property list table. Rendered between the signer
  // block and the clauses. Empty placeholder row when snapshot is null/
  // empty (the buyer-order is still legally formed without it, but the
  // table is the canonical record of which properties it covers).
  if (contract.type === 'BUYER_BROKERAGE') {
    doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
    doc.text(rtl('רשימת נכסים'), M, doc.y, {
      width: innerW, align: 'right', features: ['rtla', 'rtlm'],
    });
    const rows = Array.isArray(contract.propertiesSnapshot)
      ? contract.propertiesSnapshot
      : [];
    // Column layout — RTL, so the first (rightmost) column is "סוג הנכס".
    // Widths sum to innerW. Address is the widest column.
    const colW = {
      kind:    70,
      rooms:   55,
      sqm:     60,
      address: innerW - 70 - 55 - 60 - 90,
      price:   90,
    };
    const order: Array<keyof typeof colW> = ['kind', 'rooms', 'sqm', 'address', 'price'];
    const headers: Record<keyof typeof colW, string> = {
      kind:    'סוג הנכס',
      rooms:   'חדרים',
      sqm:     'שטח',
      address: 'כתובת',
      price:   'מחיר מבוקש',
    };
    const tableTop = doc.y + 6;
    // Header strip.
    doc.save();
    doc.fillColor('#f7f1e3');
    doc.rect(M, tableTop, innerW, 18).fill();
    doc.restore();
    doc.font('He-Bold').fontSize(9).fillColor(GOLD_DEEP);
    let cx = PAGE_W - M; // start at right edge, walk left
    for (const key of order) {
      const w = colW[key];
      cx -= w;
      doc.text(rtl(headers[key]), cx, tableTop + 4, {
        width: w, align: 'center', features: ['rtla', 'rtlm'],
      });
    }
    // Body rows.
    doc.font('He').fontSize(9).fillColor(INK);
    let ry2 = tableTop + 18;
    const drawCell = (text: string, x: number, w: number) => {
      doc.text(rtl(text), x, ry2 + 4, {
        width: w, align: 'center', features: ['rtla', 'rtlm'],
      });
    };
    const fmtPrice = (n: number | null | undefined) =>
      n == null ? '—' : `₪${Math.round(n).toLocaleString('he-IL')}`;
    const fmtNum = (n: number | null | undefined) =>
      n == null ? '—' : String(n);
    const renderRow = (row: ContractPropertySnapshot | null) => {
      const rowH = 18;
      doc.strokeColor(RULE_LIGHT).lineWidth(0.5)
         .moveTo(M, ry2 + rowH).lineTo(PAGE_W - M, ry2 + rowH).stroke();
      let x = PAGE_W - M;
      for (const key of order) {
        const w = colW[key];
        x -= w;
        if (!row) {
          drawCell(key === 'address' ? '(אין נכסים)' : '', x, w);
          continue;
        }
        if (key === 'kind')         drawCell(row.kind || '—', x, w);
        else if (key === 'rooms')   drawCell(fmtNum(row.rooms), x, w);
        else if (key === 'sqm')     drawCell(row.sqm != null ? `${row.sqm} מ״ר` : '—', x, w);
        else if (key === 'address') {
          const addr = row.city ? `${row.address}, ${row.city}` : row.address;
          drawCell(addr, x, w);
        }
        else if (key === 'price')   drawCell(fmtPrice(row.marketingPrice), x, w);
      }
      ry2 += rowH;
    };
    if (rows.length === 0) {
      renderRow(null);
    } else {
      for (const r of rows) renderRow(r);
    }
    doc.y = ry2 + 8;
  }

  // Body — split into paragraphs on blank lines.
  doc.font('He-Bold').fontSize(11).fillColor(GOLD_DEEP);
  doc.text(rtl('תנאי החוזה'), M, doc.y, {
    width: innerW, align: 'right', features: ['rtla', 'rtlm'],
  });

  // EXCLUSIVITY — base-contract reference header. Only when this
  // exclusivity addendum was created against a specific BROKERAGE order.
  if (contract.type === 'EXCLUSIVITY' && contract.baseContract) {
    const baseDate = contract.baseContract.signedAt || contract.baseContract.createdAt;
    const refLine =
      `הסכם זה מהווה חלק בלתי נפרד מהזמנת שירותי תיווך מספר ` +
      `${shortContractRef(contract.baseContract.id)} ` +
      `אשר נחתמה בין הצדדים ביום ${formatIlDate(baseDate)}.`;
    doc.font('He').fontSize(9).fillColor(INK_SOFT);
    doc.text(rtl(refLine), M, doc.y + 4, {
      width: innerW, align: 'right', features: ['rtla', 'rtlm'],
      lineGap: 1,
    });
  }

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
    // 2026-05-03 — chain-of-custody audit block. Rendered only when at
    // least one tier-2 evidence field is populated (legacy signed rows
    // have all five = null and the existing layout above is preserved).
    // Hebrew labels per Israeli court convention; values stay LTR for
    // technical fields (IP, hash, UA) so RTL shaping doesn't mangle them.
    const hasAudit =
      contract.documentHash ||
      contract.signedIp ||
      contract.signedUserAgent ||
      contract.consentAcceptedAt;
    if (hasAudit) {
      const auditY = doc.y + 14;
      doc.strokeColor(RULE_LIGHT).lineWidth(0.5)
         .moveTo(M, auditY).lineTo(PAGE_W - M, auditY).stroke();
      doc.y = auditY + 8;
      doc.font('He-Bold').fontSize(9).fillColor(GOLD_DEEP);
      doc.text(rtl('שרשרת ראיות (חוק חתימה אלקטרונית, תשס"א-2001)'), M, doc.y, {
        width: innerW, align: 'right', features: ['rtla', 'rtlm'],
      });
      doc.font('He').fontSize(8).fillColor(INK_MUTED);
      const auditRow = (label: string, value: string, ltr = false) => {
        const text = ltr ? `${label}: ${value}` : rtl(`${label}: ${value}`);
        doc.text(text, M, doc.y + 2, {
          width: innerW, align: 'right',
          features: ltr ? [] : ['rtla', 'rtlm'],
        });
      };
      if (contract.documentHash) {
        auditRow('Document SHA-256', contract.documentHash, true);
      }
      if (contract.signedIp) {
        auditRow('IP בעת חתימה', contract.signedIp, true);
      }
      if (contract.signedUserAgent) {
        // Truncate UA to a single line — full string is in the DB row
        // for forensic purposes; PDF shows the recognisable prefix.
        const uaShort = contract.signedUserAgent.length > 80
          ? contract.signedUserAgent.slice(0, 80) + '…'
          : contract.signedUserAgent;
        auditRow('דפדפן/מכשיר', uaShort, true);
      }
      if (contract.consentAcceptedAt) {
        auditRow('הסכמה נתקבלה', formatIlDateTime(contract.consentAcceptedAt));
      }
      if (contract.consentText) {
        doc.fontSize(7.5).fillColor(INK_MUTED);
        const cText = contract.consentText.length > 220
          ? contract.consentText.slice(0, 220) + '…'
          : contract.consentText;
        doc.text(rtl(`נוסח ההסכמה שהוצג: "${cText}"`), M, doc.y + 4, {
          width: innerW, align: 'right', features: ['rtla', 'rtlm'],
        });
      }
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
    // Cross-agent guard on baseContractId — an EXCLUSIVITY addendum
    // must reference an order belonging to the same agent. Cross-agent
    // attempts surface as 404 so we don't leak existence.
    if (input.baseContractId) {
      const base = await prisma.contract.findUnique({
        where: { id: input.baseContractId }, select: { agentId: true },
      });
      if (!base || base.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Base contract not found' } });
      }
    }

    const finalTitle = input.title ?? contractTypeLabel(input.type);
    const finalBody  = input.body ?? DEFAULT_BODIES[input.type] ?? '';
    const documentHash = computeDocumentHash(finalTitle, finalBody);
    const contract = await prisma.contract.create({
      data: {
        agentId:     u.id,
        type:        input.type,
        title:       finalTitle,
        body:        finalBody,
        documentHash,
        signerName:  input.signerName,
        signerPhone: input.signerPhone ?? null,
        signerEmail: input.signerEmail && input.signerEmail !== '' ? input.signerEmail : null,
        propertyId:  input.propertyId ?? null,
        leadId:      input.leadId ?? null,
        propertiesSnapshot: input.propertiesSnapshot ?? null,
        baseContractId:     input.baseContractId ?? null,
      },
    });
    return { contract };
  });

  // Fetch a single contract. Agent-scoped: cross-agent reads return 404.
  // Hydrates `baseContract` (id + signedAt + createdAt) when the row is
  // an EXCLUSIVITY addendum, so the frontend can show "supplements
  // order #XXX from dd/MM/yyyy" without a second round-trip.
  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract || contract.agentId !== u.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    let baseContract: ContractBaseRef | null = null;
    if (contract.baseContractId) {
      const b = await prisma.contract.findUnique({
        where: { id: contract.baseContractId },
        select: { id: true, signedAt: true, createdAt: true, agentId: true },
      });
      // Agent-scope guard on the hydrated ref too — defensive against
      // a stale FK pointing across agents.
      if (b && b.agentId === u.id) {
        baseContract = { id: b.id, signedAt: b.signedAt, createdAt: b.createdAt };
      }
    }
    return {
      contract,
      baseContract,
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
    // EXCLUSIVITY — fetch the base BROKERAGE order so the renderer can
    // print the "supplements order #XXX from dd/MM/yyyy" header.
    let baseContract: ContractBaseRef | null = null;
    if (contract.baseContractId) {
      const b = await prisma.contract.findUnique({
        where: { id: contract.baseContractId },
        select: { id: true, signedAt: true, createdAt: true, agentId: true },
      });
      if (b && b.agentId === u.id) {
        baseContract = { id: b.id, signedAt: b.signedAt, createdAt: b.createdAt };
      }
    }
    const buf = await renderContractPdf(
      {
        ...contract,
        propertiesSnapshot: contract.propertiesSnapshot as ContractPropertySnapshot[] | null,
        baseContract,
      },
      agent,
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="contract-${contract.id}.pdf"`)
      .header('Cache-Control', 'private, no-store');
    return reply.send(buf);
  });
  // POST /:id/sign — REMOVED 2026-06-02. Agent-side type-to-sign is
  // gone; the only remaining sign surface is the customer-via-token
  // flow (frontend work pending in a follow-up pass).
};
