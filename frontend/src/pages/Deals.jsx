import {
  Handshake,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { deals, formatPrice } from '../data/mockData';
import './Deals.css';

export default function Deals() {
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
          <p>{deals.length} עסקאות במערכת</p>
        </div>
      </div>

      <div className="deals-cards animate-in animate-in-delay-1">
        {deals.map((deal) => (
          <div key={deal.id} className="deal-card">
            <div className="deal-card-top">
              <div className="deal-property-info">
                <h4>{deal.propertyStreet}, {deal.city}</h4>
                <span className={`badge badge-${getStatusBadge(deal.status)}`}>
                  {getStatusIcon(deal.status)}
                  {deal.status}
                </span>
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
      </div>
    </div>
  );
}
