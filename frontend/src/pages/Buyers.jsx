import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { leads, properties } from '../data/mockData';
import './Buyers.css';

export default function Buyers() {
  const [search, setSearch] = useState('');
  // 'buy' | 'rent' | 'all'
  const [lookingForFilter, setLookingForFilter] = useState('all');
  // 'פרטי' | 'מסחרי' | 'all'
  const [interestFilter, setInterestFilter] = useState('all');

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (lookingForFilter !== 'all' && l.lookingFor !== lookingForFilter) return false;
      if (interestFilter !== 'all' && l.interestType !== interestFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return l.name.includes(s) || l.city.includes(s) || l.phone.includes(s);
    });
  }, [search, lookingForFilter, interestFilter]);

  const countBy = (pred) => leads.filter(pred).length;

  return (
    <div className="buyers-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>קונים / שוכרים</h2>
          <p>{filtered.length} מתוך {leads.length} לקוחות במערכת</p>
        </div>
      </div>

      <div className="filters-bar animate-in animate-in-delay-1">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="חיפוש לפי שם, עיר, טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Buy vs Rent */}
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל', count: leads.length },
            { key: 'buy', label: 'קונים', count: countBy((l) => l.lookingFor === 'buy') },
            { key: 'rent', label: 'שוכרים', count: countBy((l) => l.lookingFor === 'rent') },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${lookingForFilter === f.key ? 'active' : ''}`}
              onClick={() => setLookingForFilter(f.key)}
            >
              {f.label}
              <span className="filter-count">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Private vs Commercial */}
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל', count: leads.length },
            { key: 'פרטי', label: 'פרטי', count: countBy((l) => l.interestType === 'פרטי') },
            { key: 'מסחרי', label: 'מסחרי', count: countBy((l) => l.interestType === 'מסחרי') },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${interestFilter === f.key ? 'active' : ''}`}
              onClick={() => setInterestFilter(f.key)}
            >
              {f.label}
              <span className="filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="table-container animate-in animate-in-delay-2">
        <table>
          <thead>
            <tr>
              <th>שם לקוח</th>
              <th>סוג</th>
              <th>טלפון</th>
              <th>תקציב</th>
              <th>אישור עקרוני</th>
              <th>עיר</th>
              <th>חדרים</th>
              <th>נכסים שנצפו</th>
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
                  <span className="type-pill">
                    {buyer.interestType}
                  </span>
                  <span className={`type-pill ${buyer.lookingFor === 'rent' ? 'rent' : 'buy'}`}>
                    {buyer.lookingFor === 'rent' ? 'שכירות' : 'קנייה'}
                  </span>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-row">
                  לא נמצאו לקוחות בסינון הנוכחי
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
