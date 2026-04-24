// ShareDialog — universal channel-picker for sharing a property / catalog /
// agent card / contract via WhatsApp, SMS, email, link-copy, and (on iOS)
// the OS share sheet. All channels are free deep-links — no backend.
//
// Sprint 7 port-of-the-claude.ai/design bundle: replaces per-page share
// UIs and the legacy ShareCatalogDialog (which now delegates here).
//
// Accepts `{ kind, entity, onClose }`:
//   kind   — 'property' | 'catalog' | 'agent' | 'contract'
//   entity — shape depends on kind:
//     property : { property, agent, templates?, url?, message? }
//     catalog  : { url, agentName? }
//     agent    : { agent, url }
//     contract : { contract, url?, recipient? }
//
// The dialog builds a default title, url, and message from the entity
// (or lets the caller pass `url` / `message` straight through). The
// user can edit the message + optional recipient phone before firing
// any channel.

import { useId, useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  MessageCircle,
  Mail,
  MessageSquare,
  Link2,
  Send,
  Smartphone,
  AlertCircle,
} from 'lucide-react';
import Portal from './Portal';
import { useToast } from '../lib/toast';
import { track } from '../lib/analytics';
import { isNative, isIOS } from '../native/platform';
import { shareSheet, openWhatsApp } from '../native/share';
import {
  buildVariables as tplBuildVars,
  renderTemplate as tplRender,
  pickTemplateKind as tplPickKind,
} from '../lib/templates';
import { normalizeIsraeliPhone } from '../lib/waLink';

// Cream & Gold DT tokens — match OwnerEditDialog / ContractDetail / the
// rest of the port.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// ────────────────────────────────────────────────────────────────
// Deep-link builders — pure functions so they can be unit-tested
// without rendering the dialog.
// ────────────────────────────────────────────────────────────────
export function buildWaHref(phone, text) {
  const digits = normalizeIsraeliPhone(phone);
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return digits ? `https://wa.me/${digits}${t}` : `https://wa.me/${t}`;
}

export function buildSmsHref(phone, text) {
  // iOS uses `&body=`, Android accepts `?body=`. `?body=` works on both.
  const body = text ? `?&body=${encodeURIComponent(text)}` : '';
  const to = (phone || '').replace(/[^\d+]/g, '');
  return `sms:${to}${body}`;
}

