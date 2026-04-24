// Deals kanban / cards — port of the claude.ai/design bundle with
// the Cream & Gold DT palette and inline styles. The kanban is the
// primary view (matches the bundle's DDeals screen), with a cards
// fallback for the "signed" and "all" tabs.
//
// No fixtures — every row comes from GET /api/deals. The create and
// edit modals stay wired to /api/deals POST + PATCH.

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, Clock, AlertCircle, Edit3, X, Plus,
} from 'lucide-react';
import api from '../lib/api';
import { absoluteTime } from '../lib/time';
import { relativeDate } from '../lib/relativeDate';
import { DateQuickChips } from '../components/MobilePickers';
import { runMutation } from '../lib/mutations';
import { useToast } from '../lib/toast';
// Modals still lean on the agreement-style backdrop/class set. Keep
// the import so the create / edit dialogs render as centered modals
// instead of inline divs.
import '../components/AgreementDialog.css';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', warning: '#b45309', danger: '#b91c1c',
  info: '#2563eb',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const STATUS_OPTIONS = [
  { key: 'NEGOTIATING',     label: 'משא ומתן' },
  { key: 'WAITING_MORTGAGE',label: 'אישור משכנתא' },
  { key: 'PENDING_CONTRACT',label: 'לקראת חתימה' },
  { key: 'SIGNED',          label: 'נחתם' },
  { key: 'FELL_THROUGH',    label: 'לא יצא לפועל' },
  { key: 'CLOSED',          label: 'נסגרה' },
  { key: 'CANCELLED',       label: 'בוטלה' },
];
const statusLabelMap = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.key, o.label]));

function formatPrice(price) {
  if (price == null) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}
function assetLabel(ac) { return ac === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'; }
function categoryLabel(c) { return c === 'SALE' ? 'מכירה' : 'השכרה'; }

function statusAccent(status) {
  if (status === 'SIGNED' || status === 'CLOSED') {
    return { bg: 'rgba(21,128,61,0.12)', fg: DT.success, icon: <CheckCircle size={12} /> };
  }
  if (status === 'WAITING_MORTGAGE' || status === 'PENDING_CONTRACT') {
    return { bg: 'rgba(180,83,9,0.12)', fg: DT.warning, icon: <Clock size={12} /> };
  }
  if (status === 'FELL_THROUGH' || status === 'CANCELLED') {
    return { bg: 'rgba(185,28,28,0.12)', fg: DT.danger, icon: <AlertCircle size={12} /> };
  }
  return { bg: DT.goldSoft, fg: DT.goldDark, icon: null };
}

export default function Deals() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  // Sprint 6 — row / card click drills into the standalone /deals/:id
  // page. The inline DealEditModal is still summoned from the kanban
  // column "עריכה" button and the "סמן כנחתם" shortcut for quick-edits.
  const openDetail = (d) => navigate(`/deals/${d.id}`);

  const load = async () => {
    const res = await api.listDeals();
    setDeals(res.items || []);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['active', 'signed', 'all'].includes(t)) setTab(t);
  }, [searchParams]);

  const filtered = useMemo(() => deals.filter((d) => {
    if (tab === 'active' && d.status === 'SIGNED') return false;
    if (tab === 'signed' && d.status !== 'SIGNED') return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (assetFilter !== 'all' && d.assetClass !== assetFilter) return false;
    return true;
  }), [tab, categoryFilter, assetFilter, deals]);

  const counts = {
    all:    deals.length,
    active: deals.filter((d) => d.status !== 'SIGNED').length,
    signed: deals.filter((d) => d.status === 'SIGNED').length,
  };
  const totalSignedValue = deals
    .filter((d) => d.status === 'SIGNED')
    .reduce((s, d) => s + (d.closedPrice || 0), 0);
  const totalCommission = deals
    .filter((d) => d.status === 'SIGNED')
    .reduce((s, d) => s + (d.commission || 0), 0);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            עסקאות
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {filtered.length} מתוך {deals.length} עסקאות · {counts.active} פעילות · {counts.signed} נחתמו
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tab === 'signed' && (
            <div style={{
              display: 'inline-flex', gap: 12, padding: '6px 12px',
              borderRadius: 10, background: DT.cream3,
              border: `1px solid ${DT.border}`,
            }}>
              <KpiChip label="סה״כ ערך" value={formatPrice(totalSignedValue)} />
              <KpiChip label="סה״כ עמלות" value={formatPrice(totalCommission)} valueColor={DT.success} />
            </div>
          )}
          <button type="button" onClick={() => setCreating(true)} style={primaryBtn()}>
            <Plus size={14} /> צור עסקה
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <PillRow
          value={tab}
          onChange={setTab}
          items={[
            { k: 'active', label: 'פעילות', count: counts.active },
            { k: 'signed', label: 'נחתמו',  count: counts.signed },
            { k: 'all',    label: 'הכול',    count: counts.all },
          ]}
        />
        <span style={{ width: 1, height: 18, background: DT.border }} />
        <PillRow
          value={categoryFilter}
          onChange={setCategoryFilter}
          items={[
            { k: 'all',  label: 'מכירה + השכרה' },
            { k: 'SALE', label: 'מכירה' },
            { k: 'RENT', label: 'השכרה' },
          ]}
        />
        <span style={{ width: 1, height: 18, background: DT.border }} />
        <PillRow
          value={assetFilter}
          onChange={setAssetFilter}
          items={[
            { k: 'all',         label: 'פרטי + מסחרי' },
            { k: 'RESIDENTIAL', label: 'פרטי' },
            { k: 'COMMERCIAL',  label: 'מסחרי' },
          ]}
        />
      </div>

      {loading ? (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: 48, textAlign: 'center',
          color: DT.muted, fontSize: 13,
        }}>טוען עסקאות…</div>
      ) : tab === 'active' ? (
        <DealsKanban
          deals={filtered.filter((d) => d.status !== 'SIGNED')}
          onOpen={openDetail}
          onEdit={(d) => setEditing({ deal: d, mode: 'edit' })}
          onSign={(d) => setEditing({ deal: d, mode: 'sign' })}
        />
      ) : (
        <DealsCards
          deals={filtered}
          onOpen={openDetail}
          onEdit={(d) => setEditing({ deal: d, mode: 'edit' })}
        />
      )}

      {editing && (
        <DealEditModal
          deal={editing.deal}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
      {creating && (
        <DealCreateModal
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await load(); }}
        />
      )}
    </div>
  );
}

