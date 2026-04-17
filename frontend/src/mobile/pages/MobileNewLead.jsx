import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, User, Phone, MapPin, DollarSign, Home, Check, Flame, Thermometer, Snowflake } from 'lucide-react';
import { cityNames } from '../../data/mockData';
import { haptics } from '../../native';
import { useToast } from '../components/Toast';

export default function MobileNewLead() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', phone: '', lookingFor: 'buy', city: '', rooms: '', budget: '',
    preApproval: false, status: 'warm', notes: '',
  });
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      haptics.err();
      toast({ message: 'חובה למלא שם וטלפון', tone: 'error' });
      return;
    }
    haptics.success();
    toast({ message: 'הליד נוסף בהצלחה' });
    navigate('/leads');
  };

  return (
    <div className="m-form-page m-stagger">
      <header className="m-form-top">
        <button className="m-icon-btn" onClick={() => { haptics.tap(); navigate(-1); }}>
          <ArrowRight size={18} />
        </button>
        <div className="m-eyebrow" style={{ marginRight: 'auto', marginLeft: 'auto' }}>ליד חדש</div>
      </header>

      <h1 className="m-page-title" style={{ padding: '0 var(--m-page-pad)', marginTop: 18 }}>שיחה שהגיעה.</h1>
      <p className="m-page-sub" style={{ padding: '0 var(--m-page-pad)' }}>קלוט את הפרטים המהירים — הפרטים המלאים אפשר להוסיף אחר כך.</p>

      <form onSubmit={submit} className="m-form-body">
        <div className="m-field">
          <label className="m-label">שם</label>
          <div className="m-input-wrap">
            <User size={16} />
            <input className="m-input" placeholder="שם מלא" value={form.name} onChange={(e) => u('name', e.target.value)} required autoFocus />
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">טלפון</label>
          <div className="m-input-wrap">
            <Phone size={16} />
            <input type="tel" className="m-input" placeholder="050-1234567" value={form.phone} onChange={(e) => u('phone', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} required />
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">מחפש</label>
          <div className="m-seg">
            <button type="button" className={`m-seg-btn ${form.lookingFor === 'buy' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('lookingFor', 'buy'); }}>לקנות</button>
            <button type="button" className={`m-seg-btn ${form.lookingFor === 'rent' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('lookingFor', 'rent'); }}>לשכור</button>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">עיר מועדפת</label>
          <div className="m-chip-row" style={{ padding: 0, margin: 0, flexWrap: 'wrap' }}>
            {cityNames.map((c) => (
              <button key={c} type="button"
                className={`m-chip ${form.city === c ? 'active' : ''}`}
                onClick={() => { haptics.select(); u('city', form.city === c ? '' : c); }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="m-field">
            <label className="m-label">חדרים</label>
            <div className="m-input-wrap">
              <Home size={16} />
              <input className="m-input" placeholder="4" value={form.rooms} onChange={(e) => u('rooms', e.target.value)} />
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">תקציב</label>
            <div className="m-input-wrap">
              <DollarSign size={16} />
              <input type="number" className="m-input" placeholder="₪" value={form.budget} onChange={(e) => u('budget', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="m-field">
          <label className="m-label">דחיפות</label>
          <div className="m-seg">
            <button type="button" className={`m-seg-btn ${form.status === 'hot' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('status', 'hot'); }}>
              <Flame size={14} style={{ marginLeft: 4, verticalAlign: '-2px' }} /> חם
            </button>
            <button type="button" className={`m-seg-btn ${form.status === 'warm' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('status', 'warm'); }}>
              <Thermometer size={14} style={{ marginLeft: 4, verticalAlign: '-2px' }} /> חמים
            </button>
            <button type="button" className={`m-seg-btn ${form.status === 'cold' ? 'active' : ''}`}
              onClick={() => { haptics.select(); u('status', 'cold'); }}>
              <Snowflake size={14} style={{ marginLeft: 4, verticalAlign: '-2px' }} /> קר
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`m-toggle-row ${form.preApproval ? 'on' : ''}`}
          onClick={() => { haptics.select(); u('preApproval', !form.preApproval); }}
        >
          <span>אישור משכנתא עקרוני</span>
          <span className="m-toggle-dot" />
        </button>

        <div className="m-field">
          <label className="m-label">הערות</label>
          <textarea className="m-textarea" placeholder="למשל: מחפש קרוב לבית ספר, גמיש במחיר..."
            value={form.notes} onChange={(e) => u('notes', e.target.value)} />
        </div>
      </form>

      <div className="m-action-bar">
        <button className="m-action-bar-btn" type="button" onClick={() => { haptics.tap(); navigate(-1); }}>ביטול</button>
        <button className="m-action-bar-btn primary" onClick={submit}>
          <Check size={16} /> שמור
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
        .m-toggle-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 16px; border-radius: var(--m-radius-sm);
          background: var(--bg-input); border: 1px solid var(--m-hairline);
          color: var(--text-primary); font-family: var(--font-body); font-size: 14px;
          cursor: pointer;
        }
        .m-toggle-dot {
          width: 44px; height: 26px; border-radius: 999px;
          background: var(--bg-elevated); border: 1px solid var(--m-hairline);
          position: relative; transition: all 0.2s;
        }
        .m-toggle-dot::after {
          content: ''; position: absolute; top: 3px; right: 3px;
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--text-muted); transition: all 0.25s var(--m-ease-spring);
        }
        .m-toggle-row.on { border-color: var(--m-ring); color: var(--gold-light); }
        .m-toggle-row.on .m-toggle-dot { background: var(--gold-glow); border-color: var(--m-ring); }
        .m-toggle-row.on .m-toggle-dot::after {
          right: calc(100% - 21px); background: var(--gold);
        }
      `}</style>
    </div>
  );
}