export function buildMailtoHref(to, subject, body) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    params.push(`body=${encodeURIComponent(body)}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  return `mailto:${to || ''}${qs}`;
}

// ────────────────────────────────────────────────────────────────
// Default title / url / message per kind. Callers can always
// override via `entity.url` / `entity.message` — these are the
// fallbacks used when the caller doesn't supply them.
// ────────────────────────────────────────────────────────────────
function defaultsFor({ kind, entity }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (kind === 'property') {
    const { property, agent, templates, url, message } = entity || {};
    if (!property) return { title: 'שיתוף נכס', url: url || '', message: message || '' };
    const slugPath = property.slug && (agent?.slug || property.agentSlug)
      ? `/agents/${encodeURI(agent?.slug || property.agentSlug)}/${encodeURI(property.slug)}`
      : `/p/${property.id}`;
    const finalUrl = url || `${origin}${slugPath}`;
    let finalMessage = message || '';
    if (!finalMessage) {
      const kindKey = tplPickKind(property, 'client');
      const tpl = (templates || []).find((t) => t.kind === kindKey);
      if (tpl?.body) {
        const vars = tplBuildVars(property, agent, { stripAgent: false });
        finalMessage = tplRender(tpl.body, vars);
      } else {
        // Minimal built-in fallback — keeps the dialog useful even
        // when the agent hasn't created any templates yet.
        finalMessage = [
          `${property.type || 'נכס'} ב${property.street || ''}, ${property.city || ''}`,
          property.rooms ? `${property.rooms} חדרים · ${property.sqm || '—'} מ״ר` : null,
          finalUrl,
        ].filter(Boolean).join('\n');
      }
    }
    const title = `${property.street || ''}${property.city ? ', ' + property.city : ''}`.trim()
      || 'שיתוף נכס';
    return { title, url: finalUrl, message: finalMessage, subject: title };
  }

  if (kind === 'catalog') {
    const { url, agentName } = entity || {};
    const finalUrl = url || '';
    const name = agentName || 'הסוכן שלך';
    const message = [
      `שלום, זה ${name}.`,
      '',
      'ריכזתי עבורך את כל הנכסים שלי במקום אחד:',
      finalUrl,
      '',
      'אשמח לעמוד לרשותך לתיאום ביקור או לכל שאלה.',
    ].join('\n');
    return {
      title: 'הקטלוג האישי',
      url: finalUrl,
      message,
      subject: `הקטלוג של ${name}`,
    };
  }

  if (kind === 'agent') {
    const { agent, url } = entity || {};
    const finalUrl = url
      || (agent?.slug ? `${origin}/agents/${encodeURI(agent.slug)}` : origin);
    const displayName = agent?.displayName || 'סוכן';
    const agency = agent?.agentProfile?.agency || agent?.agency;
    const message = [
      `כרטיס הסוכן של ${displayName}${agency ? ' · ' + agency : ''}`,
      finalUrl,
    ].join('\n');
    return {
      title: displayName,
      url: finalUrl,
      message,
      subject: `פרטי קשר — ${displayName}`,
    };
  }

  if (kind === 'contract') {
    const { contract, url, recipient } = entity || {};
    const contractTitle = contract?.title
      || (contract?.type === 'EXCLUSIVITY' ? 'הסכם בלעדיות'
        : contract?.type === 'BROKERAGE'   ? 'הסכם תיווך'
        : contract?.type === 'OFFER'       ? 'הצעת רכישה'
        : 'חוזה');
    const finalUrl = url
      || (contract?.id ? `${origin}/contracts/${contract.id}` : '');
    const message = [
      recipient ? `שלום ${recipient},` : 'שלום,',
      `מצ״ב ${contractTitle} לעיונך:`,
      finalUrl,
    ].filter(Boolean).join('\n');
    return {
      title: contractTitle,
      url: finalUrl,
      message,
      subject: contractTitle,
    };
  }

  return { title: 'שיתוף', url: entity?.url || '', message: entity?.message || '' };
}

/**
 * ShareDialog — universal channel-picker. Used for property / catalog /
 * agent-card / contract shares. Pure front-end, deep-links only.
 */
export default function ShareDialog({ kind = 'property', entity, onClose }) {
  const toast = useToast();
  const titleId = useId();
  const phoneInputId = useId();
  const messageInputId = useId();

  const defaults = useMemo(() => defaultsFor({ kind, entity }), [kind, entity]);

  const [message, setMessage]   = useState(defaults.message || '');
  const [recipient, setRecipient] = useState(entity?.recipient?.phone || '');
  const [recipientEmail, setRecipientEmail] = useState(entity?.recipient?.email || '');
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState(null);

  const shareUrl    = defaults.url || '';
  const shareTitle  = defaults.title || 'שיתוף';
  const subject     = defaults.subject || shareTitle;
  // Fire-and-forget analytics — `track` is a no-op outside production.
  const emit = (channel) => {
    try {
      track('share_dialog_channel', {
        kind,
        channel,
        has_recipient: !!recipient,
      });
    } catch { /* no-op */ }
  };

  const handleWhatsApp = async () => {
    setError(null);
    emit('whatsapp');
    // Prefer the native/web-aware wrapper so WKWebView jumps to the
    // WhatsApp app via deep-link instead of opening a nested WebView.
    await openWhatsApp({ phone: recipient, text: message });
  };

  const handleSms = () => {
    setError(null);
    emit('sms');
    const href = buildSmsHref(recipient, message);
    // `window.location.href` works across iOS Safari + Android Chrome
    // for `sms:`. `window.open` sometimes no-ops on iOS for the
    // scheme, depending on the pop-up blocker. Direct nav is safer.
    try { window.location.href = href; }
    catch { setError('לא ניתן לפתוח את אפליקציית ההודעות'); }
  };

  const handleEmail = () => {
    setError(null);
    emit('email');
    const href = buildMailtoHref(recipientEmail, subject, message);
    try { window.location.href = href; }
    catch { setError('לא ניתן לפתוח את אפליקציית המייל'); }
  };

  const handleCopy = async () => {
    setError(null);
    emit('copy');
    const payload = shareUrl || message;
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast?.success?.('הקישור הועתק');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('לא ניתן להעתיק — העתק ידנית מתיבת ההודעה');
    }
  };

  const handleSystemShare = async () => {
    setError(null);
    emit('system');
    try {
      await shareSheet({ title: shareTitle, text: message, url: shareUrl });
    } catch {
      setError('שיתוף המערכת נכשל');
    }
  };

  // Surface the OS share button on native iOS (always) and on browsers
  // that expose navigator.share (Safari iOS, recent Chrome Android).
  const showSystemShare =
    isNative()
    || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  return (
    <Portal>
      <div
        dir="rtl"
        onClick={onClose}
        style={{
          ...FONT,
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, zIndex: 2300,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 560,
            maxHeight: 'calc(100vh - 32px)',
            overflow: 'auto',
            background: DT.cream4,
            color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(30,26,20,0.15)',
            padding: 24,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id={titleId}
                style={{
                  margin: 0, fontSize: 18, fontWeight: 800,
                  color: DT.ink, letterSpacing: -0.3,
                }}
              >
                שיתוף {labelFor(kind)}
              </h3>
              <p style={{
                margin: '4px 0 0', color: DT.muted, fontSize: 13,
              }}>
                בחר ערוץ · עריכת ההודעה מותרת לפני שליחה
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                ...FONT,
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent',
                border: `1px solid ${DT.border}`,
                color: DT.ink, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </header>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(185,28,28,0.08)',
                color: DT.danger,
                border: `1px solid rgba(185,28,28,0.2)`,
                padding: '10px 12px', borderRadius: 10,
                fontSize: 13,
              }}
            >
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* URL preview strip */}
          {shareUrl && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px',
              background: DT.white,
              border: `1px solid ${DT.border}`,
              borderRadius: 10,
            }}>
              <code style={{
                flex: 1,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: DT.goldDark,
                direction: 'ltr',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {shareUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                style={ghostChip()}
                aria-label="העתק קישור"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'הועתק' : 'העתק'}
              </button>
            </div>
          )}

          {/* Recipient phone (optional) */}
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
            <Field label="נמען — טלפון (אופציונלי)" htmlFor={phoneInputId}>
              <input
                id={phoneInputId}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="05X-XXX-XXXX"
                style={inputStyle()}
              />
            </Field>
            <Field label="נמען — אימייל (אופציונלי)">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="name@example.com"
                style={inputStyle()}
              />
            </Field>
          </div>

          {/* Editable message */}
          <Field label="הודעה" htmlFor={messageInputId}>
            <textarea
              id={messageInputId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              style={{ ...inputStyle(), resize: 'vertical', minHeight: 120 }}
              placeholder="כתוב את ההודעה שתישלח…"
            />
          </Field>

          {/* Channel buttons */}
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}>
            <button
              type="button"
              data-channel="whatsapp"
              onClick={handleWhatsApp}
              style={primaryBtn()}
            >
              <MessageCircle size={14} />
              שלח בוואטסאפ
            </button>
            <button
              type="button"
              data-channel="sms"
              onClick={handleSms}
              style={secondaryBtn()}
            >
              <MessageSquare size={14} />
              שלח ב-SMS
            </button>
            <button
              type="button"
              data-channel="email"
              onClick={handleEmail}
              style={secondaryBtn()}
            >
              <Mail size={14} />
              שלח במייל
            </button>
            <button
              type="button"
              data-channel="copy"
              onClick={handleCopy}
              style={secondaryBtn()}
            >
              {copied ? <Check size={14} /> : <Link2 size={14} />}
              {copied ? 'הועתק' : 'העתק קישור'}
            </button>
            {showSystemShare && (
              <button
                type="button"
                data-channel="system"
                onClick={handleSystemShare}
                style={secondaryBtn()}
              >
                {isIOS() ? <Smartphone size={14} /> : <Send size={14} />}
                מערכת
              </button>
            )}
          </div>

          {/* Footer — cancel */}
          <footer style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            paddingTop: 4, flexWrap: 'wrap',
          }}>
            <button type="button" onClick={onClose} style={ghostBtn()}>
              ביטול
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

// Internal helper — user-facing label per share kind.
function labelFor(kind) {
  switch (kind) {
    case 'property': return 'נכס';
    case 'catalog':  return 'קטלוג';
    case 'agent':    return 'כרטיס סוכן';
    case 'contract': return 'חוזה';
    default:         return '';
  }
}

function Field({ label, htmlFor, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={htmlFor} style={{
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    ...FONT,
    width: '100%',
    padding: '10px 12px',
    background: DT.white,
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
    color: DT.ink,
    fontSize: 14,
    outline: 'none',
  };
}

function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 14px', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
  };
}

function secondaryBtn() {
  return {
    ...FONT,
    background: DT.white,
    border: `1px solid ${DT.borderStrong}`,
    color: DT.ink,
    padding: '10px 14px', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
  };
}

function ghostBtn() {
  return {
    ...FONT,
    background: 'transparent',
    border: `1px solid ${DT.border}`,
    padding: '10px 16px', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    color: DT.ink,
    display: 'inline-flex', gap: 6, alignItems: 'center',
  };
}

function ghostChip() {
  return {
    ...FONT,
    background: 'transparent',
    border: `1px solid ${DT.border}`,
    padding: '5px 10px', borderRadius: 8,
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
    color: DT.ink,
    display: 'inline-flex', gap: 4, alignItems: 'center',
    flexShrink: 0,
  };
}