function KpiChip({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: 10, color: DT.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: valueColor || DT.ink }}>{value}</span>
    </div>
  );
}

function PillRow({ value, onChange, items }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((f) => {
        const on = value === f.k;
        return (
          <button
            key={f.k}
            type="button"
            onClick={() => onChange(f.k)}
            style={{
              ...FONT,
              background: on ? DT.ink : DT.white,
              color: on ? DT.cream : DT.ink,
              border: `1px solid ${on ? DT.ink : DT.border}`,
              padding: '7px 12px', borderRadius: 99,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {f.label}{f.count != null ? ` · ${f.count}` : ''}
          </button>
        );
      })}
    </div>
  );
}

function DealsKanban({ deals, onEdit, onSign, onOpen }) {
  const columns = [
    { key: 'NEGOTIATING',      label: 'משא ומתן' },
    { key: 'WAITING_MORTGAGE', label: 'אישור משכנתא' },
    { key: 'PENDING_CONTRACT', label: 'לקראת חתימה' },
    { key: 'FELL_THROUGH',     label: 'לא יצאו לפועל' },
  ];
  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    }}>
      {columns.map((col) => {
        const colDeals = deals.filter((d) => d.status === col.key);
        const accent = statusAccent(col.key);
        return (
          <div key={col.key} style={{
            background: DT.cream4,
            border: `1px solid ${DT.border}`,
            borderRadius: 14, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
            minHeight: 200,
          }}>
            <header style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingBottom: 8, borderBottom: `1px solid ${DT.border}`,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13 }}>
                <span style={{
                  background: accent.bg, color: accent.fg,
                  width: 18, height: 18, borderRadius: 99,
                  display: 'grid', placeItems: 'center',
                }}>
                  {accent.icon || <span style={{ fontSize: 11, fontWeight: 800 }}>{colDeals.length}</span>}
                </span>
                {col.label}
              </span>
              <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>
                {colDeals.length}
              </span>
            </header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {colDeals.map((d) => (
                <KanbanCard key={d.id} deal={d} onOpen={onOpen} onEdit={onEdit} onSign={onSign} />
              ))}
              {colDeals.length === 0 && (
                <div style={{
                  fontSize: 12, color: DT.muted, padding: '14px 0',
                  textAlign: 'center',
                }}>אין עסקאות</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ deal, onOpen, onEdit, onSign }) {
  // Click the body of the card to drill into /deals/:id, but stop
  // propagation on the two action buttons so quick-edit / quick-sign
  // can still operate without a page nav.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(deal)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(deal); } }}
      style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 12, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: '0 1px 3px rgba(30,26,20,0.04)',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 14 }}>
        {deal.propertyStreet}, {deal.city}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Chip color={deal.assetClass === 'COMMERCIAL' ? DT.warning : DT.success}>
          {assetLabel(deal.assetClass)}
        </Chip>
        <Chip color={deal.category === 'SALE' ? DT.goldDark : DT.info}>
          {categoryLabel(deal.category)}
        </Chip>
      </div>
      <div style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>{formatPrice(deal.marketingPrice)}</div>
        {deal.offer != null && (
          <div style={{ fontSize: 11, color: DT.muted }}>הצעה: {formatPrice(deal.offer)}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(deal); }}
          style={ghostBtn()}
        >עריכה</button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSign(deal); }}
          style={primaryBtn({ small: true })}
        >סמן כנחתם</button>
      </div>
    </div>
  );
}

