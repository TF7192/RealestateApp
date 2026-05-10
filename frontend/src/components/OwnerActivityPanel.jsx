// OwnerActivityPanel — "שיח עם בעל הנכס" surface on PropertyDetail.
//
// Captures the seller-side of the negotiation triangle: commission
// conversations, owner feedback on specific buyers, price talks, tour
// permissions, marketing approvals, objections, MOU / contract talks,
// general updates. Distinct from PropertyInterestsPanel which is the
// buyer-side log.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Banknote, MessageSquare, TrendingDown, DoorOpen,
  Megaphone, AlertCircle, FileText, Activity as ActivityIcon,
  Trash2, Save, X,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import './PropertyInterestsPanel.css';

const KIND_META = {
  COMMISSION_TALK:  { label: 'שיחת עמלה',     icon: Banknote },
  PRICE_TALK:       { label: 'שיחת מחיר',     icon: TrendingDown },
  FEEDBACK_ON_LEAD: { label: 'משוב על מתעניין', icon: MessageSquare },
  TOUR_PERMISSION:  { label: 'אישור סיור',    icon: DoorOpen },
  MARKETING_UPDATE: { label: 'עדכון שיווק',   icon: Megaphone },
  OBJECTION:        { label: 'התנגדות',       icon: AlertCircle },
  CONTRACT_TALK:    { label: 'שיחת הסכם',     icon: FileText },
  GENERAL_UPDATE:   { label: 'עדכון כללי',    icon: ActivityIcon },
  OTHER:            { label: 'אחר',           icon: ActivityIcon },
};
const COMMISSION_RESP_LABELS = {
  PENDING:  'ממתין',
  ACCEPTED: 'התקבל',
  COUNTER:  'הצעה נגדית',
  REJECTED: 'נדחה',
};

function relDate(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return 'היום';
  if (d === 1) return 'אתמול';
  if (d < 7) return `לפני ${d} ימים`;
  if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
  if (d < 365) return `לפני ${Math.floor(d / 30)} חודשים`;
  return `לפני ${Math.floor(d / 365)} שנים`;
}
function fmtMoney(n) {
  if (!Number.isFinite(n) || !n) return '';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
  return `₪${n}`;
}

