import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, User, Phone, MapPin, DollarSign, Check, Building2, Camera } from 'lucide-react';
import { cityNames } from '../../data/mockData';
import { haptics } from '../../native';
import { useToast } from '../components/Toast';

export default function MobileNewProperty() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    assetClass: 'residential',
    category: 'sale',
    type: 'דירה',
    street: '',
    city: '',
    owner: '',
    ownerPhone: '',
    marketingPrice: '',
    sqm: '',
    rooms: '',
    floor: '',
    totalFloors: '',
    notes: '',
    exclusiveStart: new Date().toISOString().slice(0, 10),
    exclusiveEnd: '',
  });
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.street || !form.city || !form.owner || !form.marketingPrice) {
      haptics.err();
      toast({ message: 'חובה למלא: כתובת, בעלים, מחיר', tone: 'error' });
      return;
    }
    haptics.success();
    toast({ message: 'הנכס נוסף לתיק' });
    navigate('/properties');
  };

  return (
    <div className="m-form-page m-stagger">
      <header className="m-form-top">
        <button className="m-icon-btn" onClick={() => { haptics.tap(); navigate(-1); }}>
          <ArrowRight size={18} />
        </button>
        <div className="m-eyebrow" style={{ marginRight: 'auto', marginLeft: 'auto' }}>נכס חדש</div>
      </header>

      <h1 className="m-page-title" style={{ padding: '0 var(--m-page-pad)', marginTop: 18 }}>קליטת נכס.</h1>
      <p className="m-page-sub" style={{ padding: '0 var(--m-page-pad)' }}>הפרטים הבסיסיים עכשיו. צילום והכל השאר — מהמסך של הנכס אחר כך.</p>

      <form onSubmit={submit} className="m-form-body">
        <div className="m-field">
          <label className="m-label">סיווג</label>
          <div className="m-seg">
            <button type="button" className={`m-seg-btn ${form.assetClass === 'residential' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('assetClass', 'residential'); }}>מגורים</button>
            <button type="button" className={`m-seg-btn ${form.assetClass === 'commercial' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('assetClass', 'commercial'); }}>מסחרי</button>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">עסקה</label>
          <div className="m-seg">
            <button type="button" className={`m-seg-btn ${form.category === 'sale' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('category', 'sale'); }}>מכירה</button>
            <button type="button" className={`m-seg-btn ${form.category === 'rent' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('category', 'rent'); }}>השכרה</button>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">סוג נכס</label>
          <div className="m-chip-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            {(form.assetClass === 'residential'
              ? ['דירה', 'פנטהאוז', 'קוטג׳', 'דירת גן', 'דופלקס']
              : ['משרד', 'חנות', 'מחסן', 'תעשייה', 'מגרש']
            ).map((t) => (
              <button key={t} type="button"
                className={`m-chip ${form.type === t ? 'active' : ''}`}
                onClick={() => { haptics.select(); u('type', t); }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">כתובת</label>
          <div className="m-input-wrap">
            <MapPin size={16} />
            <input className="m-input" placeholder="לדוגמה: הרצל 12" value={form.street} onChange={(e) => u('street', e.target.value)} required />
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">עיר</label>
          <div className="m-chip-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            {cityNames.map((c) => (
              <button key={c} type="button"
                className={`m-chip ${form.city === c ? 'active' : ''}`}
                onClick={() => { haptics.select(); u('city', c); }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="m-field">
            <label className="m-label">שם בעלים</label>
            <div className="m-input-wrap">
              <User size={16} />
              <input className="m-input" value={form.owner} onChange={(e) => u('owner', e.target.value)} autoComplete="name" enterKeyHint="next" required />
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">טלפון בעלים</label>
            <div className="m-input-wrap">
              <Phone size={16} />
              <input type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" className="m-input" value={form.ownerPhone} onChange={(e) => u('ownerPhone', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
            </div>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">מחיר שיווק</label>
          <div className="m-input-wrap">
            <DollarSign size={16} />
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="m-input" placeholder="₪" value={form.marketingPrice} onChange={(e) => u('marketingPrice', e.target.value)} enterKeyHint="next" required />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="m-field">
            <label className="m-label">שטח (מ״ר)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" className="m-input" value={form.sqm} onChange={(e) => u('sqm', e.target.value)} enterKeyHint="next" />
          </div>
          {form.assetClass === 'residential' && (
            <div className="m-field">
              <label className="m-label">חדרים</label>
              <input type="text" inputMode="decimal" pattern="[0-9.]*" className="m-input" value={form.rooms} onChange={(e) => u('rooms', e.target.value)} enterKeyHint="next" />
            </div>
          )}
          <div className="m-field">
            <label className="m-label">קומה</label>
            <input type="text" inputMode="numeric" pattern="-?[0-9]*" className="m-input" value={form.floor} onChange={(e) => u('floor', e.target.value)} enterKeyHint="next" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="m-field">
            <label className="m-label">תחילת בלעדיות</label>
            <input type="date" className="m-input" value={form.exclusiveStart} onChange={(e) => u('exclusiveStart', e.target.value)} />
          </div>
          <div className="m-field">
            <label className="m-label">סיום בלעדיות</label>
            <input type="date" className="m-input" value={form.exclusiveEnd} onChange={(e) => u('exclusiveEnd', e.target.value)} />
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">הערות</label>
          <textarea className="m-textarea" placeholder="כיווני אוויר, נוף, שכונה..." dir="auto" enterKeyHint="enter"
            value={form.notes} onChange={(e) => u('notes', e.target.value)} />
        </div>

        <button type="button" className="m-photo-add" onClick={() => { haptics.tap(); toast({ message: 'העלאת תמונות תתווסף בהמשך' }); }}>
          <Camera size={18} />
          <div>
            <div>הוסף תמונות</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>מגלריה או מצלמה</div>
          </div>
        </button>
      </form>

      <div className="m-action-bar">
        <button className="m-action-bar-btn" type="button" onClick={() => { haptics.tap(); navigate(-1); }}>ביטול</button>
        <button className="m-action-bar-btn primary" onClick={submit}>
          <Check size={16} /> שמור נכס
        </button>
      </div>

      <style>{`
        .m-form-page { padding-bottom: 120px; }
        .m-form-top {
          display: flex; align-items: center; gap: 12px;
          padding: 8px var(--m-page-pad) 4px;
        }
        .m-form-body {
          display: flex; flex-direction: column; gap: 18px;
          padding: 22px var(--m-page-pad);
        }
        .m-input-wrap {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-input); border: 1px solid var(--m-hairline);
          border-radius: var(--m-radius-sm); padding: 0 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .m-input-wrap:focus-within {
          border-color: var(--gold);
          box-shadow: 0 0 0 4px var(--gold-glow);
        }
        .m-input-wrap svg { color: var(--text-muted); flex-shrink: 0; }
        .m-input-wrap .m-input { border: none; background: transparent; padding: 14px 0; flex: 1; }
        .m-photo-add {
          display: flex; align-items: center; gap: 14px;
          padding: 18px; border-radius: var(--m-radius-md);
          background: transparent; border: 1px dashed var(--m-hairline);
          color: var(--text-primary); font-family: var(--font-body);
          font-size: 14px; font-weight: 500; cursor: pointer; text-align: right;
        }
        .m-photo-add svg {
          width: 36px; height: 36px; padding: 8px; flex-shrink: 0;
          border-radius: 10px; background: var(--gold-glow); color: var(--gold);
        }
      `}</style>
    </div>
  );
}
