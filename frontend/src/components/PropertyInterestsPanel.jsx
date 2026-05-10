// PropertyInterestsPanel — the "לוח פעילות · מתעניינים בנכס" surface.
//
// Dual-mode component:
//   <PropertyInterestsPanel propertyId="..." />  → list of leads on a property
//   <PropertyInterestsPanel leadId="..." />       → list of properties for a lead
//
// Each row is a compact card with:
//   - Counterparty header (lead name / property address)
//   - Heat / price meta
//   - Stat chips (סיורים / הצעות / הסכמים / פגישות + top offer ₪)
//   - "פעילות אחרונה" line
//   - Status pill (בתהליך / נסגר / נפל / מושהה) clickable to change
//   - Inline action buttons: + סיור / + הצעה / + הסכם / + פגישה / + הערה
//   - Expandable timeline ("הצג היסטוריה מלאה") rendering the merged event log
//
// No side drawer — everything lives inline on the page per Adam's
// "deeply incorporated" requirement.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Footprints, Banknote, FileText, Calendar as CalendarIcon,
  MessageSquare, Trash2, ChevronDown, ChevronUp, Building2, User as UserIcon,
  Pencil, Save, X,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import LeadPickerSheet from './LeadPickerSheet';
import './PropertyInterestsPanel.css';

const STATUS_LABELS = {
  IN_PROGRESS: 'בתהליך',
  CLOSED:      'נסגר',
  FELL:        'נפל',
  PAUSED:      'מושהה',
};
const STATUS_TONES = {
  IN_PROGRESS: 'pi-tone-active',
  CLOSED:      'pi-tone-won',
  FELL:        'pi-tone-lost',
  PAUSED:      'pi-tone-pause',
};
const HEAT_LABELS = { HOT: 'חם', WARM: 'חמים', COLD: 'קר' };
const HEAT_TONES = { HOT: 'pi-heat-hot', WARM: 'pi-heat-warm', COLD: 'pi-heat-cold' };

// Hebrew "relative date" for the "last activity" line.
function relDate(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7)  return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
  return `לפני ${Math.floor(days / 365)} שנים`;
}

function fmtMoney(n) {
  if (!Number.isFinite(n) || !n) return '';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `₪${Math.round(n / 1_000)}K`;
  return `₪${n}`;
}

