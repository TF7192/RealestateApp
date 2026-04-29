// Sprint 5.1 — minimal SES wrapper.
//
// Two production senders ship today:
//   • sendContactEmail        — /api/contact → support inbox
//   • sendNotificationEmail   — generic per-user alert (used by the
//                                pending-delivery worker)
//   • sendMatchDigestEmail    — 2026-05-06; one consolidated email
//                                listing every new lead × listing
//                                match accumulated in a 30-minute
//                                window. Replaces the prior
//                                "one email per match" firehose.
//
// All three render Hebrew-first content. Until 2026-05-06 they sent
// plain-text only; agents reported the inbox UA was rendering the
// Hebrew LTR with punctuation drifting to the wrong side. We now
// emit a multipart message: Text/Plain (legacy clients) + Text/HTML
// wrapped in dir="rtl". The HTML scaffolding is shared via
// `renderRtlEmail()` below — every new template the project adds
// should pipe through it so RTL is handled in exactly one place.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface SendContactEmailArgs {
  // Full email subject *after* the app-wide "[Estia][Contact]" prefix.
  // The caller supplies whatever the user typed; we concatenate.
  subject: string;
  body: string;
  // Informational "from" metadata the user filled on the form. The
  // actual envelope sender is the verified SES identity — these land
  // in the email body so the inbox thread captures them.
  fromName?: string | null;
  fromEmail?: string | null;
  // When set, the authenticated user's display name + email are
  // appended automatically so logged-in support requests come with
  // full attribution even if they left the form's optional fields
  // blank.
  authUserDisplayName?: string | null;
  authUserEmail?: string | null;
}

// Constants — all overridable by env so staging / CI can re-route mail
// to a sandbox verified address without a code change.
const RECIPIENT = process.env.CONTACT_RECIPIENT_EMAIL || 'support@estia.co.il';
const SENDER = process.env.CONTACT_SENDER_EMAIL || 'no-reply@estia.co.il';
const REGION = process.env.AWS_REGION || process.env.SES_REGION || 'eu-north-1';
const SUBJECT_PREFIX = '[Estia][Contact]';

// ── RTL HTML scaffolding ────────────────────────────────────────────
// Mail clients (Gmail, iOS Mail, Outlook) honour `dir="rtl"` on the
// outer <html> + <body> + every <table> if it's set inline. We can't
// rely on a stylesheet — many clients strip <style>. Logical CSS
// (margin-inline-start) won't help in email either; we set explicit
// text-align: right on every block.
//
// `escapeHtml` is intentionally minimal — these templates render
// trusted server-built strings, but any fragment a customer typed
// (lead name, contact form body) MUST be escaped before interpolation.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wrap Latin numerals/currency that appear inside a Hebrew sentence
// in <span dir="ltr"> so Bidi doesn't reorder digits or flip
// punctuation around the ₪ glyph.
export function ltrSpan(s: string): string {
  return `<span dir="ltr" style="unicode-bidi:embed">${escapeHtml(s)}</span>`;
}

export interface RenderRtlEmailArgs {
  // The <h1> / preamble line at the top of the body. Already in the
  // caller's intended language — we don't translate.
  title: string;
  // Pre-rendered HTML for the main body. Caller is responsible for
  // escaping any user-supplied substrings.
  bodyHtml: string;
  // Optional CTA button rendered after the body.
  cta?: { href: string; label: string } | null;
  // Optional footer line (defaults to the standard Estia footer).
  footerHtml?: string;
}