function DealsCards({ deals, onEdit, onOpen }) {
  if (deals.length === 0) {
    return (
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 40, textAlign: 'center',
        color: DT.muted, fontSize: 14,
      }}>אין עסקאות בסינון הנוכחי</div>
    );
  }
  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    }}>
      {deals.map((d) => {
        const accent = statusAccent(d.status);
        const rel = relativeDate(d.updateDate);
        return (
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen?.(d)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(d); } }}
            style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              borderRadius: 14, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: '0 1px 3px rgba(30,26,20,0.04)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {d.propertyStreet}, {d.city}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  <Chip color={accent.fg} bg={accent.bg}>
                    {accent.icon} {statusLabelMap[d.status] || d.status}
                  </Chip>
                  <Chip color={d.assetClass === 'COMMERCIAL' ? DT.warning : DT.success}>
                    {assetLabel(d.assetClass)}
                  </Chip>
                  <Chip color={d.category === 'SALE' ? DT.goldDark : DT.info}>
                    {categoryLabel(d.category)}
                  </Chip>
                </div>
              </div>
              <span title={absoluteTime(d.updateDate)} style={{ fontSize: 11, color: DT.muted, whiteSpace: 'nowrap' }}>
                {rel.label}
              </span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: 8, padding: '10px 12px',
              background: DT.cream4, borderRadius: 10, border: `1px solid ${DT.border}`,
            }}>
              <PriceRow label="מחיר שיווק" value={formatPrice(d.marketingPrice)} />
              <PriceRow label="הצעה" value={formatPrice(d.offer)} />
              <PriceRow label="סגירה" value={formatPrice(d.closedPrice)} bold />
              {d.commission != null && (
                <PriceRow label="עמלה" value={formatPrice(d.commission)} color={DT.success} bold />
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(d); }}
                style={ghostBtn()}
              >
                <Edit3 size={12} /> עריכה
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriceRow({ label, value, color, bold }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: DT.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || DT.ink }}>{value}</div>
    </div>
  );
}

function Chip({ color, bg, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg || DT.goldSoft, color,
      borderRadius: 99, fontWeight: 700, fontSize: 11,
      padding: '2px 8px',
    }}>{children}</span>
  );
}

function primaryBtn({ small = false } = {}) {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: small ? '6px 10px' : '9px 16px',
    borderRadius: 10, cursor: 'pointer',
    fontSize: small ? 11 : 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
    fontSize: 11, fontWeight: 700,
    display: 'inline-flex', gap: 4, alignItems: 'center', color: DT.ink,
  };
}

