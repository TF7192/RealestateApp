// MatchSendDialog — small modal that pre-fills a Hebrew WhatsApp
// template combining the matched lead's name, the listing's address,
// and the source URL. The agent can edit before opening wa.me.
//
// Why a modal: agents send dozens of these a day. Editing in the
// drawer would lose room for the rest of the match analysis. The
// dialog keeps focus tight and is dismissible with Esc.

import { useEffect, useId, useState, useMemo } from 'react';
import { MessageCircle, X } from 'lucide-react';
import Portal from '../../components/Portal';
import { displayPriceShort } from '../../lib/display';

export default function MatchSendDialog({ open, match, listing, onClose }) {
  const titleId = useId();
  const defaultText = useMemo(
    () => buildTemplate(match, listing),
    [match, listing],
  );
  const [text, setText] = useState(defaultText);
  useEffect(() => { setText(defaultText); }, [defaultText]);

  if (!open || !match || !listing) return null;
  const phone = (match.leadPhone || '').replace(/[^\d]/g, '');

  const open_wa = () => {
    if (!phone) return;
    const intl = phone.startsWith('0') ? `972${phone.slice(1)}` : phone;
    const url = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose?.();
  };

  return (
    <Portal>
      <div className="md-drawer-backdrop" onClick={onClose} style={{ zIndex: 1200 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        style={{
          position: 'fixed',
          inset: '50% auto auto 50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(480px, calc(100vw - 24px))',
          maxHeight: 'calc(100dvh - 24px)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(30,26,20,0.25))',
          padding: 18,
          zIndex: 1201,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontFamily: 'var(--font-body)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--gold-glow)', color: 'var(--gold-readable)',
            display: 'grid', placeItems: 'center',
          }}>
            <MessageCircle size={16} />
          </span>
          <h2 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            שלח ל-{match.leadName || 'ליד'}
          </h2>
          <button
            type="button"
            className="md-icon-button"
            onClick={onClose}
            aria-label="סגור"
            style={{ marginInlineStart: 'auto' }}
          >
            <X size={16} />
          </button>
        </div>

        {!phone && (
          <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', padding: 10, borderRadius: 8, fontSize: 13 }}>
            למתעניין הזה אין מספר טלפון שמור בכרטיס. פתח את המתעניין והוסף טלפון לפני השליחה.
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'vertical',
            minHeight: 160,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            type="button"
            className="btn btn-whatsapp"
            onClick={open_wa}
            disabled={!phone || !text.trim()}
          >
            <MessageCircle size={14} /> פתח WhatsApp
          </button>
        </div>
      </div>
    </Portal>
  );
}

function buildTemplate(match, listing) {
  const name = (match?.leadName || '').split(' ')[0] || '';
  const addr = [listing?.street, listing?.neighborhood, listing?.city].filter(Boolean).join(', ');
  const specs = [
    listing?.rooms != null ? `${listing.rooms} חדרים` : null,
    listing?.sizeSqm != null ? `${listing.sizeSqm} מ״ר` : null,
    listing?.floor != null ? `קומה ${listing.floor}` : null,
  ].filter(Boolean).join(' · ');
  const price = listing?.price != null ? displayPriceShort(listing.price) : null;
  const lines = [
    name ? `היי ${name},` : 'היי,',
    'מצאתי בשוק מודעה חדשה שמתאימה למה שחיפשת:',
    '',
    addr ? `📍 ${addr}` : null,
    specs ? `🏠 ${specs}` : null,
    price ? `💰 ${price}${listing?.kind === 'rent' ? ' / חודש' : ''}` : null,
    '',
    listing?.originalUrl ? `קישור למקור: ${listing.originalUrl}` : null,
    '',
    'אשמח לסדר צפייה. נוח לך?',
  ].filter((l) => l !== null);
  return lines.join('\n');
}