// Returns a fully-formed HTML document — mail clients accept plain
// HTML fragments but Gmail occasionally wraps them, breaking dir;
// shipping a complete <html> document is the safer convention.
export function renderRtlEmail(args: RenderRtlEmailArgs): string {
  const footer =
    args.footerHtml ??
    'הודעה זו נשלחה על ידי Estia. אם אינך מעוניין לקבל התראות, ניתן לכבות אותן ב<a href="https://estia.co.il/settings/notifications" style="color:#0b5ed7">הגדרות ההתראות</a>.';
  const cta = args.cta
    ? `<p style="text-align:right;margin:24px 0"><a href="${escapeHtml(args.cta.href)}" style="display:inline-block;background:#0b5ed7;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(args.cta.label)}</a></p>`
    : '';
  // Inline styles only — many clients strip <style> blocks and
  // <link>s outright. The outer table is the email-safe equivalent
  // of a max-width container.
  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;direction:rtl;text-align:right;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a">
<table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9">
  <tr>
    <td align="center" style="padding:24px 12px;text-align:right">
      <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:10px;border:1px solid #e6e8eb">
        <tr>
          <td dir="rtl" style="padding:28px 24px;direction:rtl;text-align:right">
            <h1 style="margin:0 0 16px 0;font-size:18px;line-height:1.4;color:#0b1320;text-align:right">${escapeHtml(args.title)}</h1>
            <div style="font-size:15px;line-height:1.6;text-align:right;color:#1a1a1a">${args.bodyHtml}</div>
            ${cta}
          </td>
        </tr>
        <tr>
          <td dir="rtl" style="padding:14px 24px;border-top:1px solid #eef0f2;font-size:12px;line-height:1.5;color:#6b7280;text-align:right">${footer}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendContactEmail(args: SendContactEmailArgs): Promise<void> {
  const subject = `${SUBJECT_PREFIX} ${args.subject}`.slice(0, 200);

  const lines: string[] = [];
  if (args.authUserDisplayName || args.authUserEmail) {
    lines.push('— Authenticated sender —');
    if (args.authUserDisplayName) lines.push(`Name (auth): ${args.authUserDisplayName}`);
    if (args.authUserEmail)       lines.push(`Email (auth): ${args.authUserEmail}`);
    lines.push('');
  }
  if (args.fromName || args.fromEmail) {
    lines.push('— Form sender —');
    if (args.fromName)  lines.push(`Name: ${args.fromName}`);
    if (args.fromEmail) lines.push(`Email: ${args.fromEmail}`);
    lines.push('');
  }
  lines.push('— Message —');
  lines.push(args.body);
  const text = lines.join('\n');

  // Contact-form mail goes to the internal support inbox so RTL is a
  // courtesy, not load-bearing — but rendering it consistently lets
  // a Hebrew customer's quoted message read naturally.
  const html = renderRtlEmail({
    title: args.subject || 'הודעה חדשה',
    bodyHtml: contactBodyHtml(args),
  });

  const client = new SESClient({ region: REGION });
  await client.send(new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: [RECIPIENT] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: text, Charset: 'UTF-8' },
        Html: { Data: html, Charset: 'UTF-8' },
      },
    },
    // Lets the recipient reply directly to the form sender when they
    // provided one. Falls back to the hardcoded sender otherwise.
    ReplyToAddresses: args.fromEmail ? [args.fromEmail] : [SENDER],
  }));
}

function contactBodyHtml(args: SendContactEmailArgs): string {
  const blocks: string[] = [];
  if (args.authUserDisplayName || args.authUserEmail) {
    blocks.push(`<p style="text-align:right;margin:0 0 8px 0"><strong>שולח מאומת:</strong></p>`);
    if (args.authUserDisplayName) blocks.push(`<p style="text-align:right;margin:0">${escapeHtml(args.authUserDisplayName)}</p>`);
    if (args.authUserEmail)       blocks.push(`<p style="text-align:right;margin:0 0 12px 0">${ltrSpan(args.authUserEmail)}</p>`);
  }
  if (args.fromName || args.fromEmail) {
    blocks.push(`<p style="text-align:right;margin:0 0 8px 0"><strong>פרטי טופס:</strong></p>`);
    if (args.fromName)  blocks.push(`<p style="text-align:right;margin:0">${escapeHtml(args.fromName)}</p>`);
    if (args.fromEmail) blocks.push(`<p style="text-align:right;margin:0 0 12px 0">${ltrSpan(args.fromEmail)}</p>`);
  }
  blocks.push(`<p style="text-align:right;margin:0 0 8px 0"><strong>הודעה:</strong></p>`);
  // Preserve newlines from the user's free-text body.
  blocks.push(`<div style="white-space:pre-wrap;text-align:right">${escapeHtml(args.body)}</div>`);
  return blocks.join('\n');
}

// Exposed for tests.
export const _internals = { RECIPIENT, SENDER, REGION, SUBJECT_PREFIX };

// Phase 3 — generic notification email. Used by the
// PendingNotificationDelivery worker. Differs from sendContactEmail
// in that the recipient is the agent themselves (not our support
// inbox) and there's no form-sender concept.
export interface SendNotificationEmailArgs {
  to: string;
  subject: string;
  body: string;
  // Optional CTA link rendered as a footer line. The watcher passes
  // the deep-link to /market-discovery?match=:id here so agents land
  // directly on the matched listing.
  link?: string | null;
  linkLabel?: string | null;
  // Pre-rendered HTML body. When supplied, replaces the auto-generated
  // <pre>-wrapped text body. The digest scheduler renders rich
  // per-property blocks server-side and passes them in here.
  bodyHtml?: string | null;
}

export async function sendNotificationEmail(args: SendNotificationEmailArgs): Promise<void> {
  const lines: string[] = [args.body];
  if (args.link) {
    lines.push('');
    lines.push(args.linkLabel || 'פתח באפליקציה');
    lines.push(args.link);
  }
  const text = lines.join('\n');

  const html = renderRtlEmail({
    title: args.subject,
    // Caller can pass pre-rendered HTML (digest scheduler does this)
    // or fall back to the plain-text body wrapped in a <pre> that
    // preserves the line breaks the agent already authored.
    bodyHtml:
      args.bodyHtml
      ?? `<pre style="margin:0;font-family:inherit;white-space:pre-wrap;text-align:right">${escapeHtml(args.body)}</pre>`,
    cta: args.link ? { href: args.link, label: args.linkLabel || 'פתח באפליקציה' } : null,
  });

  const client = new SESClient({ region: REGION });
  await client.send(new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: [args.to] },
    Message: {
      Subject: { Data: args.subject.slice(0, 200), Charset: 'UTF-8' },
      Body: {
        Text: { Data: text, Charset: 'UTF-8' },
        Html: { Data: html, Charset: 'UTF-8' },
      },
    },
    ReplyToAddresses: [SENDER],
  }));
}

