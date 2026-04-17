import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Save } from 'lucide-react';
import { cityNames, streetNames } from '../data/mockData';
import './Forms.css';

export default function NewLead() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    interestType: 'פרטי',
    lookingFor: 'buy',
    city: '',
    street: '',
    rooms: '',
    priceMin: '',
    priceMax: '',
    preApproval: false,
    source: '',
    sector: 'כללי',
    balconyRequired: false,
    schoolProximity: '',
    parkingRequired: false,
    elevatorRequired: false,
    safeRoomRequired: false,
    acRequired: false,
    storageRequired: false,
    brokerageSignedAt: '',
    brokerageExpiresAt: '',
    notes: '',
  });

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Default end-of-agreement to 6 months after signing — industry default
  const onSignedAtChange = (value) => {
    setForm((prev) => {
      const next = { ...prev, brokerageSignedAt: value };
      if (value && !prev.brokerageExpiresAt) {
        const d = new Date(value);
        d.setMonth(d.getMonth() + 6);
        next.brokerageExpiresAt = d.toISOString().slice(0, 10);
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/leads');
  };

  // Street autocomplete is narrowed by the selected city when there's a match
  const streetOptions = useMemo(() => {
    if (!form.city) return streetNames;
    return streetNames;
  }, [form.city]);

  return (
    <div className="form-page">
      <Link to="/leads" className="back-link animate-in">
        <ArrowRight size={16} />
        חזרה ללידים
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>ליד חדש</h2>
          <p>הזן פרטי לקוח מתעניין</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="intake-form animate-in animate-in-delay-1">
        <div className="form-section">
          <h3 className="form-section-title">פרטים אישיים</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">שם הלקוח</label>
              <input
                className="form-input"
                placeholder="שם מלא"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">טלפון</label>
              <input
                className="form-input"
                placeholder="050-1234567"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">מקור הליד</label>
              <select
                className="form-select"
                value={form.source}
                onChange={(e) => update('source', e.target.value)}
              >
                <option value="">בחר מקור...</option>
                <option>פייסבוק</option>
                <option>יד 2</option>
                <option>אתר</option>
                <option>הפניה</option>
                <option>הפניה מלקוח</option>
                <option>סיור סוכנים</option>
                <option>בית פתוח</option>
                <option>שלט</option>
                <option>אחר</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">סוג התעניינות</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${form.interestType === 'פרטי' ? 'active' : ''}`}
                  onClick={() => update('interestType', 'פרטי')}
                >
                  פרטי
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${form.interestType === 'מסחרי' ? 'active' : ''}`}
                  onClick={() => update('interestType', 'מסחרי')}
                >
                  מסחרי
                </button>
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">קנייה / שכירות</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${form.lookingFor === 'buy' ? 'active' : ''}`}
                  onClick={() => update('lookingFor', 'buy')}
                >
                  קנייה
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${form.lookingFor === 'rent' ? 'active' : ''}`}
                  onClick={() => update('lookingFor', 'rent')}
                >
                  שכירות
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">מגזר</label>
              <select
                className="form-select"
                value={form.sector}
                onChange={(e) => update('sector', e.target.value)}
              >
                <option>כללי</option>
                <option>דתי</option>
                <option>חרדי</option>
                <option>ערבי</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">העדפות חיפוש</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">עיר מבוקשת</label>
              <input
                className="form-input"
                placeholder="התחל להקליד — לדוגמה: רא..."
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                list="lead-city-list"
                autoComplete="off"
              />
              <datalist id="lead-city-list">
                {cityNames.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">רחוב (אופציונלי)</label>
              <input
                className="form-input"
                placeholder="התחל להקליד רחוב..."
                value={form.street}
                onChange={(e) => update('street', e.target.value)}
                list="lead-street-list"
                autoComplete="off"
              />
              <datalist id="lead-street-list">
                {streetOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">מספר חדרים</label>
              <input
                className="form-input"
                placeholder="לדוגמה: 4-5"
                value={form.rooms}
                onChange={(e) => update('rooms', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">מחיר מינימום</label>
              <input
                type="number"
                className="form-input"
                placeholder="₪"
                value={form.priceMin}
                onChange={(e) => update('priceMin', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">מחיר מקסימום</label>
              <input
                type="number"
                className="form-input"
                placeholder="₪"
                value={form.priceMax}
                onChange={(e) => update('priceMax', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">קירבה לבית ספר</label>
              <select
                className="form-select"
                value={form.schoolProximity}
                onChange={(e) => update('schoolProximity', e.target.value)}
              >
                <option value="">לא חשוב</option>
                <option>עד 200 מטר</option>
                <option>עד 500 מטר</option>
                <option>הליכה</option>
                <option>עד ק״מ</option>
              </select>
            </div>
          </div>
          <div className="checkbox-grid">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.preApproval}
                onChange={(e) => update('preApproval', e.target.checked)}
              />
              <span className="checkbox-custom" />
              אישור עקרוני למשכנתא
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.balconyRequired}
                onChange={(e) => update('balconyRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מרפסת
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.parkingRequired}
                onChange={(e) => update('parkingRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              חניה
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.elevatorRequired}
                onChange={(e) => update('elevatorRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מעלית
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.safeRoomRequired}
                onChange={(e) => update('safeRoomRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              ממ״ד
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.acRequired}
                onChange={(e) => update('acRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מזגנים
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.storageRequired}
                onChange={(e) => update('storageRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מחסן
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">הסכם תיווך</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">מועד חתימה על הסכם תיווך</label>
              <input
                type="date"
                className="form-input"
                value={form.brokerageSignedAt}
                onChange={(e) => onSignedAtChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">מועד סיום הסכם תיווך</label>
              <input
                type="date"
                className="form-input"
                value={form.brokerageExpiresAt}
                onChange={(e) => update('brokerageExpiresAt', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">הערות</h3>
          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder="הערות נוספות על הלקוח..."
              rows={4}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg">
            <Save size={18} />
            שמור ליד
          </button>
          <Link to="/leads" className="btn btn-secondary btn-lg">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
