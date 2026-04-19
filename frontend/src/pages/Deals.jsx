import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Edit3,
  X,
  Handshake,
} from 'lucide-react';
import api from '../lib/api';
import { absoluteTime } from '../lib/time';
import { relativeDate } from '../lib/relativeDate';
import { DateQuickChips } from '../components/MobilePickers';
import './Deals.css';

const STATUS_OPTIONS = [
  { key: 'NEGOTIATING', label: 'משא ומתן' },
  { key: 'WAITING_MORTGAGE', label: 'ממתין לאישור משכנתא' },
  { key: 'PENDING_CONTRACT', label: 'ממתין לחוזה' },
  { key: 'SIGNED', label: 'נחתם' },
  { key: 'FELL_THROUGH', label: 'לא יצא לפועל' },
];

const statusLabelMap = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.key, o.label]));

function formatPrice(price) {
  if (price == null) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

function assetLabel(ac) { return ac === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'; }
function categoryLabel(c) { return c === 'SALE' ? 'מכירה' : 'השכרה'; }

export default function Deals() {
  const [searchParams] = useSearchParams();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');
  const [editing, setEditing] = useState(null);

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

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (tab === 'active' && d.status === 'SIGNED') return false;
      if (tab === 'signed' && d.status !== 'SIGNED') return false;
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (assetFilter !== 'all' && d.assetClass !== assetFilter) return false;
      return true;
    });
  }, [tab, categoryFilter, assetFilter, deals]);

  const counts = {
    all: deals.length,
    active: deals.filter((d) => d.status !== 'SIGNED').length,
    signed: deals.filter((d) => d.status === 'SIGNED').length,
  };

  const totalSignedValue = deals
    .filter((d) => d.status === 'SIGNED')
    .reduce((s, d) => s + (d.closedPrice || 0), 0);
  const totalCommission = deals
    .filter((d) => d.status === 'SIGNED')
    .reduce((s, d) => s + (d.commission || 0), 0);

  const getStatusBadge = (status) => {
    if (status === 'SIGNED') return 'success';
    if (status === 'WAITING_MORTGAGE' || status === 'PENDING_CONTRACT') return 'warning';
    if (status === 'FELL_THROUGH') return 'danger';
    return 'info';
  };
  const getStatusIcon = (status) => {
    if (status === 'SIGNED') return <CheckCircle size={14} />;
    if (status === 'WAITING_MORTGAGE' || status === 'PENDING_CONTRACT') return <Clock size={14} />;
    return <AlertCircle size={14} />;
  };

  return (
    <div className="deals-page app-wide-cap">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>עסקאות</h2>
          <p>{filtered.length} מתוך {deals.length} עסקאות</p>
        </div>
        {tab === 'signed' && (
          <div className="deals-totals">
            <div className="deals-total">
              <span className="dt-label">סה״כ ערך עסקאות</span>
              <span className="dt-value">{formatPrice(totalSignedValue)}</span>
            </div>
            <div className="deals-total">
              <span className="dt-label">סה״כ עמלות</span>
              <span className="dt-value success">{formatPrice(totalCommission)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="filters-bar animate-in animate-in-delay-1">
        <div className="filter-tabs">
          {[
            { key: 'active', label: 'פעילות', count: counts.active },
            { key: 'signed', label: 'נחתמו', count: counts.signed },
            { key: 'all', label: 'הכל', count: counts.all },
          ].map((t) => (
            <button
              key={t.key}
              className={`filter-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="filter-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="filter-tabs">
          {[
            { key: 'all', label: 'מכירה + השכרה' },
            { key: 'SALE', label: 'מכירה' },
            { key: 'RENT', label: 'השכרה' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${categoryFilter === f.key ? 'active' : ''}`}
              onClick={() => setCategoryFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="filter-tabs">
          {[
            { key: 'all', label: 'פרטי + מסחרי' },
            { key: 'RESIDENTIAL', label: 'פרטי' },
            { key: 'COMMERCIAL', label: 'מסחרי' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${assetFilter === f.key ? 'active' : ''}`}
              onClick={() => setAssetFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="deals-loading"><div className="spinner-gold" /></div>
      ) : tab === 'active' ? (
        <DealsKanban
          deals={filtered.filter((d) => d.status !== 'SIGNED')}
          onEdit={(d) => setEditing({ deal: d, mode: 'edit' })}
          onSign={(d) => setEditing({ deal: d, mode: 'sign' })}
        />
      ) : (
        <div className="deals-cards animate-in animate-in-delay-2">
          {filtered.map((deal) => (
            <div key={deal.id} className={`deal-card ${deal.status === 'SIGNED' ? 'is-signed' : ''}`}>
              <div className="deal-card-top">
                <div className="deal-property-info">
                  <h4>{deal.propertyStreet}, {deal.city}</h4>
                  <div className="deal-chip-row">
                    <span className={`badge badge-${getStatusBadge(deal.status)}`}>
                      {getStatusIcon(deal.status)}
                      {statusLabelMap[deal.status] || deal.status}
                    </span>
                    <span className={`badge ${deal.assetClass === 'COMMERCIAL' ? 'badge-warning' : 'badge-success'}`}>
                      {assetLabel(deal.assetClass)}
                    </span>
                    <span className={`badge ${deal.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
                      {categoryLabel(deal.category)}
                    </span>
                  </div>
                </div>
                {(() => {
                  const rel = relativeDate(deal.updateDate);
                  return (
                    <span
                      className={`deal-date rel-${rel.severity}`}
                      title={absoluteTime(deal.updateDate)}
                    >
                      {rel.label}
                    </span>
                  );
                })()}
              </div>

              <div className="deal-prices">
                <div className="deal-price-item">
                  <span className="dp-label">מחיר שיווק</span>
                  <span className="dp-value">{formatPrice(deal.marketingPrice)}</span>
                </div>
                <div className="deal-price-item">
                  <span className="dp-label">הצעה</span>
                  <span className="dp-value">{formatPrice(deal.offer)}</span>
                </div>
                <div className="deal-price-item">
                  <span className="dp-label">מחיר סגירה</span>
                  <span className="dp-value highlight">{formatPrice(deal.closedPrice)}</span>
                </div>
                {deal.commission != null && (
                  <div className="deal-price-item">
                    <span className="dp-label">עמלה</span>
                    <span className="dp-value commission">{formatPrice(deal.commission)}</span>
                  </div>
                )}
              </div>

              <div className="deal-agents">
                <div className="deal-agent">
                  <span className="da-label">סוכן צד קונים</span>
                  <span className="da-value">{deal.buyerAgent || '—'}</span>
                </div>
                <div className="deal-agent">
                  <span className="da-label">סוכן צד מוכרים</span>
                  <span className="da-value">{deal.sellerAgent || '—'}</span>
                </div>
                <div className="deal-agent">
                  <span className="da-label">עו״ד</span>
                  <span className="da-value">{deal.lawyer || '—'}</span>
                </div>
              </div>

              <div className="deal-actions">
                {deal.status !== 'SIGNED' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setEditing({ deal, mode: 'sign' })}
                  >
                    <Handshake size={14} />
                    סמן כנחתם
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditing({ deal, mode: 'edit' })}
                >
                  <Edit3 size={14} />
                  עריכת עסקה
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="deals-empty">
              <p>אין עסקאות בסינון הנוכחי</p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <DealEditModal
          deal={editing.deal}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function DealsKanban({ deals, onEdit, onSign }) {
  const columns = [
    { key: 'NEGOTIATING', label: 'משא ומתן' },
    { key: 'WAITING_MORTGAGE', label: 'אישור משכנתא' },
    { key: 'PENDING_CONTRACT', label: 'לקראת חתימה' },
    { key: 'FELL_THROUGH', label: 'לא יצאו לפועל' },
  ];

  return (
    <div className="deals-kanban animate-in animate-in-delay-2">
      {columns.map((col) => {
        const colDeals = deals.filter((d) => d.status === col.key);
        const isEmpty = colDeals.length === 0;
        return (
          <div
            key={col.key}
            className={`dk-col dk-${col.key.toLowerCase()} ${isEmpty ? 'dk-col-empty' : ''}`}
          >
            <header className="dk-head">
              <span className="dk-title">{col.label}</span>
              <span className="dk-count">{colDeals.length}</span>
            </header>
            <div className="dk-body">
              {colDeals.map((d) => (
                <div key={d.id} className="dk-card">
                  <h5>{d.propertyStreet}, {d.city}</h5>
                  <div className="dk-chips">
                    <span className={`chip chip-sm ${d.assetClass === 'COMMERCIAL' ? 'chip-warning' : 'chip-success'}`}>
                      {d.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
                    </span>
                    <span className={`chip chip-sm ${d.category === 'SALE' ? 'chip-gold' : 'chip-info'}`}>
                      {d.category === 'SALE' ? 'מכירה' : 'השכרה'}
                    </span>
                  </div>
                  <div className="dk-prices">
                    <span className="dk-price-main">{formatPrice(d.marketingPrice)}</span>
                    {d.offer != null && (
                      <span className="dk-price-offer">הצעה: {formatPrice(d.offer)}</span>
                    )}
                  </div>
                  <div className="dk-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(d)}>
                      עריכה
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => onSign(d)}>
                      סמן כנחתם
                    </button>
                  </div>
                </div>
              ))}
              {colDeals.length === 0 && (
                <div className="dk-empty">אין עסקאות</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealEditModal({ deal, mode, onClose, onSaved }) {
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
    <div className="agreement-backdrop" onClick={onClose}>
      <div className="agreement-modal" onClick={(e) => e.stopPropagation()}>
        <header className="agreement-header">
          <div>
            <h3>{mode === 'sign' ? 'סימון עסקה כנחתמה' : 'עריכת עסקה'}</h3>
            <p>{deal.propertyStreet}, {deal.city}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="agreement-body">
          {error && (
            <div className="agreement-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="deal-form-grid">
            <div className="form-group">
              <label className="form-label">סטטוס</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            {form.status === 'SIGNED' && (
              <div className="form-group">
                <label className="form-label">תאריך חתימה</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.signedAt}
                  onChange={(e) => update('signedAt', e.target.value)}
                />
                <DateQuickChips
                  value={form.signedAt}
                  onChange={(v) => update('signedAt', v)}
                  chips={['today', '-1d', '-7d']}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">מחיר שיווק</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="next"
                dir="ltr"
                style={{ textAlign: 'right' }}
                className="form-input"
                value={form.marketingPrice}
                onChange={(e) => update('marketingPrice', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">הצעה</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="next"
                dir="ltr"
                style={{ textAlign: 'right' }}
                className="form-input"
                value={form.offer}
                onChange={(e) => update('offer', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">מחיר סגירה</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="next"
                dir="ltr"
                style={{ textAlign: 'right' }}
                className="form-input"
                value={form.closedPrice}
                onChange={(e) => update('closedPrice', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">עמלה</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="next"
                dir="ltr"
                style={{ textAlign: 'right' }}
                className="form-input"
                value={form.commission}
                onChange={(e) => update('commission', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">סוכן צד קונים</label>
              <input
                type="text"
                className="form-input"
                value={form.buyerAgent}
                onChange={(e) => update('buyerAgent', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">סוכן צד מוכרים</label>
              <input
                type="text"
                className="form-input"
                value={form.sellerAgent}
                onChange={(e) => update('sellerAgent', e.target.value)}
              />
            </div>
            <div className="form-group form-group-wide">
              <label className="form-label">עו״ד</label>
              <input
                type="text"
                className="form-input"
                value={form.lawyer}
                onChange={(e) => update('lawyer', e.target.value)}
              />
            </div>
          </div>

          <div className="deal-form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={busy}
            >
              {busy ? 'שומר…' : mode === 'sign' ? 'סמן כנחתם' : 'שמור שינויים'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
