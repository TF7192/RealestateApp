import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Save, Upload } from 'lucide-react';
import './Forms.css';

export default function NewProperty() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    assetClass: 'residential',
    type: 'דירה',
    category: 'sale',
    street: '',
    city: '',
    owner: '',
    ownerPhone: '',
    marketingPrice: '',
    sqm: '',
    rooms: '',
    floor: '',
    totalFloors: '',
    elevator: false,
    renovated: '',
    vacancyDate: '',
    parking: false,
    storage: false,
    balconySize: '',
    airDirections: '',
    ac: false,
    safeRoom: false,
    buildingAge: '',
    sector: 'כללי',
    closingPrice: '',
    notes: '',
    exclusiveStart: '',
    exclusiveEnd: '',
    sqmArnona: '',
  });

  const isCommercial = form.assetClass === 'commercial';

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleAssetClassChange = (cls) => {
    const typeDefault = cls === 'commercial' ? 'משרד' : 'דירה';
    setForm((prev) => ({ ...prev, assetClass: cls, type: typeDefault }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/properties');
  };

  return (
    <div className="form-page">
      <Link to="/properties" className="back-link animate-in">
        <ArrowRight size={16} />
        חזרה לנכסים
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>קליטת נכס חדש</h2>
          <p>הזן את פרטי הנכס לתחילת שיווק</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="intake-form animate-in animate-in-delay-1">
        {/* Asset class + type */}
        <div className="form-section">
          <h3 className="form-section-title">סיווג הנכס</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">סיווג</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${!isCommercial ? 'active' : ''}`}
                  onClick={() => handleAssetClassChange('residential')}
                >
                  מגורים
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${isCommercial ? 'active' : ''}`}
                  onClick={() => handleAssetClassChange('commercial')}
                >
                  מסחרי
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">סוג</label>
              <select
                className="form-select"
                value={form.type}
                onChange={(e) => update('type', e.target.value)}
              >
                {isCommercial ? (
                  <>
                    <option>משרד</option>
                    <option>חנות</option>
                    <option>מחסן</option>
                    <option>מבנה תעשייתי</option>
                    <option>קליניקה</option>
                    <option>אולם</option>
                  </>
                ) : (
                  <>
                    <option>דירה</option>
                    <option>פנטהאוז</option>
                    <option>קוטג׳</option>
                    <option>דו-משפחתי</option>
                    <option>מגרש</option>
                    <option>דירת גן</option>
                  </>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">מכירה / השכרה</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${form.category === 'sale' ? 'active' : ''}`}
                  onClick={() => update('category', 'sale')}
                >
                  מכירה
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${form.category === 'rent' ? 'active' : ''}`}
                  onClick={() => update('category', 'rent')}
                >
                  השכרה
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="form-section">
          <h3 className="form-section-title">מיקום</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">רחוב ומספר</label>
              <input
                className="form-input"
                placeholder="לדוגמה: הרצל 15"
                value={form.street}
                onChange={(e) => update('street', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">עיר</label>
              <input
                className="form-input"
                placeholder="לדוגמה: רמלה"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Owner */}
        <div className="form-section">
          <h3 className="form-section-title">בעל הנכס</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">שם בעל הנכס</label>
              <input className="form-input" placeholder="שם מלא" value={form.owner} onChange={(e) => update('owner', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">טלפון</label>
              <input className="form-input" placeholder="050-1234567" value={form.ownerPhone} onChange={(e) => update('ownerPhone', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">תחילת בלעדיות</label>
              <input type="date" className="form-input" value={form.exclusiveStart} onChange={(e) => update('exclusiveStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">סיום בלעדיות</label>
              <input type="date" className="form-input" value={form.exclusiveEnd} onChange={(e) => update('exclusiveEnd', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Property details — RESIDENTIAL */}
        {!isCommercial && (
          <div className="form-section">
            <h3 className="form-section-title">מאפייני דירה</h3>
            {/* Row 1: pricing + size — fields 4,5,9,10 from doc */}
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">מחיר שיווק</label>
                <input type="number" className="form-input" placeholder="₪" value={form.marketingPrice} onChange={(e) => update('marketingPrice', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מחיר סגירה</label>
                <input type="number" className="form-input" placeholder="₪" value={form.closingPrice} onChange={(e) => update('closingPrice', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מספר חדרים</label>
                <input type="number" step="0.5" className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">גודל דירה (מ״ר)</label>
                <input type="number" className="form-input" value={form.sqm} onChange={(e) => update('sqm', e.target.value)} />
              </div>
            </div>
            {/* Row 2: floor, building, balcony — fields 8,11,19 from doc */}
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">קומה</label>
                <input type="number" className="form-input" value={form.floor} onChange={(e) => update('floor', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מתוך</label>
                <input type="number" className="form-input" value={form.totalFloors} onChange={(e) => update('totalFloors', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">גודל מרפסת (מ״ר)</label>
                <input type="number" className="form-input" value={form.balconySize} onChange={(e) => update('balconySize', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">בניין בן (שנים)</label>
                <input type="number" className="form-input" value={form.buildingAge} onChange={(e) => update('buildingAge', e.target.value)} />
              </div>
            </div>
            {/* Row 3: condition, vacancy, sector, airDirections — fields 6,7,14,16 from doc */}
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">עברה שיפוץ?</label>
                <select className="form-select" value={form.renovated} onChange={(e) => update('renovated', e.target.value)}>
                  <option value="">בחר...</option>
                  <option>חדש מקבלן</option>
                  <option>משופצת</option>
                  <option>משופצת חלקית</option>
                  <option>שמורה</option>
                  <option>דרוש שיפוץ</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">תאריך פינוי</label>
                <input className="form-input" placeholder="מיידי / 3 חודשים" value={form.vacancyDate} onChange={(e) => update('vacancyDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מגזר</label>
                <select className="form-select" value={form.sector} onChange={(e) => update('sector', e.target.value)}>
                  <option>כללי</option>
                  <option>דתי</option>
                  <option>חרדי</option>
                  <option>ערבי</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">כיווני אוויר</label>
                <input className="form-input" placeholder="דרום-מערב" value={form.airDirections} onChange={(e) => update('airDirections', e.target.value)} />
              </div>
            </div>
            <div className="checkbox-grid">
              {[
                { key: 'elevator', label: 'מעלית' },
                { key: 'parking', label: 'חניה' },
                { key: 'storage', label: 'מחסן' },
                { key: 'ac', label: 'מזגנים' },
                { key: 'safeRoom', label: 'ממ״ד' },
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-item">
                  <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                  <span className="checkbox-custom" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Property details — COMMERCIAL */}
        {/* Same fields from the intake doc, minus rooms/balcony/safeRoom, plus מ"ר ארנונה */}
        {isCommercial && (
          <div className="form-section">
            <h3 className="form-section-title">מאפייני נכס מסחרי</h3>
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">מחיר שיווק</label>
                <input type="number" className="form-input" placeholder="₪" value={form.marketingPrice} onChange={(e) => update('marketingPrice', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">גודל נכס (מ״ר)</label>
                <input type="number" className="form-input" value={form.sqm} onChange={(e) => update('sqm', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מ״ר ארנונה</label>
                <input type="number" className="form-input" value={form.sqmArnona} onChange={(e) => update('sqmArnona', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מחיר סגירה</label>
                <input type="number" className="form-input" placeholder="₪" value={form.closingPrice} onChange={(e) => update('closingPrice', e.target.value)} />
              </div>
            </div>
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">קומה</label>
                <input type="number" className="form-input" value={form.floor} onChange={(e) => update('floor', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מתוך קומות</label>
                <input type="number" className="form-input" value={form.totalFloors} onChange={(e) => update('totalFloors', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">בניין בן (שנים)</label>
                <input type="number" className="form-input" value={form.buildingAge} onChange={(e) => update('buildingAge', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">כיווני אוויר</label>
                <input className="form-input" placeholder="מערב" value={form.airDirections} onChange={(e) => update('airDirections', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">עבר שיפוץ?</label>
                <select className="form-select" value={form.renovated} onChange={(e) => update('renovated', e.target.value)}>
                  <option value="">בחר...</option>
                  <option>חדש</option>
                  <option>משופץ</option>
                  <option>שמור</option>
                  <option>סביר</option>
                  <option>דרוש שיפוץ</option>
                  <option>מעטפת בלבד</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">תאריך פינוי</label>
                <input className="form-input" placeholder="מיידי / תאריך" value={form.vacancyDate} onChange={(e) => update('vacancyDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מגזר</label>
                <select className="form-select" value={form.sector} onChange={(e) => update('sector', e.target.value)}>
                  <option>כללי</option>
                  <option>דתי</option>
                  <option>חרדי</option>
                  <option>ערבי</option>
                </select>
              </div>
            </div>
            <div className="checkbox-grid">
              {[
                { key: 'elevator', label: 'מעלית' },
                { key: 'parking', label: 'חניה' },
                { key: 'storage', label: 'מחסן' },
                { key: 'ac', label: 'מזגנים' },
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-item">
                  <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                  <span className="checkbox-custom" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="form-section">
          <h3 className="form-section-title">הערות</h3>
          <div className="form-group">
            <textarea className="form-textarea" placeholder="הערות נוספות על הנכס..." rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>
        </div>

        {/* Images */}
        <div className="form-section">
          <h3 className="form-section-title">תמונות</h3>
          <div className="upload-area">
            <Upload size={32} />
            <p>גרור תמונות לכאן או לחץ להעלאה</p>
            <span>JPG, PNG עד 10MB</span>
          </div>
        </div>

        {/* Submit */}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg">
            <Save size={18} />
            שמור נכס
          </button>
          <Link to="/properties" className="btn btn-secondary btn-lg">
            ביטול
          </Link>
        </div>
      </form>
    </div>
  );
}
