import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Phone,
  MessageCircle,
  DollarSign,
  CheckCircle,
  XCircle,
  Calendar,
} from 'lucide-react';
import { leads, properties } from '../data/mockData';
import './Buyers.css';

export default function Buyers() {
  const [search, setSearch] = useState('');

  const buyers = leads.filter((l) => l.interestType === 'פרטי');
  const filtered = buyers.filter((b) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return b.name.includes(s) || b.city.includes(s) || b.phone.includes(s);
  });

  return (
    <div className="buyers-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>קונים פוטנציאלים</h2>
          <p>{buyers.length} קונים במערכת</p>
        </div>
      </div>

      <div className="filters-bar animate-in animate-in-delay-1">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="חיפוש לפי שם, עיר, טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container animate-in animate-in-delay-2">
        <table>
          <thead>
            <tr>
              <th>שם לקוח</th>
              <th>טלפון</th>
              <th>תקציב</th>
              <th>אישור עקרוני</th>
              <th>עיר</th>
              <th>חדרים</th>
              <th>נכסים שנצפו</th>
              <th>קשר אחרון</th>
              <th>הערות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((buyer) => (
              <tr key={buyer.id}>
                <td>
                  <div className="buyer-name-cell">
                    <div className="buyer-avatar-sm">
                      {buyer.name.charAt(0)}
                    </div>
                    <span>{buyer.name}</span>
                  </div>
                </td>
                <td>
                  <a href={`tel:${buyer.phone}`} className="phone-link">
                    {buyer.phone}
                  </a>
                </td>
                <td>{buyer.priceRange}</td>
                <td>
                  {buyer.preApproval ? (
                    <span className="approval-yes">
                      <CheckCircle size={14} />
                      יש
                    </span>
                  ) : (
                    <span className="approval-no">
                      <XCircle size={14} />
                      אין
                    </span>
                  )}
                </td>
                <td>{buyer.city}</td>
                <td>{buyer.rooms || '—'}</td>
                <td>
                  <div className="viewed-properties">
                    {buyer.propertiesViewed.length > 0
                      ? buyer.propertiesViewed.map((pid) => {
                          const p = properties.find((pr) => pr.id === pid);
                          return p ? (
                            <Link
                              key={pid}
                              to={`/properties/${pid}`}
                              className="lcd-property-link"
                            >
                              {p.street}
                            </Link>
                          ) : null;
                        })
                      : '—'}
                  </div>
                </td>
                <td>{buyer.lastContact}</td>
                <td>
                  <span className="notes-cell">{buyer.notes || '—'}</span>
                </td>
                <td>
                  <div className="action-buttons">
                    <a
                      href={`tel:${buyer.phone}`}
                      className="btn btn-ghost btn-sm"
                      title="התקשר"
                    >
                      <Phone size={14} />
                    </a>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="וואטסאפ"
                      onClick={() => {
                        window.open(
                          `https://wa.me/${buyer.phone.replace(/[^0-9]/g, '')}`,
                          '_blank'
                        );
                      }}
                    >
                      <MessageCircle size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
