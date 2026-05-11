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
import { createPortal } from 'react-dom';
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
  // 2026-05-10 — fires after any local mutation (action create, status,
  // attach, detach) so the parent page can re-pull its KPI hero counts.
  onAfterChange,
  // 2026-05-11 — bumped by the parent page when something elsewhere
  // (e.g. offer accept/decline in OwnerOffersCard) mutated state we own.
  // Re-trigger our own load() so stats + history catch up.
  refreshNonce = 0,
}) {
  const toast = useToast();
  const mode = propertyId ? 'property' : 'lead';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allLeads, setAllLeads] = useState([]);
  // 2026-05-11 — multiple rows can be open at once. Set-of-ids; tap a
  // row to toggle its membership.
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpand = (rowId) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    return next;
  });

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

  useEffect(() => { load(); }, [load, refreshNonce]);

  // Lazy-load the leads list for the picker on first open.
  useEffect(() => {
    if (!pickerOpen || allLeads.length > 0 || mode !== 'property') return;
    api.listLeads().then((r) => setAllLeads(r?.items || [])).catch(() => {});
  }, [pickerOpen, allLeads.length, mode]);

  // After any mutation, refresh local list AND notify the parent page so
  // the KPI hero stays in sync.
  const reloadAll = () => {
    load();
    onAfterChange?.();
  };

  const onAttach = async (selectedLeadIds) => {
    setPickerOpen(false);
    if (!selectedLeadIds?.length) return;
    try {
      await api.createPropertyInterests(propertyId, selectedLeadIds);
      toast?.success?.(`${selectedLeadIds.length} מתעניינים שויכו לנכס`);
      reloadAll();
    } catch (e) {
      toast?.error?.(e?.message || 'שיוך נכשל');
    }
  };

  const onStatusChange = async (interestId, nextStatus) => {
    try {
      await api.updateInterest(interestId, { status: nextStatus });
      reloadAll();
    } catch (e) {
      toast?.error?.(e?.message || 'עדכון סטטוס נכשל');
    }
  };

  const onDetach = async (interestId) => {
    if (!confirm('להסיר את השיוך?')) return;
    try {
      await api.deleteInterest(interestId);
      toast?.success?.('השיוך הוסר');
      reloadAll();
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
              isExpanded={expandedIds.has(it.id)}
              onToggleExpand={() => toggleExpand(it.id)}
              onStatusChange={onStatusChange}
              onDetach={onDetach}
              onActionCreated={reloadAll}
            />
          ))}
        </ul>
      )}

      {pickerOpen && (
        <LeadPickerSheet
          property={null}
          mode="attach"
          attachTitle="שייך מתעניין לנכס"
          leads={allLeads}
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
  // Currently-open form (renders inside FormPopup):
  // 'viewing' | 'offer' | 'agreement' | 'meeting' | null.
  const [activeForm, setActiveForm] = useState(null);

  return (
    <li className={`pi-row pi-row-status-${it.status?.toLowerCase()} ${isExpanded ? 'pi-row-expanded' : 'pi-row-collapsed'}`}>
      {/* Compact summary — name + heat + offer/tour chips + status pill +
          chevron. Whole row is clickable; StatusPill stops propagation
          so its dropdown doesn't toggle the expand. Plain <div> + onClick
          (not <button>) because StatusPill renders its own button inside. */}
      <div
        className="pi-row-summary"
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className="pi-row-head">
          <div className="pi-row-identity">
            <span className="pi-row-name">
              {mode === 'property'
                ? counterparty?.name || 'מתעניין'
                : [counterparty?.street, counterparty?.city].filter(Boolean).join(', ') || 'נכס'}
            </span>
            {heat && (
              <span className={`pi-heat ${HEAT_TONES[heat] || ''}`}>{HEAT_LABELS[heat] || heat}</span>
            )}
          </div>
          <span className="pi-row-summary-right">
            {stats.offers > 0 && (
              <span className="pi-stat-compact pi-stat-compact-hot">
                <Banknote size={12} /> {stats.topOfferAmount != null ? fmtMoney(stats.topOfferAmount) : `${stats.offers}`}
              </span>
            )}
            {stats.tours > 0 && (
              <span className="pi-stat-compact"><Footprints size={12} /> {stats.tours}</span>
            )}
            <span onClick={(e) => e.stopPropagation()}>
              <StatusPill
                status={it.status}
                onChange={(next) => onStatusChange(it.id, next)}
              />
            </span>
            {isExpanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </span>
        </div>
        {(it.lastActionLabel || it.lastActionAt) && (
          <div className="pi-row-last">
            {it.lastActionLabel || 'הוקם'}
            <span className="pi-row-last-time"> · {relDate(it.lastActionAt || it.createdAt)}</span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="pi-row-expand">
          <div className="pi-row-meta">
            {mode === 'property' ? (
              <>
                {counterparty?.phone && (
                  <Link to={`/customers/${counterparty?.id}`} dir="ltr">{counterparty.phone}</Link>
                )}
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

          {/* Action chips — one row of "+ סיור / + הצעה / + הסכם /
              + פגישה" with no count. */}
          <div className="pi-row-actions">
            <ActionBtn
              kind="viewing"
              active={activeForm === 'viewing'}
              label="סיור"
              onToggle={() => setActiveForm(activeForm === 'viewing' ? null : 'viewing')}
            />
            <ActionBtn
              kind="offer"
              active={activeForm === 'offer'}
              label="הצעה"
              onToggle={() => setActiveForm(activeForm === 'offer' ? null : 'offer')}
            />
            <ActionBtn
              kind="agreement"
              active={activeForm === 'agreement'}
              label="הסכם"
              onToggle={() => setActiveForm(activeForm === 'agreement' ? null : 'agreement')}
            />
            <ActionBtn
              kind="meeting"
              active={activeForm === 'meeting'}
              label="פגישה"
              onToggle={() => setActiveForm(activeForm === 'meeting' ? null : 'meeting')}
            />
            <button
              type="button"
              className="pi-action-btn pi-action-detach"
              onClick={() => onDetach(it.id)}
              title="הסר שיוך"
              aria-label="הסר שיוך"
            ><Trash2 size={13} /></button>
          </div>

          {/* Stats summary — UNDER the + buttons (was: inside button
              labels). One scannable row of `<count> <noun>` chips. */}
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
        </div>
      )}

      {/* Action forms render inside a centered popup so the row stays
          compact (was: forms expanded inline). The popup-shell handles
          the overlay/escape; the underlying *Form components keep their
          inline body styling. */}
      {(activeForm === 'viewing' || activeForm === 'offer' ||
        activeForm === 'agreement' || activeForm === 'meeting') && (
        <FormPopup
          title={
            activeForm === 'viewing' ? 'תיעוד סיור חדש' :
            activeForm === 'offer' ? 'הצעת מחיר חדשה' :
            activeForm === 'agreement' ? 'הסכם חדש' :
            'פגישה חדשה'
          }
          onClose={() => setActiveForm(null)}
        >
          {activeForm === 'viewing'   && <ViewingForm   interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
          {activeForm === 'offer'     && <OfferForm     interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
          {activeForm === 'agreement' && <AgreementForm interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
          {activeForm === 'meeting'   && <MeetingForm   interestId={it.id} onCancel={() => setActiveForm(null)} onSaved={() => { setActiveForm(null); onActionCreated(); }} />}
        </FormPopup>
      )}

      {isExpanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <InterestTimeline interestId={it.id} propertyId={it.propertyId} />
        </div>
      )}
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

// ── Offer threading helpers ────────────────────────────────────
// Same logic as PropertyDetail's OwnerOffersCard — duplicated here so
// the מתעניינים tab shows the buyer↔seller dialog with action buttons
// on the latest round (was: flat list, no way to respond to a seller's
// counter-offer from the מתעניין side).
const OFFER_STATUS_LABEL = {
  NEW:         'ממתינה לתגובה',
  NEGOTIATING: 'במו״מ',
  ACCEPTED:    'התקבלה',
  DECLINED:    'נדחתה',
  WITHDRAWN:   'בוטלה',
};
function offerToneStyles(s) {
  if (s === 'ACCEPTED') return { background: 'rgba(21,128,61,0.12)', color: '#15803d' };
  if (s === 'DECLINED' || s === 'WITHDRAWN') return { background: 'rgba(185,28,28,0.10)', color: '#b91c1c' };
  if (s === 'NEW') return { background: 'rgba(180,139,76,0.18)', color: '#7a5c2c' };
  if (s === 'NEGOTIATING') return { background: 'rgba(180,139,76,0.10)', color: '#6b6356' };
  return { background: 'rgba(30,26,20,0.06)', color: '#6b6356' };
}
function buildOfferThreads(offers) {
  const byId = new Map(offers.map((o) => [o.id, o]));
  const rootOf = (id) => {
    let cur = byId.get(id);
    const seen = new Set();
    while (cur?.replyToOfferId && byId.has(cur.replyToOfferId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.replyToOfferId);
    }
    return cur?.id || id;
  };
  const threads = new Map();
  for (const o of offers) {
    const r = rootOf(o.id);
    if (!threads.has(r)) threads.set(r, []);
    threads.get(r).push(o);
  }
  const out = [];
  for (const [rootId, rounds] of threads) {
    rounds.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
    out.push({ rootId, rounds });
  }
  out.sort((a, b) => {
    const al = a.rounds[a.rounds.length - 1].receivedAt;
    const bl = b.rounds[b.rounds.length - 1].receivedAt;
    return new Date(bl) - new Date(al);
  });
  return out;
}
function threadStatusOf(rounds) {
  if (rounds.some((r) => r.status === 'ACCEPTED')) return 'ACCEPTED';
  if (rounds.every((r) => r.status === 'DECLINED' || r.status === 'WITHDRAWN')) {
    return rounds[rounds.length - 1].status;
  }
  return rounds[rounds.length - 1].status;
}

function OfferThreadList({ offers, propertyId, onChange }) {
  const toast = useToast();
  const [respondingTo, setRespondingTo] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const threads = buildOfferThreads(offers);

  const respond = async (offerId, action, counter) => {
    setBusyId(offerId);
    try {
      await api.respondToPropertyOffer(propertyId, offerId, { action, counter });
      toast?.success?.(
        action === 'ACCEPT' ? 'ההצעה התקבלה' :
        action === 'DECLINE' ? 'ההצעה נדחתה' :
        action === 'WITHDRAW' ? 'ההצעה בוטלה' : 'הצעה נגדית נשלחה'
      );
      onChange?.();
    } catch (e) {
      toast?.error?.(e?.message || 'הפעולה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {threads.map(({ rootId, rounds }) => {
          const last = rounds[rounds.length - 1];
          const tStatus = threadStatusOf(rounds);
          const terminal = tStatus === 'ACCEPTED' || tStatus === 'DECLINED' || tStatus === 'WITHDRAWN';
          const pendingSide = last.status !== 'NEW' ? null
            : last.direction === 'BUYER_TO_SELLER' ? 'SELLER' : 'BUYER';
          return (
            <li
              key={rootId}
              style={{
                background: '#fff',
                border: `1px solid ${tStatus === 'NEW' ? 'rgba(180,139,76,0.4)' : 'rgba(30,26,20,0.10)'}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <header style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '8px 12px',
                background: 'linear-gradient(180deg, rgba(180,139,76,0.06), transparent)',
                borderBottom: '1px solid rgba(30,26,20,0.06)',
              }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>
                  {rounds.length} {rounds.length === 1 ? 'סבב' : 'סבבים'}
                </span>
                <span style={{
                  marginInlineStart: 'auto',
                  padding: '3px 8px', borderRadius: 999,
                  fontSize: 11, fontWeight: 800,
                  ...offerToneStyles(tStatus),
                }}>
                  {OFFER_STATUS_LABEL[tStatus] || tStatus}
                </span>
                {pendingSide && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#7a5c2c',
                    background: 'rgba(180,139,76,0.10)',
                    padding: '3px 8px', borderRadius: 999,
                  }}>
                    {pendingSide === 'SELLER' ? 'ממתינה לבעל הנכס' : 'ממתינה למתעניין'}
                  </span>
                )}
              </header>
              <ol style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rounds.map((r, ix) => {
                  const isBuyer = r.direction === 'BUYER_TO_SELLER';
                  const isLast = ix === rounds.length - 1;
                  return (
                    <li key={r.id} style={{
                      background: isBuyer ? 'rgba(29,78,216,0.04)' : 'rgba(180,139,76,0.05)',
                      border: `1px solid ${isLast && r.status === 'NEW' ? 'rgba(180,139,76,0.32)' : 'rgba(30,26,20,0.06)'}`,
                      borderRadius: 8, padding: 8,
                      marginInlineStart: isBuyer ? 0 : 18,
                      marginInlineEnd:   isBuyer ? 18 : 0,
                      position: 'relative',
                    }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: isBuyer ? '#1d4ed8' : '#7a5c2c', marginBottom: 2 }}>
                        {ix === 0
                          ? (isBuyer ? 'הצעה ראשונית מהמתעניין' : 'הצעת בעל הנכס')
                          : (isBuyer ? 'תגובת המתעניין' : 'תגובת בעל הנכס')}
                        <span style={{ marginInlineStart: 6, color: '#9c9384', fontWeight: 600 }}>
                          · {relDate(r.receivedAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#1e1a14' }}>
                        {fmtMoney(r.amount)}
                        {r.relayedAmount != null && r.relayedAmount !== r.amount && (
                          <span style={{ marginInlineStart: 8, fontSize: 11, color: '#7a5c2c', fontWeight: 600 }}>
                            (הועבר: {fmtMoney(r.relayedAmount)})
                          </span>
                        )}
                      </div>
                      {r.notes && (
                        <div style={{ fontSize: 11.5, color: '#3a3329', marginTop: 3, lineHeight: 1.5 }}>{r.notes}</div>
                      )}
                      {r.status !== 'NEW' && (
                        <span style={{
                          position: 'absolute', insetInlineEnd: 6, top: 6,
                          fontSize: 10, fontWeight: 800,
                          padding: '2px 6px', borderRadius: 999,
                          ...offerToneStyles(r.status),
                        }}>
                          {OFFER_STATUS_LABEL[r.status]}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {!terminal && last.status === 'NEW' && (
                <div style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  padding: '8px 12px',
                  borderTop: '1px solid rgba(30,26,20,0.06)',
                  background: 'rgba(180,139,76,0.04)',
                }}>
                  <button
                    type="button"
                    onClick={() => respond(last.id, 'ACCEPT')}
                    disabled={busyId === last.id}
                    style={{
                      ..._actionBtn,
                      borderColor: 'rgba(21,128,61,0.3)', color: '#15803d',
                    }}
                  >קבל הצעה</button>
                  <button
                    type="button"
                    onClick={() => respond(last.id, 'DECLINE')}
                    disabled={busyId === last.id}
                    style={{
                      ..._actionBtn,
                      borderColor: 'rgba(185,28,28,0.25)', color: '#b91c1c',
                    }}
                  >דחה הצעה</button>
                  <button
                    type="button"
                    onClick={() => setRespondingTo(last)}
                    disabled={busyId === last.id}
                    style={{
                      ..._actionBtn,
                      background: 'linear-gradient(180deg,#d9b774,#b48b4c)',
                      color: '#1e1a14', borderColor: 'transparent', fontWeight: 800,
                    }}
                  >ענה הצעה נגדית</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {respondingTo && (
        <CounterPopup
          parent={respondingTo}
          onClose={() => setRespondingTo(null)}
          onSubmit={async (counter) => {
            await respond(respondingTo.id, 'COUNTER', counter);
            setRespondingTo(null);
          }}
        />
      )}
    </>
  );
}

const _actionBtn = {
  fontFamily: 'inherit', padding: '6px 12px', borderRadius: 8,
  border: '1px solid rgba(30,26,20,0.12)', background: '#fff',
  cursor: 'pointer', fontSize: 12, fontWeight: 700,
};

function CounterPopup({ parent, onClose, onSubmit }) {
  const isCounteringBuyer = parent.direction === 'BUYER_TO_SELLER';
  const [amount, setAmount] = useState('');
  const [relayedAmount, setRelayedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    try {
      await onSubmit({
        amount: amt,
        relayedAmount: relayedAmount ? Number(relayedAmount) : null,
        notes: notes.trim() || null,
      });
    } finally { setBusy(false); }
  };
  return (
    <FormPopup
      title={isCounteringBuyer
        ? 'הצעה נגדית מבעל הנכס למתעניין'
        : 'הצעה נגדית מהמתעניין לבעל הנכס'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="pi-form" style={{ background: 'transparent', border: 'none', padding: 0 }}>
        <div style={{
          background: 'rgba(30,26,20,0.04)', borderRadius: 8,
          padding: '8px 12px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: '#6b6356', fontWeight: 700, marginBottom: 2 }}>
            משיב להצעה
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e1a14' }}>
            {fmtMoney(parent.amount)} · {parent.buyerName}
          </div>
        </div>
        <div className="pi-form-body">
          <label className="pi-field">
            <span>סכום ההצעה הנגדית (₪)</span>
            <input
              type="number" inputMode="numeric" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <label className="pi-field">
            <span>סכום שיעבור לצד השני (₪)</span>
            <input
              type="number" inputMode="numeric"
              value={relayedAmount}
              onChange={(e) => setRelayedAmount(e.target.value)}
              placeholder="(אופציונלי)"
            />
          </label>
          <label className="pi-field pi-field-full">
            <span>הערות</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הקשר, מה שנאמר בשיחה, וכו׳"
            />
          </label>
        </div>
        <div className="pi-form-actions" style={{ marginTop: 10 }}>
          <button type="submit" disabled={busy} className="pi-add-btn">
            <Save size={13} /> שלח הצעה נגדית
          </button>
          <button type="button" onClick={onClose} className="pi-form-cancel" disabled={busy}>
            ביטול
          </button>
        </div>
      </form>
    </FormPopup>
  );
}

function InterestTimeline({ interestId, propertyId }) {
  const toast = useToast();
  const [events, setEvents] = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    api.getInterestTimeline(interestId)
      .then((r) => { if (!cancelled) setEvents(r?.items || []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [interestId]);

  useEffect(() => load(), [load]);

  if (events === null) {
    return <div className="pi-timeline-empty">טוען היסטוריה…</div>;
  }
  if (events.length === 0) {
    return <div className="pi-timeline-empty">אין פעילות עדיין. השתמש בכפתורים שלמעלה כדי להוסיף סיור, הצעה או פגישה.</div>;
  }

  // Group by kind so each section has its own headline. Within the
  // 'offer' section we render thread cards (with accept/decline/
  // counter actions on the latest round) instead of a flat list.
  const byKind = events.reduce((acc, e) => {
    (acc[e.kind] = acc[e.kind] || []).push(e);
    return acc;
  }, {});
  const SECTION_ORDER = ['offer', 'viewing', 'agreement', 'contract', 'meeting'];
  const SECTION_LABEL = {
    offer:     'הצעות',
    viewing:   'סיורים',
    agreement: 'הסכמים',
    contract:  'חוזים',
    meeting:   'פגישות',
  };

  return (
    <div className="pi-timeline-stack">
      {SECTION_ORDER.filter((k) => byKind[k]?.length).map((k) => (
        <section key={k} className={`pi-timeline-section pi-timeline-section-${k}`}>
          <h4 className="pi-timeline-headline">
            {SECTION_LABEL[k]} <span className="pi-timeline-headline-count">· {byKind[k].length}</span>
          </h4>
          {k === 'offer' ? (
            <OfferThreadList
              offers={byKind[k].map((e) => e.payload).filter(Boolean)}
              propertyId={propertyId}
              onChange={load}
            />
          ) : (
            <ul className="pi-timeline" role="list">
              {byKind[k].map((e) => (
                <li key={`${e.kind}-${e.id}`} className={`pi-event pi-event-${e.kind}`}>
                  <span className="pi-event-icon">
                    {e.kind === 'viewing' && <Footprints size={14} />}
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
          )}
        </section>
      ))}
    </div>
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
// 2026-05-10 — Modal wrapper used by interest-row action forms.
// Esc + backdrop-click close. Locks page scroll while open. Portaled
// to document.body so the dim backdrop covers the topbar / sidebar /
// any other stacking context the row lives inside (li > section >
// .prd-tab-body, etc.).
function FormPopup({ title, onClose, children }) {
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
