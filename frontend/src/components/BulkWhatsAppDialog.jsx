// BulkWhatsAppDialog — agent picks N leads on /customers, opens this
// dialog, types one message, clicks "שלח". The browser pops a wa.me
// link with the text pre-filled; the agent then chooses recipients
// inside WhatsApp Web / mobile.
//
// Why not loop wa.me/{phone}?text per recipient: that would open N
// browser tabs, each starting its own WhatsApp tab — agents have
// repeatedly said it's a worse experience than picking the contacts
// once inside WhatsApp's own UI. The send-to-self trick (wa.me/
// without a phone) opens WA's contact picker pre-loaded with the
// composed text.
//
// Schema:
//   props.leads:  Array<{ id, name, phone? }>
//   props.onClose
import { useEffect, useRef, useState } from 'react';
import { X, MessageCircle, Send } from 'lucide-react';

const PALETTE = {
  ink: '#1e1a14', muted: '#6b6356', cream: '#fbf7f0',
  border: 'rgba(30,26,20,0.14)',
  green: '#25d366', greenDark: '#128c7e',
};

export default function BulkWhatsAppDialog({ leads = [], onClose }) {
  const safeLeads = Array.isArray(leads) ? leads.filter(Boolean) : [];
  const withPhone = safeLeads.filter((l) => l.phone);
  const withoutPhone = safeLeads.length - withPhone.length;

  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    // wa.me/?text= opens WhatsApp's "send to" picker so the agent
    // chooses recipients inside the WhatsApp UI. No ?phone= because
    // we'd need a single number — bulk sending is the user's job.
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="שליחת הודעת WhatsApp לכמה מתעניינים"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30,26,20,0.5)',
        display: 'grid', placeItems: 'center', zIndex: 100, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          background: '#fff', borderRadius: 14, width: '100%',
          maxWidth: 520, border: `1px solid ${PALETTE.border}`,
          padding: 20, direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{
            margin: 0, fontSize: 16, fontWeight: 800, color: PALETTE.ink,
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <MessageCircle size={18} color={PALETTE.green} />
            שליחת WhatsApp ל-{withPhone.length} מתעניינים
          </h3>
          <button
            type="button" onClick={onClose} aria-label="סגור"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 4, color: PALETTE.muted,
            }}
          ><X size={18} /></button>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: PALETTE.muted, lineHeight: 1.5 }}>
          ההודעה תיפתח ב-WhatsApp עם הטקסט שהקלדת — תוכל/י לבחור שם את
          הנמענים מהרשימה האישית שלך.
          {withoutPhone > 0 && (
            <div style={{ marginTop: 6, color: '#b45309' }}>
              {withoutPhone} מתעניינים שנבחרו ללא מספר טלפון — לא ייכללו ברשימת
              ההצעות.
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="bulk-wa-msg" style={{
            display: 'block', fontSize: 12, fontWeight: 700,
            color: PALETTE.muted, marginBottom: 6, textAlign: 'right',
          }}>תוכן ההודעה</label>
          <textarea
            id="bulk-wa-msg"
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            dir="rtl"
            placeholder="שלום,&#10;עדכון על נכסים חדשים שיכולים להתאים לך…"
            style={{
              width: '100%', minHeight: 140, padding: 12, fontSize: 14,
              borderRadius: 10, border: `1px solid ${PALETTE.border}`,
              fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
              direction: 'rtl', textAlign: 'right',
            }}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || withPhone.length === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              cursor: text.trim() && withPhone.length > 0 ? 'pointer' : 'not-allowed',
              background: `linear-gradient(135deg, ${PALETTE.green} 0%, ${PALETTE.greenDark} 100%)`,
              color: '#fff', border: 'none',
              opacity: text.trim() && withPhone.length > 0 ? 1 : 0.5,
              boxShadow: '0 4px 12px rgba(37,211,102,0.32)',
            }}
          >
            <Send size={14} /> פתח ב-WhatsApp
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: '#fff', color: PALETTE.ink,
              border: `1px solid ${PALETTE.border}`, cursor: 'pointer',
            }}
          >ביטול</button>
        </div>

        {withPhone.length > 0 && (
          <details style={{ marginTop: 14, fontSize: 12, color: PALETTE.muted }}>
            <summary style={{ cursor: 'pointer' }}>מתעניינים שנבחרו ({withPhone.length})</summary>
            <div style={{ marginTop: 6, lineHeight: 1.6 }}>
              {withPhone.map((l) => l.name || 'ללא שם').join(' · ')}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
