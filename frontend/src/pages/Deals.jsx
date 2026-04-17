import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { deals, formatPrice, getAssetClassLabel } from '../data/mockData';
import './Deals.css';

export default function Deals() {
  const [searchParams] = useSearchParams();
  // 'active' | 'signed' | 'all'
  const [tab, setTab] = useState('active');
  // 'all' | 'sale' | 'rent'
  const [categoryFilter, setCategoryFilter] = useState('all');
  // 'all' | 'residential' | 'commercial'
  const [assetFilter, setAssetFilter] = useState('all');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['active', 'signed', 'all'].includes(t)) setTab(t);
  }, [searchParams]);

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (tab === 'active' && d.status === 'נחתם') return false;
      if (tab === 'signed' && d.status !== 'נחתם') return false;
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      if (assetFilter !== 'all' && d.assetClass !== assetFilter) return false;
      return true;
    });
  }, [tab, categoryFilter, assetFilter]);

  const counts = {
    all: deals.length,
    active: deals.filter((d) => d.status !== 'נחתם').length,
    signed: deals.filter((d) => d.status === 'נחתם').length,
  };

  const categoryCount = (cat) => deals.filter((d) => d.category === cat).length;
  const assetCount = (cls) => deals.filter((d) => d.assetClass === cls).length;

  const totalSignedValue = deals
    .filter((d) => d.status === 'נחתם')
    .reduce((s, d) => s + (d.closedPrice || 0), 0);
  const totalCommission = deals
    .filter((d) => d.status === 'נחתם')
    .reduce((s, d) => s + (d.commission || 0), 0);

  const getStatusBadge = (status) => {
    if (status === 'נחתם') return 'success';
    if (status.includes('ממתין')) return 'warning';
    return 'info';
  };

  const getStatusIcon = (status) => {
    if (status === 'נחתם') return <CheckCircle size={14} />;
    if (status.includes('ממתין')) return <Clock size={14} />;
    return <AlertCircle size={14} />;
  };

  return (
    <div className="deals-page">
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
        {/* Active / signed / all */}
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

        {/* Sale vs rent */}
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'מכירה + השכרה', count: deals.length },
            { key: 'sale', label: 'מכירה', count: categoryCount('sale') },
            { key: 'rent', label: 'השכרה', count: categoryCount('rent') },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${categoryFilter === f.key ? 'active' : ''}`}
              onClick={() => setCategoryFilter(f.key)}
            >
              {f.label}
              <span className="filter-count">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Private vs commercial */}
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'פרטי + מסחרי', count: deals.length },
            { key: 'residential', label: 'פרטי', count: assetCount('residential') },
            { key: 'commercial', label: 'מסחרי', count: assetCount('commercial') },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${assetFilter === f.key ? 'active' : ''}`}
              onClick={() => setAssetFilter(f.key)}
            >
              {f.label}
              <span className="filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="deals-cards animate-in animate-in-delay-2">
        {filtered.map((deal) => (
          <div key={deal.id} className="deal-card">
            <div className="deal-card-top">
              <div className="deal-property-info">
                <h4>{deal.propertyStreet}, {deal.city}</h4>
                <div className="deal-chip-row">
                  <span className={`badge badge-${getStatusBadge(deal.status)}`}>
                    {getStatusIcon(deal.status)}
                    {deal.status}
                  </span>
                  <span className={`badge ${deal.assetClass === 'commercial' ? 'badge-warning' : 'badge-success'}`}>
                    {getAssetClassLabel(deal.assetClass)}
                  </span>
                  <span className={`badge ${deal.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                    {deal.category === 'sale' ? 'מכירה' : 'השכרה'}
                  </span>
                </div>
              </div>
              <span className="deal-date">{deal.updateDate}</span>
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
                <span className="dp-value highlight">
                  {deal.closedPrice ? formatPrice(deal.closedPrice) : '—'}
                </span>
              </div>
              {deal.commission && (
                <div className="deal-price-item">
                  <span className="dp-label">עמלה</span>
                  <span className="dp-value commission">
                    {formatPrice(deal.commission)}
                  </span>
                </div>
              )}
            </div>

            <div className="deal-agents">
              <div className="deal-agent">
                <span className="da-label">סוכן צד קונים</span>
                <span className="da-value">{deal.buyerAgent}</span>
              </div>
              <div className="deal-agent">
                <span className="da-label">סוכן צד מוכרים</span>
                <span className="da-value">{deal.sellerAgent}</span>
              </div>
              <div className="deal-agent">
                <span className="da-label">עו״ד</span>
                <span className="da-value">{deal.lawyer}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <h3>לא נמצאו עסקאות</h3>
            <p>שנה את הסינון כדי לראות עסקאות נוספות</p>
          </div>
        )}
      </div>
    </div>
  );
}
