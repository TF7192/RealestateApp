import { useEffect, useState } from 'react';
import { X, UserPlus, MessageCircle, Check, AlertCircle, Send, Search } from 'lucide-react';
import api from '../lib/api';
import { openWhatsApp } from '../native/share';
import { useToast, optimisticUpdate } from '../lib/toast';
import {
  buildVariables as tplBuildVars,
  renderTemplate as tplRender,
} from '../lib/templates';
import Portal from './Portal';
import './TransferPropertyDialog.css';

/**
 * Move-a-property dialog.
 *
 * Tab 1 — In-app handover: the agent looks up another registered agent by
 * email, writes an optional note, and initiates a PENDING transfer. The
 * receiving agent sees it in their /transfers inbox and accepts/declines.
 *
 * Tab 2 — WhatsApp-only: builds a clean property brief (no agent info) and
 * opens WhatsApp; logs a WHATSAPP_SENT transfer row for audit.
 */
export default function TransferPropertyDialog({ property, onClose, onDone }) {
  const toast = useToast();
  const [tab, setTab] = useState('in-app');

  // In-app state
  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // WhatsApp state — initialize with the agent's TRANSFER template if set,
  // otherwise fall back to the hardcoded property brief.
  const [waText, setWaText] = useState(() => buildPropertyBrief(property));
  useEffect(() => {
    api.listTemplates().then((r) => {
      const tpl = r.templates?.find((t) => t.kind === 'TRANSFER');
      if (tpl?.body) {
        const vars = tplBuildVars(property, null, { stripAgent: true });
        setWaText(tplRender(tpl.body, vars));
      }
    }).catch(() => {});
  }, [property]);

  const search = async () => {
    setErr(null);
    if (!email.trim()) return;
    setSearching(true);
    try {
      const r = await api.searchAgentByEmail(email.trim());
      if (r.self) {
        setErr('לא ניתן להעביר לעצמך');
        setFound(null);
      } else if (r.agent) {
        setFound(r.agent);
      } else {
        setErr('לא נמצא סוכן רשום עם אימייל זה');
        setFound(null);
      }
    } catch (e) {
      setErr(e.message || 'חיפוש נכשל');
    } finally {
      setSearching(false);
    }
  };

  const initiate = async () => {
    if (!found) return;
    setBusy(true);
    try {
      await optimisticUpdate(toast, {
        label: 'שולח בקשת העברה…',
        success: 'בקשת העברה נשלחה',
        onSave: () =>
          api.initiateTransfer(property.id, {
            toAgentEmail: found.email,
            message: note || null,
          }),
      });
      onDone?.();
      onClose?.();
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    // Log the share for audit (best effort)
    try { await api.logWhatsappTransfer(property.id); } catch { /* non-blocking */ }
    // On iOS this opens the native WhatsApp app via deep link; on web it
    // opens wa.me in a new tab. The user picks the receiving agent inside
    // WhatsApp's own contact picker.
    await openWhatsApp({ text: waText });
    toast.success('נפתח וואטסאפ — בחר/י את נמען הסוכן');
    onDone?.();
    onClose?.();
  };

  return (
    <Portal>
      <div className="tpd-backdrop" onClick={onClose}>
        <div className="tpd-modal" onClick={(e) => e.stopPropagation()}>
          <header className="tpd-header">
            <div>
              <h3>העברת נכס</h3>
              <p>{property.street}, {property.city}</p>
            </div>
            <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
          </header>

          <div className="tpd-tabs">
            <button
              className={`tpd-tab ${tab === 'in-app' ? 'active' : ''}`}
              onClick={() => setTab('in-app')}
            >
              <UserPlus size={14} />
              העברה לסוכן במערכת
            </button>
            <button
              className={`tpd-tab ${tab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => setTab('whatsapp')}
            >
              <MessageCircle size={14} />
              שליחת פרטים בוואטסאפ
            </button>
          </div>

          <div className="tpd-body">
            {err && <div className="tpd-error"><AlertCircle size={14} />{err}</div>}

            {tab === 'in-app' && (
              <>
                <p className="tpd-lead">
                  הזן אימייל של סוכן רשום במערכת. לאחר אישור הסוכן המקבל — הבעלות על
                  הנכס תועבר אליו באופן אוטומטי.
                </p>
                <label className="tpd-label">אימייל הסוכן המקבל</label>
                <div className="tpd-search-row">
                  <input
                    type="email"
                    className="tpd-input"
                    placeholder="agent@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFound(null); setErr(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
                    dir="ltr"
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={search}
                    disabled={searching || !email.trim()}
                  >
                    <Search size={14} />
                    {searching ? 'מחפש…' : 'חפש'}
                  </button>
                </div>

                {found && (
                  <div className="tpd-agent-card">
                    <div className="tpd-agent-avatar">
                      {found.avatarUrl
                        ? <img src={found.avatarUrl} alt="" />
                        : <span>{found.displayName.charAt(0)}</span>}
                    </div>
                    <div className="tpd-agent-info">
                      <strong>{found.displayName}</strong>
                      <small>{found.email}{found.agency ? ` · ${found.agency}` : ''}</small>
                    </div>
                    <span className="tpd-found-pill">
                      <Check size={13} /> נמצא
                    </span>
                  </div>
                )}

                <label className="tpd-label">הערה (אופציונלי)</label>
                <textarea
                  className="tpd-textarea"
                  rows={3}
                  placeholder="למשל: עוזב את האזור, העלה את הנכס שלי…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </>
            )}

            {tab === 'whatsapp' && (
              <>
                <p className="tpd-lead">
                  ישלח לסוכן את הפרטים הפרקטיים של הנכס בלבד — ללא פרטי הקשר שלך.
                  בחר/י נמען בתוך וואטסאפ כמו בהודעה רגילה.
                </p>
                <label className="tpd-label">ההודעה שתישלח</label>
                <textarea
                  className="tpd-textarea"
                  rows={11}
                  value={waText}
                  onChange={(e) => setWaText(e.target.value)}
                />
                <div className="tpd-hint">
                  ההודעה כוללת מחיר, שטח, מאפיינים, ותמונה — בלי טלפון או שם שלך.
                </div>
              </>
            )}
          </div>

          <footer className="tpd-footer">
            <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
            {tab === 'in-app' ? (
              <button
                className="btn btn-primary"
                disabled={!found || busy}
                onClick={initiate}
              >
                <Send size={14} />
                שלח בקשת העברה
              </button>
            ) : (
              <button className="btn btn-primary" onClick={sendWhatsApp}>
                <MessageCircle size={14} />
                פתח בוואטסאפ
              </button>
            )}
          </footer>
        </div>
      </div>
    </Portal>
  );
}

function fmt(v) { return v == null ? '—' : v; }
function price(v) {
  if (!v) return '—';
  if (v < 10000) return `₪${v.toLocaleString('he-IL')}/חודש`;
  return `₪${v.toLocaleString('he-IL')}`;
}

function buildPropertyBrief(p) {
  if (!p) return '';
  const assetLabel = p.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים';
  const catLabel = p.category === 'SALE' ? 'למכירה' : 'להשכרה';
  const lines = [];
  lines.push(`*${p.type} ${catLabel}* — ${p.street}, ${p.city}`);
  lines.push('');
  lines.push(`💰 מחיר: ${price(p.marketingPrice)}`);
  lines.push(`📐 שטח: ${p.sqm} מ״ר`);
  if (p.rooms != null) lines.push(`🛏️ חדרים: ${p.rooms}`);
  if (p.floor != null) lines.push(`🏢 קומה: ${p.floor}/${p.totalFloors ?? '?'}`);
  if (p.balconySize > 0) lines.push(`🌤️ מרפסת: ${p.balconySize} מ״ר`);
  lines.push(`🏷️ סיווג: ${assetLabel}`);
  const features = [];
  if (p.parking) features.push('חניה');
  if (p.storage) features.push('מחסן');
  if (p.ac) features.push('מזגנים');
  if (p.elevator) features.push('מעלית');
  if (p.assetClass === 'RESIDENTIAL' && p.safeRoom) features.push('ממ״ד');
  if (features.length) lines.push(`✅ ${features.join(' · ')}`);
  if (p.renovated) lines.push(`🛠️ מצב: ${p.renovated}`);
  if (p.vacancyDate) lines.push(`📅 פינוי: ${p.vacancyDate}`);
  if (p.airDirections) lines.push(`🧭 כיוונים: ${p.airDirections}`);
  if (p.assetClass === 'COMMERCIAL' && p.sqmArnona) lines.push(`📄 מ״ר ארנונה: ${p.sqmArnona}`);
  if (p.notes) {
    lines.push('');
    lines.push(`📝 ${p.notes}`);
  }
  if (p.images?.length) {
    lines.push('');
    lines.push(`📷 תמונות: ${window.location.origin}/p/${p.id}`);
  }
  return lines.join('\n');
}