export default function OwnerActivityPanel({ propertyId }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listOwnerActivity(propertyId);
      setItems(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת שיח עם בעלים נכשלה');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId, toast]);

  useEffect(() => { load(); }, [load]);

  const onCreate = async (payload) => {
    try {
      await api.createOwnerActivity(propertyId, payload);
      toast?.success?.('נוסף לשיח עם בעל הנכס');
      setComposeOpen(false);
      load();
    } catch (e) {
      toast?.error?.(e?.message || 'הוספה נכשלה');
    }
  };
  const onDelete = async (id) => {
    if (!confirm('למחוק את הרשומה?')) return;
    try { await api.deleteOwnerActivity(id); load(); }
    catch (e) { toast?.error?.(e?.message || 'מחיקה נכשלה'); }
  };

  return (
    <section className="pi-panel" aria-label="שיח עם בעל הנכס" dir="rtl">
      <header className="pi-header">
        <h3 className="pi-title">
          <Banknote size={16} />
          שיח עם בעל הנכס · {items.length} {items.length === 1 ? 'רשומה' : 'רשומות'}
        </h3>
        <button
          type="button" className="pi-add-btn"
          onClick={() => setComposeOpen((v) => !v)}
        >
          {composeOpen ? <><X size={14} /> בטל</> : <><Plus size={14} /> רשומה חדשה</>}
        </button>
      </header>

      {composeOpen && (
        <ComposePopup
          title="רשומה חדשה — שיח עם בעל הנכס"
          onClose={() => setComposeOpen(false)}
        >
          <ComposeRow onSubmit={onCreate} onCancel={() => setComposeOpen(false)} />
        </ComposePopup>
      )}

      {loading ? (
        <div className="pi-empty">טוען…</div>
      ) : items.length === 0 ? (
        <div className="pi-empty">
          אין עדיין רשומות בשיח עם בעל הנכס. רשום/י את שיחת העמלה, אישורי
          סיור, משוב על מתעניינים — כל מה שתרצה/י לזכור.
        </div>
      ) : (
        <ul className="pi-timeline" style={{ background: 'transparent', padding: 0 }}>
          {items.map((it) => (
            <ActivityRow key={it.id} item={it} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}

// 2026-05-10 — Modal wrapper for the "רשומה חדשה" compose form. Was
// inline; popup keeps the timeline scrollable while the form is open.
function ComposePopup({ title, onClose, children }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);
  return createPortal(
    <div
      className="pi-popup-back"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="pi-popup-card" dir="rtl">
        <header className="pi-popup-head">
          <span className="pi-popup-title">{title}</span>
          <button type="button" className="pi-popup-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>
        <div className="pi-popup-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function ActivityRow({ item, onDelete }) {
  const meta = KIND_META[item.kind] || KIND_META.OTHER;
  const Icon = meta.icon;
  const commissionLabel = item.kind === 'COMMISSION_TALK'
    ? buildCommissionLabel(item)
    : null;
  return (
    <li className={`pi-event pi-event-${item.kind.toLowerCase()}`}>
      <span className="pi-event-icon"><Icon size={14} /></span>
      <div className="pi-event-body">
        <div className="pi-event-title">
          {meta.label}: {item.title}
          {commissionLabel && <span style={{ marginInlineStart: 6, fontWeight: 800 }}>· {commissionLabel}</span>}
        </div>
        {item.notes && <div className="pi-event-sub">{item.notes}</div>}
        {item.relatedLead && (
          <div className="pi-event-sub">
            לגבי מתעניין: <strong>{item.relatedLead.name}</strong>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span className="pi-event-time">{relDate(item.occurredAt)}</span>
        <button
          type="button" onClick={() => onDelete(item.id)} aria-label="מחק"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(30,26,20,0.4)', padding: 2,
          }}
        ><Trash2 size={13} /></button>
      </div>
    </li>
  );
}
function buildCommissionLabel(item) {
  const parts = [];
  if (item.commissionPct != null) parts.push(`${item.commissionPct}%`);
  if (item.commissionFlat != null) parts.push(fmtMoney(item.commissionFlat));
  if (item.commissionResponse) parts.push(`(${COMMISSION_RESP_LABELS[item.commissionResponse] || item.commissionResponse})`);
  return parts.join(' · ');
}

function ComposeRow({ onSubmit, onCancel }) {
  const [kind, setKind] = useState('GENERAL_UPDATE');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [commissionPct, setCommissionPct] = useState('');
  const [commissionFlat, setCommissionFlat] = useState('');
  const [commissionResponse, setCommissionResponse] = useState('PENDING');

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!title.trim()) return;
    const payload = {
      kind, title: title.trim(),
      notes: notes.trim() || null,
    };
    if (kind === 'COMMISSION_TALK') {
      if (commissionPct) payload.commissionPct = Number(commissionPct);
      if (commissionFlat) payload.commissionFlat = Number(commissionFlat);
      payload.commissionResponse = commissionResponse;
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} dir="rtl" style={{
      display: 'grid', gap: 8, padding: 12, marginBottom: 12,
      background: 'rgba(180,139,76,0.05)',
      border: '1px solid rgba(180,139,76,0.2)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={selectStyle}>
          {Object.entries(KIND_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <input
          type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת קצרה (לדוגמה: הצעתי 2%, ענה ממתין)"
          required
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
      </div>
      {kind === 'COMMISSION_TALK' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="number" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)}
            placeholder="אחוז" step="0.1" min="0" max="100"
            style={{ ...inputStyle, width: 90 }}
          />
          <span style={{ color: 'rgba(30,26,20,0.5)', fontSize: 12 }}>או</span>
          <input
            type="number" value={commissionFlat} onChange={(e) => setCommissionFlat(e.target.value)}
            placeholder="₪ סכום קבוע" min="0"
            style={{ ...inputStyle, width: 140 }}
          />
          <select value={commissionResponse} onChange={(e) => setCommissionResponse(e.target.value)} style={selectStyle}>
            {Object.entries(COMMISSION_RESP_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      )}
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder="הערות נוספות (אופציונלי)"
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-start' }}>
        <button type="submit" className="pi-add-btn">
          <Save size={13} /> שמור
        </button>
        <button type="button" onClick={onCancel} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(30,26,20,0.12)',
          background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
        }}>בטל</button>
      </div>
    </form>
  );
}

const inputStyle = {
  fontFamily: 'inherit', fontSize: 13,
  padding: '7px 10px', borderRadius: 8,
  border: '1px solid rgba(30,26,20,0.14)',
  background: '#fff', color: '#1e1a14',
  direction: 'rtl', textAlign: 'right',
};
const selectStyle = { ...inputStyle, paddingInlineEnd: 28 };