// ─── Edit modal ─────────────────────────────────────────────────
// Kept on the agreement-dialog class set because those styles already
// render as a cream-card modal in light mode. Rewriting the modal
// chrome would not be visually different, so the inline-style port
// stops at the page shell above.
//
// Exported so /deals/:id (DealDetail) can reuse the same dialog for
// the "עריכה" button on the standalone page — keeps one copy of the
// form validation + submit logic.
export function DealEditModal({ deal, mode, onClose, onSaved }) {
  const [form, setForm] = useState({
    status: mode === 'sign' ? 'SIGNED' : deal.status,
    marketingPrice: deal.marketingPrice ?? '',
    offer: deal.offer ?? '',
    closedPrice: deal.closedPrice ?? '',
    commission: deal.commission ?? '',
    buyerAgent: deal.buyerAgent ?? '',
    sellerAgent: deal.sellerAgent ?? '',
    lawyer: deal.lawyer ?? '',
    signedAt: deal.signedAt ? deal.signedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        status: form.status,
        marketingPrice: Number(form.marketingPrice) || 0,
        offer: form.offer !== '' ? Number(form.offer) : null,
        closedPrice: form.closedPrice !== '' ? Number(form.closedPrice) : null,
        commission: form.commission !== '' ? Number(form.commission) : null,
        buyerAgent: form.buyerAgent || null,
        sellerAgent: form.sellerAgent || null,
        lawyer: form.lawyer || null,
        signedAt: form.status === 'SIGNED' && form.signedAt
          ? new Date(form.signedAt).toISOString()
          : null,
      };
      await api.updateDeal(deal.id, body);
      onSaved();
    } catch (e) {
      setError(e.message || 'עדכון נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agreement-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="agreement-modal" role="dialog" aria-modal="true">
        <header className="agreement-header">
          <div>
            <h3>{mode === 'sign' ? 'סימון עסקה כנחתמה' : 'עריכת עסקה'}</h3>
            <p>{deal.propertyStreet}, {deal.city}</p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="סגור">
            <X size={20} />
          </button>
        </header>
        <div className="agreement-body">
          {error && (
            <div className="agreement-error"><AlertCircle size={14} />{error}</div>
          )}
          <div className="deal-form-grid">
            <div className="form-group">
              <label className="form-label">סטטוס</label>
              <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
                {STATUS_OPTIONS.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
              </select>
            </div>
            {form.status === 'SIGNED' && (
              <div className="form-group">
                <label className="form-label">תאריך חתימה</label>
                <input type="date" className="form-input" value={form.signedAt} onChange={(e) => update('signedAt', e.target.value)} />
                <DateQuickChips value={form.signedAt} onChange={(v) => update('signedAt', v)} chips={['today', '-1d', '-7d']} />
              </div>
            )}
            <PriceInput label="מחיר שיווק" value={form.marketingPrice} onChange={(v) => update('marketingPrice', v)} />
            <PriceInput label="הצעה"       value={form.offer}          onChange={(v) => update('offer', v)} />
            <PriceInput label="מחיר סגירה" value={form.closedPrice}    onChange={(v) => update('closedPrice', v)} />
            <PriceInput label="עמלה"        value={form.commission}     onChange={(v) => update('commission', v)} />
            <TextInput label="סוכן צד קונים" value={form.buyerAgent} onChange={(v) => update('buyerAgent', v)} />
            <TextInput label="סוכן צד מוכרים" value={form.sellerAgent} onChange={(v) => update('sellerAgent', v)} />
            <TextInput label="עו״ד" value={form.lawyer} onChange={(v) => update('lawyer', v)} />
          </div>
          <div className="deal-form-actions">
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
              {busy ? 'שומר…' : 'שמור'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceInput({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next"
        dir="ltr" style={{ textAlign: 'right' }}
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
      />
    </div>
  );
}
function TextInput({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type="text" className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DealCreateModal({ onClose, onSaved }) {
  const toast = useToast();
  const [leads, setLeads] = useState([]);
  const [owners, setOwners] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    buyerId: '', sellerId: '', propertyId: '',
    propertyStreet: '', city: '',
    assetClass: 'RESIDENTIAL', category: 'SALE', status: 'NEGOTIATING',
    marketingPrice: '', commission: '', closeDate: '',
  });
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lr, or, pr] = await Promise.all([
          api.listLeads().catch(() => ({ items: [] })),
          api.listOwners().catch(() => ({ items: [] })),
          api.listProperties().catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setLeads(lr.items || []);
        setOwners(or.items || []);
        setProperties(pr.items || []);
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onPropertyChange = (pid) => {
    update('propertyId', pid);
    const p = properties.find((x) => x.id === pid);
    if (p) {
      update('propertyStreet', p.street || '');
      update('city', p.city || '');
      update('assetClass', p.assetClass || 'RESIDENTIAL');
      update('category', p.category || 'SALE');
      update('marketingPrice', p.marketingPrice ?? '');
    }
  };

  const canSubmit = !!form.propertyStreet && !!form.city && Number(form.marketingPrice) > 0 && !busy;

  const handleSave = async () => {
    setError(null);
    setBusy(true);
    try {
      await runMutation(
        () => api.createDeal({
          propertyId: form.propertyId || null,
          propertyStreet: form.propertyStreet,
          city: form.city,
          assetClass: form.assetClass,
          category: form.category,
          status: form.status,
          marketingPrice: Number(form.marketingPrice) || 0,
          commission: form.commission !== '' ? Number(form.commission) : null,
          buyerId: form.buyerId || null,
          sellerId: form.sellerId || null,
          closeDate: form.closeDate ? new Date(form.closeDate).toISOString() : null,
        }),
        {
          reload: onSaved,
          toast,
          toasts: { success: 'העסקה נוצרה', error: 'יצירת העסקה נכשלה' },
        },
      );
    } catch (e) {
      setError(e?.message || 'יצירת העסקה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agreement-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="agreement-modal" role="dialog" aria-modal="true" aria-labelledby="deal-create-title">
        <header className="agreement-header">
          <div>
            <h3 id="deal-create-title">צור עסקה</h3>
            <p>בחר ליד, בעלים, נכס, ומלא עמלה וסטטוס.</p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="סגור"><X size={20} /></button>
        </header>
        <div className="agreement-body">
          {error && (
            <div className="agreement-error"><AlertCircle size={14} />{error}</div>
          )}
          <div className="deal-form-grid">
            <SelectRow label="נכס" value={form.propertyId} onChange={onPropertyChange} disabled={loadingRefs}
              options={[{ value: '', label: 'ללא נכס' }, ...properties.map((p) => ({ value: p.id, label: `${p.street}, ${p.city}` }))]} />
            <SelectRow label="קונה (ליד)" value={form.buyerId} onChange={(v) => update('buyerId', v)} disabled={loadingRefs}
              options={[{ value: '', label: 'ללא קונה' }, ...leads.map((l) => ({ value: l.id, label: `${l.name}${l.phone ? ' · ' + l.phone : ''}` }))]} />
            <SelectRow label="מוכר (בעלים)" value={form.sellerId} onChange={(v) => update('sellerId', v)} disabled={loadingRefs}
              options={[{ value: '', label: 'ללא מוכר' }, ...owners.map((o) => ({ value: o.id, label: `${o.name}${o.phone ? ' · ' + o.phone : ''}` }))]} />
            <SelectRow label="סטטוס" value={form.status} onChange={(v) => update('status', v)}
              options={STATUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} />
            <TextInput label="רחוב" value={form.propertyStreet} onChange={(v) => update('propertyStreet', v)} />
            <TextInput label="עיר"  value={form.city}           onChange={(v) => update('city', v)} />
            <PriceInput label="מחיר שיווק" value={form.marketingPrice} onChange={(v) => update('marketingPrice', v)} />
            <PriceInput label="עמלה"        value={form.commission}     onChange={(v) => update('commission', v)} />
            <div className="form-group">
              <label className="form-label">תאריך סגירה</label>
              <input type="date" className="form-input" value={form.closeDate} onChange={(e) => update('closeDate', e.target.value)} />
              <DateQuickChips value={form.closeDate} onChange={(v) => update('closeDate', v)} chips={['today', '+7d', '+30d']} />
            </div>
          </div>
          <div className="deal-form-actions">
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSubmit}>
              {busy ? 'שומר…' : 'צור עסקה'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, onChange, options, disabled }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </div>
  );
}
