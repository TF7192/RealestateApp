import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Save } from 'lucide-react';
import './Forms.css';

export default function NewLead() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    interestType: 'פרטי',
    city: '',
    street: '',
    rooms: '',
    priceMin: '',
    priceMax: '',
    preApproval: false,
    source: '',
    notes: '',
  });

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/leads');
  };

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
              <label className="form-label">מקור הלי��</label>
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
        </div>

        <div className="form-section">
          <h3 className="form-section-title">העדפות חיפוש</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">עיר מבוקשת</label>
              <input
                className="form-input"
                placeholder="לדוגמה: רמלה"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">רחוב (אופציונלי)</label>
              <input
                className="form-input"
                placeholder="רחוב מועדף"
                value={form.street}
                onChange={(e) => update('street', e.target.value)}
              />
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