export default function PropertyInterestsPanel({
  propertyId,
  leadId,
  // Optional caller-supplied lead list used to populate the LeadPickerSheet
  // — when null we fall back to api.listLeads. The CustomerDetail caller
  // doesn't open the picker (the panel shows properties, not leads) so it
  // can pass `pickerDisabled`.
  pickerDisabled = false,
  // Optional title override.
  title,
}) {
  const toast = useToast();
  const mode = propertyId ? 'property' : 'lead';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allLeads, setAllLeads] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = mode === 'property'
        ? await api.listPropertyInterests(propertyId)
        : await api.listLeadInterests(leadId);
      setItems(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת המתעניינים נכשלה');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [mode, propertyId, leadId, toast]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load the leads list for the picker on first open.
  useEffect(() => {
    if (!pickerOpen || allLeads.length > 0 || mode !== 'property') return;
    api.listLeads().then((r) => setAllLeads(r?.items || [])).catch(() => {});
  }, [pickerOpen, allLeads.length, mode]);

  const onAttach = async (selectedLeadIds) => {
    setPickerOpen(false);
    if (!selectedLeadIds?.length) return;
    try {
      await api.createPropertyInterests(propertyId, selectedLeadIds);
      toast?.success?.(`${selectedLeadIds.length} מתעניינים שויכו לנכס`);
      load();
    } catch (e) {
      toast?.error?.(e?.message || 'שיוך נכשל');
    }
  };

  const onStatusChange = async (interestId, nextStatus) => {
    try {
      await api.updateInterest(interestId, { status: nextStatus });
      load();
    } catch (e) {
      toast?.error?.(e?.message || 'עדכון סטטוס נכשל');
    }
  };

  const onDetach = async (interestId) => {
    if (!confirm('להסיר את השיוך?')) return;
    try {
      await api.deleteInterest(interestId);
      toast?.success?.('השיוך הוסר');
      load();
    } catch (e) {
      toast?.error?.(e?.message || 'הסרת השיוך נכשלה');
    }
  };

  const headerTitle = title || (mode === 'property'
    ? `מתעניינים בנכס · ${items.filter((i) => i.status === 'IN_PROGRESS').length} בתהליך`
    : `נכסים בליווי · ${items.filter((i) => i.status === 'IN_PROGRESS').length} בתהליך`);

  return (
    <section className="pi-panel" aria-label={headerTitle} dir="rtl">
      <header className="pi-header">
        <h3 className="pi-title">
          {mode === 'property' ? <UserIcon size={16} /> : <Building2 size={16} />}
          {headerTitle}
        </h3>
        {mode === 'property' && !pickerDisabled && (
          <button type="button" className="pi-add-btn" onClick={() => setPickerOpen(true)}>
            <Plus size={14} /> הוסף מתעניין
          </button>
        )}
      </header>

      {loading ? (
        <div className="pi-empty">טוען…</div>
      ) : items.length === 0 ? (
        <div className="pi-empty">
          {mode === 'property'
            ? 'אין מתעניינים משויכים. שייך לקוחות כדי להתחיל לעקוב אחרי הסיורים, ההצעות וההסכמים.'
            : 'הליד עדיין לא משויך לאף נכס. ניתן לשייך אותו מתוך עמוד הנכס.'}
        </div>
      ) : (
        <ul className="pi-rows">
          {items.map((it) => (
            <InterestRow
              key={it.id}
              interest={it}
              mode={mode}
              isExpanded={expandedId === it.id}
              onToggleExpand={() => setExpandedId(expandedId === it.id ? null : it.id)}
              onStatusChange={onStatusChange}
              onDetach={onDetach}
              onActionCreated={load}
            />
          ))}
        </ul>
      )}

      {pickerOpen && (
        <LeadPickerSheet
          property={null}
          leads={allLeads}
          previewText="בחר את המתעניינים שברצונך לשייך לנכס"
          onPick={(lead) => onAttach([lead.id])}
          onMulti={(leads) => onAttach(leads.map((l) => l.id))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

function InterestRow({
  interest: it,
  mode,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onDetach,
  onActionCreated,
}) {
  const counterparty = mode === 'property' ? it.lead : it.property;
  const heat = mode === 'property' ? it.lead?.status : null;
  const stats = it.stats || {};
  // Currently-open inline form: 'viewing' | 'offer' | 'agreement' |
  // 'meeting' | 'commission' | 'deal-notes' | null. Mutually exclusive
  // so the row never becomes a wall of forms.
  const [activeForm, setActiveForm] = useState(null);

  return (
    <li className={`pi-row pi-row-status-${it.status?.toLowerCase()}`}>
      <div className="pi-row-head">
        <div className="pi-row-identity">
          {mode === 'property' ? (
            <Link to={`/customers/${counterparty?.id}`} className="pi-row-name">
              {counterparty?.name || 'מתעניין'}
            </Link>
          ) : (
            <Link to={`/properties/${counterparty?.id}`} className="pi-row-name">
              {[counterparty?.street, counterparty?.city].filter(Boolean).join(', ') || 'נכס'}
            </Link>
          )}
          {heat && (
            <span className={`pi-heat ${HEAT_TONES[heat] || ''}`}>{HEAT_LABELS[heat] || heat}</span>
          )}
        </div>

        <StatusPill
          status={it.status}
          onChange={(next) => onStatusChange(it.id, next)}
        />
      </div>

      <div className="pi-row-meta">
        {mode === 'property' ? (
          <>
            {counterparty?.phone && <span dir="ltr">{counterparty.phone}</span>}
            {counterparty?.lookingFor && <span>· {counterparty.lookingFor === 'BUY' ? 'קנייה' : 'שכירות'}</span>}
            {counterparty?.budget != null && <span>· תקציב {fmtMoney(counterparty.budget)}</span>}
            {counterparty?.city && <span>· {counterparty.city}</span>}
          </>
        ) : (
          <>
            {counterparty?.marketingPrice != null && <span>{fmtMoney(counterparty.marketingPrice)}</span>}
            {counterparty?.rooms != null && <span>· {counterparty.rooms} חד׳</span>}
            {counterparty?.sqm != null && <span>· {counterparty.sqm} מ״ר</span>}
            {counterparty?.category && (
              <span>· {counterparty.category === 'SALE' ? 'מכירה' : 'השכרה'}</span>
            )}
          </>
        )}
      </div>

      <div className="pi-row-stats">
        <span className="pi-stat"><Footprints size={13} /> {stats.tours || 0} סיורים</span>
        <span className="pi-stat">
          <Banknote size={13} /> {stats.offers || 0} {stats.offers === 1 ? 'הצעה' : 'הצעות'}
          {stats.topOfferAmount != null && (
            <span className="pi-stat-em"> · {fmtMoney(stats.topOfferAmount)}</span>
          )}
        </span>
        <span className="pi-stat"><FileText size={13} /> {stats.agreements || 0} הסכמים</span>
        <span className="pi-stat"><CalendarIcon size={13} /> {stats.meetings || 0} פגישות</span>
      </div>

      {(it.lastActionLabel || it.lastActionAt) && (
        <div className="pi-row-last">
          פעילות אחרונה: <strong>{it.lastActionLabel || 'הוקם'}</strong>
          <span className="pi-row-last-time"> · {relDate(it.lastActionAt || it.createdAt)}</span>
        </div>
      )}

      {/* 2026-05-10 — buyer-side commission display. The agent's fee
          from this buyer, with a live `% × base − discount` calculator
          so the row always shows the current expected ₪ amount. Click
          ערוך to edit; the form expands inline. */}
      <CommissionBox
        interest={it}
        isEditing={activeForm === 'commission'}
        onEdit={() => setActiveForm('commission')}
        onCancel={() => setActiveForm(null)}
        onSaved={() => { setActiveForm(null); onActionCreated(); }}
      />

      <div className="pi-row-actions">
        <ActionBtn kind="viewing"   active={activeForm === 'viewing'}   label="סיור"   onToggle={() => setActiveForm(activeForm === 'viewing' ? null : 'viewing')} />
        <ActionBtn kind="offer"     active={activeForm === 'offer'}     label="הצעה"   onToggle={() => setActiveForm(activeForm === 'offer' ? null : 'offer')} />
        <ActionBtn kind="agreement" active={activeForm === 'agreement'} label="הסכם"  onToggle={() => setActiveForm(activeForm === 'agreement' ? null : 'agreement')} />
        <ActionBtn kind="meeting"   active={activeForm === 'meeting'}   label="פגישה" onToggle={() => setActiveForm(activeForm === 'meeting' ? null : 'meeting')} />
        <button
          type="button"
          className="pi-action-btn pi-action-detach"
          onClick={() => onDetach(it.id)}
          title="הסר שיוך"
          aria-label="הסר שיוך"
        ><Trash2 size={13} /></button>
      </div>

      {activeForm === 'viewing'   && <ViewingForm   interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
      {activeForm === 'offer'     && <OfferForm     interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
      {activeForm === 'agreement' && <AgreementForm interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
      {activeForm === 'meeting'   && <MeetingForm   interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}

      <button
        type="button"
        className="pi-toggle"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <><ChevronUp size={14} /> צמצם היסטוריה</>
        ) : (
          <><ChevronDown size={14} /> הצג היסטוריה מלאה</>
        )}
      </button>

      {isExpanded && <InterestTimeline interestId={it.id} />}
    </li>
  );
}

function StatusPill({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cur = STATUS_LABELS[status] || status;
  const tone = STATUS_TONES[status] || '';

  return (
    <div className="pi-status-wrap">
      <button
        type="button"
        className={`pi-status ${tone}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {cur} <ChevronDown size={12} />
      </button>
      {open && (
        <ul className="pi-status-menu" role="listbox" onMouseLeave={() => setOpen(false)}>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <li key={k}>
              <button
                type="button"
                role="option"
                aria-selected={k === status}
                onClick={() => { setOpen(false); if (k !== status) onChange(k); }}
                className={k === status ? 'is-active' : ''}
              >{label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InterestTimeline({ interestId }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getInterestTimeline(interestId)
      .then((r) => { if (!cancelled) setEvents(r?.items || []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [interestId]);

  if (events === null) {
    return <div className="pi-timeline-empty">טוען היסטוריה…</div>;
  }
  if (events.length === 0) {
    return <div className="pi-timeline-empty">אין פעילות עדיין. השתמש בכפתורים שלמעלה כדי להוסיף סיור, הצעה או פגישה.</div>;
  }

  return (
    <ul className="pi-timeline" role="list">
      {events.map((e) => (
        <li key={`${e.kind}-${e.id}`} className={`pi-event pi-event-${e.kind}`}>
          <span className="pi-event-icon">
            {e.kind === 'viewing' && <Footprints size={14} />}
            {e.kind === 'offer' && <Banknote size={14} />}
            {e.kind === 'agreement' && <FileText size={14} />}
            {e.kind === 'contract' && <FileText size={14} />}
            {e.kind === 'meeting' && <CalendarIcon size={14} />}
          </span>
          <div className="pi-event-body">
            <div className="pi-event-title">{eventTitle(e)}</div>
            {eventSubtitle(e) && <div className="pi-event-sub">{eventSubtitle(e)}</div>}
          </div>
          <span className="pi-event-time">{relDate(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function eventTitle(e) {
  const p = e.payload || {};
  if (e.kind === 'viewing')   return 'סיור בנכס';
  if (e.kind === 'offer')     return `הצעה ${fmtMoney(p.amount)}`;
  if (e.kind === 'agreement') return `הסכם ${p.status === 'SIGNED' ? '· נחתם' : '· נשלח'}`;
  if (e.kind === 'contract')  return p.title || 'חוזה';
  if (e.kind === 'meeting')   return p.title || 'פגישה';
  return '';
}
function eventSubtitle(e) {
  const p = e.payload || {};
  if (e.kind === 'viewing')   return p.notes || (p.source ? `מקור: ${p.source}` : null);
  if (e.kind === 'offer')     return p.notes || null;
  if (e.kind === 'agreement') return p.note || null;
  if (e.kind === 'contract')  return p.signerName || null;
  if (e.kind === 'meeting')   return p.notes || p.location || null;
  return null;
}

// ── Action button (toggles its inline form) ─────────────────
function ActionBtn({ kind, active, label, onToggle }) {
  const ICONS = {
    viewing: Footprints, offer: Banknote, agreement: FileText, meeting: CalendarIcon,
  };
  const Icon = ICONS[kind] || MessageSquare;
  return (
    <button
      type="button"
      className={`pi-action-btn pi-action-${kind} ${active ? 'is-active' : ''}`}
      onClick={onToggle}
      title={`הוסף ${label}`}
    >
      <Icon size={13} /> {active ? <><X size={11} /> סגור</> : <>+ {label}</>}
    </button>
  );
}

// ── Inline forms (one per kind) ─────────────────────────────
function FormShell({ title, onCancel, onSubmit, busy, children }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      dir="rtl"
      className="pi-form"
    >
      <div className="pi-form-title">{title}</div>
      <div className="pi-form-body">{children}</div>
      <div className="pi-form-actions">
        <button type="submit" disabled={busy} className="pi-add-btn">
          <Save size={13} /> שמור
        </button>
        <button type="button" onClick={onCancel} className="pi-form-cancel">בטל</button>
      </div>
    </form>
  );
}

function ViewingForm({ interestId, onCancel, onSaved }) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [viewedAt, setViewedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.createInterestAction(interestId, {
        kind: 'viewing',
        viewedAt: new Date(viewedAt).toISOString(),
        notes: notes.trim() || null,
      });
      toast?.success?.('סיור נרשם');
      onSaved();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירה נכשלה');
    } finally { setBusy(false); }
  };
  return (
    <FormShell title="רישום סיור" busy={busy} onCancel={onCancel} onSubmit={submit}>
      <label className="pi-field">
        <span>מועד</span>
        <input type="datetime-local" value={viewedAt} onChange={(e) => setViewedAt(e.target.value)} />
      </label>
      <label className="pi-field pi-field-full">
        <span>הערות מהסיור</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="מה אהבו, מה לא, רצון לסיור נוסף..." />
      </label>
    </FormShell>
  );
}

function OfferForm({ interestId, onCancel, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [relayedAmount, setRelayedAmount] = useState('');
  const [direction, setDirection] = useState('BUYER_TO_SELLER');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Live "spread" display so the agent sees how much room they're
  // keeping for negotiation as they type the relayed amount.
  const spread = Number(amount) && Number(relayedAmount)
    ? Number(amount) - Number(relayedAmount)
    : 0;

  const submit = async () => {
    if (!amount) return;
    setBusy(true);
    try {
      await api.createInterestAction(interestId, {
        kind: 'offer',
        amount: Number(amount),
        relayedAmount: relayedAmount ? Number(relayedAmount) : null,
        direction,
        paymentTerms: paymentTerms.trim() || null,
        handoverNotes: handoverNotes.trim() || null,
        notes: notes.trim() || null,
      });
      toast?.success?.('הצעה נרשמה');
      onSaved();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירה נכשלה');
    } finally { setBusy(false); }
  };

  return (
    <FormShell title="רישום הצעה" busy={busy} onCancel={onCancel} onSubmit={submit}>
      <label className="pi-field">
        <span>כיוון</span>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="BUYER_TO_SELLER">▶ הצעת קונה לבעלים</option>
          <option value="SELLER_TO_BUYER">◀ הצעה נגדית מבעלים</option>
        </select>
      </label>
      <label className="pi-field">
        <span>סכום ההצעה האמיתי (₪)</span>
        <input
          type="number" inputMode="numeric" required
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="2100000"
        />
      </label>
      <label className="pi-field">
        <span>סכום שהועבר לצד השני (₪)</span>
        <input
          type="number" inputMode="numeric"
          value={relayedAmount} onChange={(e) => setRelayedAmount(e.target.value)}
          placeholder="(אופציונלי — אם זהה לסכום ההצעה)"
        />
      </label>
      {spread !== 0 && (
        <div className="pi-spread-hint">
          {spread > 0
            ? <>פער של <strong>{fmtMoney(spread)}</strong> נשמר למשא ומתן</>
            : <>הצעה גבוהה מהסכום האמיתי — בדוק/י את הסכומים</>}
        </div>
      )}
      <label className="pi-field pi-field-full">
        <span>תנאי תשלום / פריסה</span>
        <input
          type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
          placeholder='לדוגמה: "60% בחתימה, 35% תוך 30 יום, 5% במסירה"'
        />
      </label>
      <label className="pi-field pi-field-full">
        <span>מועד מסירה</span>
        <input
          type="text" value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)}
          placeholder='לדוגמה: "מסירה 1.9.2026", או "תוך 60 יום מהחתימה"'
        />
      </label>
      <label className="pi-field pi-field-full">
        <span>הערות נוספות</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </FormShell>
  );
}

function AgreementForm({ interestId, onCancel, onSaved }) {
  const toast = useToast();
  const [signerName, setSignerName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('SENT');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.createInterestAction(interestId, {
        kind: 'agreement',
        signerName: signerName.trim() || undefined,
        note: note.trim() || null,
        status,
      });
      toast?.success?.('הסכם נרשם');
      onSaved();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירה נכשלה');
    } finally { setBusy(false); }
  };
  return (
    <FormShell title="רישום הסכם" busy={busy} onCancel={onCancel} onSubmit={submit}>
      <label className="pi-field">
        <span>חותם (אופציונלי)</span>
        <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="שם החותם — ברירת מחדל: שם הלקוח" />
      </label>
      <label className="pi-field">
        <span>סטטוס</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="SENT">נשלח</option>
          <option value="SIGNED">נחתם</option>
          <option value="CANCELLED">בוטל</option>
        </select>
      </label>
      <label className="pi-field pi-field-full">
        <span>הערות</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="סוג ההסכם, תנאים, וכו'" />
      </label>
    </FormShell>
  );
}

function MeetingForm({ interestId, onCancel, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState('פגישה');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.createInterestAction(interestId, {
        kind: 'meeting',
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        location: location.trim() || null,
        notes: notes.trim() || null,
      });
      toast?.success?.('פגישה נקבעה');
      onSaved();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירה נכשלה');
    } finally { setBusy(false); }
  };
  return (
    <FormShell title="קביעת פגישה" busy={busy} onCancel={onCancel} onSubmit={submit}>
      <label className="pi-field">
        <span>נושא</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="pi-field">
        <span>מיקום</span>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="אופציונלי" />
      </label>
      <label className="pi-field">
        <span>התחלה</span>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </label>
      <label className="pi-field">
        <span>סיום</span>
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      </label>
      <label className="pi-field pi-field-full">
        <span>הערות</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </FormShell>
  );
}

// ── Commission box — buyer-side commission display + editor ─
function calcCommission(it) {
  if (it.buyerCommissionFlat) return it.buyerCommissionFlat;
  if (it.buyerCommissionPct && it.buyerCommissionBase) {
    return Math.round(
      (it.buyerCommissionPct / 100) * it.buyerCommissionBase
      - (it.buyerCommissionDiscount || 0),
    );
  }
  return null;
}
function CommissionBox({ interest: it, isEditing, onEdit, onCancel, onSaved }) {
  const total = calcCommission(it);
  const hasAny = it.buyerCommissionPct != null
    || it.buyerCommissionBase != null
    || it.buyerCommissionFlat != null;

  if (!isEditing) {
    return (
      <div className="pi-commission-summary">
        {hasAny ? (
          <>
            <Banknote size={13} />
            <span>עמלת המתעניין:</span>
            {it.buyerCommissionFlat ? (
              <strong>{fmtMoney(it.buyerCommissionFlat)}</strong>
            ) : (
              <>
                <strong>{it.buyerCommissionPct}% × {fmtMoney(it.buyerCommissionBase)}</strong>
                {it.buyerCommissionDiscount ? <> − {fmtMoney(it.buyerCommissionDiscount)}</> : null}
                {total != null && <> = <strong>{fmtMoney(total)}</strong></>}
              </>
            )}
            <button type="button" className="pi-commission-edit" onClick={onEdit}>
              <Pencil size={11} /> ערוך
            </button>
          </>
        ) : (
          <button type="button" className="pi-commission-add" onClick={onEdit}>
            <Plus size={12} /> הגדר עמלה למתעניין
          </button>
        )}
      </div>
    );
  }
  return <CommissionEditor interest={it} onCancel={onCancel} onSaved={onSaved} />;
}
function CommissionEditor({ interest: it, onCancel, onSaved }) {
  const toast = useToast();
  const [pct, setPct] = useState(it.buyerCommissionPct ?? '');
  const [base, setBase] = useState(it.buyerCommissionBase ?? '');
  const [flat, setFlat] = useState(it.buyerCommissionFlat ?? '');
  const [discount, setDiscount] = useState(it.buyerCommissionDiscount ?? '');
  const [notes, setNotes] = useState(it.buyerCommissionNotes ?? '');
  const [busy, setBusy] = useState(false);

  // Live preview while typing.
  const preview = (() => {
    if (flat) return Number(flat);
    if (pct && base) return Math.round((Number(pct) / 100) * Number(base) - Number(discount || 0));
    return null;
  })();

  const submit = async () => {
    setBusy(true);
    try {
      await api.updateInterest(it.id, {
        buyerCommissionPct: pct === '' ? null : Number(pct),
        buyerCommissionBase: base === '' ? null : Number(base),
        buyerCommissionFlat: flat === '' ? null : Number(flat),
        buyerCommissionDiscount: discount === '' ? null : Number(discount),
        buyerCommissionNotes: notes.trim() || null,
      });
      toast?.success?.('עמלה עודכנה');
      onSaved();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירה נכשלה');
    } finally { setBusy(false); }
  };

  return (
    <FormShell title="עמלת המתעניין" busy={busy} onCancel={onCancel} onSubmit={submit}>
      <label className="pi-field">
        <span>אחוז</span>
        <input type="number" step="0.1" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="2" />
      </label>
      <label className="pi-field">
        <span>על בסיס (₪)</span>
        <input type="number" min="0" value={base} onChange={(e) => setBase(e.target.value)} placeholder="2100000" />
      </label>
      <label className="pi-field">
        <span>או סכום קבוע (₪)</span>
        <input type="number" min="0" value={flat} onChange={(e) => setFlat(e.target.value)} placeholder="מחליף את ה-%×בסיס" />
      </label>
      <label className="pi-field">
        <span>הנחה (₪)</span>
        <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="אופציונלי" />
      </label>
      <label className="pi-field pi-field-full">
        <span>הערות</span>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="תנאים מיוחדים, הנחה במידת הצורך, וכו׳" />
      </label>
      {preview != null && (
        <div className="pi-commission-preview">סכום צפוי: <strong>{fmtMoney(preview)}</strong></div>
      )}
    </FormShell>
  );
}
