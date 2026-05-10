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
            ? 'אין מתעניינים משויכים. שייך/י לקוחות כדי להתחיל לעקוב אחרי הסיורים, ההצעות וההסכמים.'
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
          previewText="בחר/י את המתעניינים שברצונך לשייך לנכס"
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

      <div className="pi-row-actions">
        {/* Placeholder "+ action" buttons — they wire to existing
            creation dialogs in Phase 1 by emitting a custom event
            that PropertyDetail / CustomerDetail catches. Phase 2
            will inline lightweight forms here. */}
        <ActionTrigger interestId={it.id} kind="viewing"   label="סיור"   onDone={onActionCreated} />
        <ActionTrigger interestId={it.id} kind="offer"     label="הצעה"   onDone={onActionCreated} />
        <ActionTrigger interestId={it.id} kind="agreement" label="הסכם"  onDone={onActionCreated} />
        <ActionTrigger interestId={it.id} kind="meeting"   label="פגישה" onDone={onActionCreated} />
        <button
          type="button"
          className="pi-action-btn pi-action-detach"
          onClick={() => onDetach(it.id)}
          title="הסר שיוך"
          aria-label="הסר שיוך"
        ><Trash2 size={13} /></button>
      </div>

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

// Tiny dispatcher — emits a window event so the host page (PropertyDetail
// / CustomerDetail) can open its existing creation dialog wired with
// interestId. Phase 1 keeps this lightweight; Phase 2 will inline forms.
function ActionTrigger({ interestId, kind, label, onDone }) {
  const ICONS = {
    viewing: Footprints,
    offer: Banknote,
    agreement: FileText,
    meeting: CalendarIcon,
  };
  const Icon = ICONS[kind] || MessageSquare;
  return (
    <button
      type="button"
      className={`pi-action-btn pi-action-${kind}`}
      onClick={() => {
        const ev = new CustomEvent('estia-interest-action', {
          detail: { interestId, kind, onDone },
        });
        window.dispatchEvent(ev);
      }}
      title={`הוסף ${label}`}
    >
      <Icon size={13} /> + {label}
    </button>
  );
}