// 2026-05-06 — batched-digest payload. The scheduler builds this from
// undispatched NotificationDispatch rows joined to MarketListing/Lead.
export interface DigestProperty {
  marketListingId: string;
  street: string | null;
  city: string | null;
  neighborhood: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  price: number | null;
  originalUrl: string | null;
  // CRM deep-link to "open" the listing inside the app.
  appLink: string | null;
  leads: { name: string; phone: string | null; matchScore: number }[];
}

export interface SendMatchDigestEmailArgs {
  to: string;
  // Total NEW leads across all properties — drives the subject count.
  totalLeads: number;
  properties: DigestProperty[];
  // Origin used to build the "פתח ב-Estia" CTA.
  origin?: string;
}

export function buildDigestSubject(totalLeads: number): string {
  return `התאמות חדשות ב-Estia · ${totalLeads} לידים חדשים`;
}

export function renderDigestBody(args: SendMatchDigestEmailArgs): { html: string; text: string } {
  const origin = args.origin || 'https://estia.co.il';
  const textLines: string[] = [];
  const htmlBlocks: string[] = [];

  textLines.push(`התאמות חדשות ב-Estia · ${args.totalLeads} לידים חדשים`);
  textLines.push('');

  for (const prop of args.properties) {
    const where = [prop.street, prop.city].filter(Boolean).join(', ');
    const headline = `נכס: ${where || 'נכס חדש'} — ${prop.leads.length} לידים חדשים`;
    textLines.push(headline);

    const specs = [
      prop.rooms != null ? `${prop.rooms} חדרים` : null,
      prop.sizeSqm != null ? `${prop.sizeSqm} מ״ר` : null,
      prop.price != null ? `₪ ${prop.price.toLocaleString('he-IL')}` : null,
    ].filter(Boolean);
    if (specs.length) textLines.push(specs.join(' · '));

    for (const lead of prop.leads) {
      textLines.push(`  • ${lead.name}${lead.phone ? ` — ${lead.phone}` : ''}`);
    }
    textLines.push('');

    // HTML block — one card per property.
    const leadsHtml = prop.leads.map((l) => {
      const phone = l.phone
        ? ` <span style="color:#6b7280">— ${ltrSpan(l.phone)}</span>`
        : '';
      return `<li style="margin:4px 0;text-align:right">${escapeHtml(l.name)}${phone}</li>`;
    }).join('');

    const specsHtml = specs.length
      ? `<p style="text-align:right;margin:6px 0;color:#4b5563;font-size:14px">${specs
          .map((s) => {
            // Latin-numeral specs (rooms count, sqm, price) need an
            // LTR span so digits render correctly inside the Hebrew
            // sentence. The Hebrew suffixes ("חדרים", "מ״ר") are RTL
            // and stay outside the span.
            if (typeof s !== 'string') return '';
            return escapeHtml(s);
          })
          .join(' · ')}</p>`
      : '';

    const ctaHref = prop.appLink
      ? `${origin}${prop.appLink}`
      : (prop.originalUrl || `${origin}/market-discovery`);

    htmlBlocks.push(`
<table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border:1px solid #eef0f2;border-radius:8px">
  <tr>
    <td dir="rtl" style="padding:14px 16px;direction:rtl;text-align:right">
      <p style="text-align:right;margin:0 0 4px 0;font-weight:600;color:#0b1320">${escapeHtml(headline)}</p>
      ${specsHtml}
      <ul style="text-align:right;padding:0;margin:8px 18px 0 0;list-style-position:inside">${leadsHtml}</ul>
      <p style="text-align:right;margin:10px 0 0 0"><a href="${escapeHtml(ctaHref)}" style="color:#0b5ed7;text-decoration:none;font-weight:600">פתח את הנכס ב-Estia ←</a></p>
    </td>
  </tr>
</table>`);
  }

  const html = renderRtlEmail({
    title: buildDigestSubject(args.totalLeads),
    bodyHtml: `<p style="text-align:right;margin:0 0 12px 0">שלום, הנה כל ההתאמות החדשות שנאספו עבורך בחצי השעה האחרונה.</p>${htmlBlocks.join('\n')}`,
    cta: { href: `${origin}/market-discovery`, label: 'פתח את כל ההתאמות' },
  });

  return { html, text: textLines.join('\n') };
}

export async function sendMatchDigestEmail(args: SendMatchDigestEmailArgs): Promise<void> {
  const { html, text } = renderDigestBody(args);
  const subject = buildDigestSubject(args.totalLeads).slice(0, 200);
  const client = new SESClient({ region: REGION });
  await client.send(new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: [args.to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: text, Charset: 'UTF-8' },
        Html: { Data: html, Charset: 'UTF-8' },
      },
    },
    ReplyToAddresses: [SENDER],
  }));
}
