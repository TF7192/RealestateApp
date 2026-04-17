import { useState, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, UserPlus, Flame, Thermometer, Snowflake,
  PhoneCall, MessageCircle, MessageSquareText, Calendar, MapPin, DollarSign, FileCheck,
} from 'lucide-react';
import { leads, formatPrice } from '../../data/mockData';
import SwipeCard from '../components/SwipeCard';
import { haptics, openExternal } from '../../native';
import { telUrl, whatsappUrl, smsUrl } from '../../native/actions';

const STATUS = {
  hot:  { label: 'חמים', icon: Flame,      color: 'var(--danger)',  bg: 'rgba(248,113,113,0.12)' },
  warm: { label: 'חמימים', icon: Thermometer, color: 'var(--warning)', bg: 'rgba(251,191,36,0.12)' },
  cold: { label: 'קרים',  icon: Snowflake,  color: 'var(--info)',    bg: 'rgba(96,165,250,0.12)' },
};

export default function MobileLeads() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(params.get('filter') || 'all');

  const grouped = useMemo(() => {
    const filtered = leads.filter((l) => {
      if (filter !== 'all' && l.status !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        return l.name.toLowerCase().includes(s)
          || l.city.toLowerCase().includes(s)
          || l.phone.includes(s);
      }
      return true;
    });
    return {
      hot:  filtered.filter((l) => l.status === 'hot'),
      warm: filtered.filter((l) => l.status === 'warm'),
      cold: filtered.filter((l) => l.status === 'cold'),
    };
  }, [search, filter]);

  return (
    <div className="m-page">
      <div className="m-search">
        <Search size={18} />
        <input
          type="search"
          placeholder="שם, טלפון, עיר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="m-chip-row" style={{ marginTop: 12 }}>
        <button className={`m-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => { haptics.select(); setFilter('all'); }}>
          הכל · {leads.length}
        </button>
        {['hot', 'warm', 'cold'].map((key) => {
          const Icon = STATUS[key].icon;
          const count = leads.filter((l) => l.status === key).length;
          return (
            <button key={key}
              className={`m-chip ${filter === key ? 'active' : ''}`}
              onClick={() => { haptics.select(); setFilter(key); }}>
              <Icon size={12} />
              {STATUS[key].label} · {count}
            </button>
          );
        })}
      </div>

      <Link to="/customers/new" className="m-new-lead-btn" onClick={() => haptics.press()}>
        <UserPlus size={16} />
        ליד חדש
      </Link>

      {['hot', 'warm', 'cold'].map((key) => {
        const items = grouped[key];
        if (!items.length) return null;
        const Icon = STATUS[key].icon;
        return (
          <section key={key} style={{ marginTop: 22 }}>
            <div className="m-lead-section-header" style={{ color: STATUS[key].color, background: STATUS[key].bg }}>
              <Icon size={14} />
              <span>{STATUS[key].label}</span>
              <span style={{ opacity: 0.7 }}>· {items.length}</span>
            </div>
            <div className="m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onOpen={() => { haptics.tap(); /* TODO: detail */ }} />
              ))}
            </div>
          </section>
        );
      })}

      {Object.values(grouped).every((g) => !g.length) && (
        <div className="m-empty">
          <div className="m-empty-ring"><UserPlus size={28} /></div>
          <h3>אין לידים תואמים</h3>
          <p>נסה לשנות את הסינון או להוסיף ליד חדש</p>
          <Link to="/customers/new" className="m-chip active" style={{ marginTop: 14 }}>
            <UserPlus size={13} />
            ליד חדש
          </Link>
        </div>
      )}

      <style>{`
        .m-lead-section-header {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: var(--m-radius-pill);
          font-size: 12px; font-weight: 600; letter-spacing: 0.2px;
          margin-bottom: 10px;
        }
        .m-new-lead-btn {
          display: inline-flex; align-items: center; gap: 8px;
          margin-top: 16px; padding: 10px 18px;
          border-radius: var(--m-radius-pill);
          background: var(--gold-glow); color: var(--gold-light);
          border: 1px dashed var(--m-ring); text-decoration: none;
          font-family: var(--font-body); font-size: 13px; font-weight: 500;
          transition: all 0.2s;
        }
        .m-new-lead-btn:active { transform: scale(0.98); background: rgba(201, 169, 110, 0.2); }
      `}</style>
    </div>
  );
}

function LeadRow({ lead, onOpen }) {
  const call = () => openExternal(telUrl(lead.phone));
  const wa = () => openExternal(whatsappUrl(lead.phone, `שלום ${lead.name.split(' ')[0]},`));
  const sms = () => openExternal(smsUrl(lead.phone, 'שלום, מדבר יוסי מרימקס פרמיום — ראיתי שפנית אלינו.'));

  return (
    <SwipeCard
      onTap={onOpen}
      actions={[
        { key: 'call', label: 'התקשר', className: 'call', icon: <PhoneCall size={18} />, onClick: call },
        { key: 'wa', label: 'וואטסאפ', className: 'whatsapp', icon: <MessageCircle size={18} />, onClick: wa },
        { key: 'sms', label: 'SMS', className: 'sms', icon: <MessageSquareText size={18} />, onClick: sms },
      ]}
    >
      <div className="m-lead-card" style={{ padding: 16 }}>
        <div className={`m-lead-avatar ${lead.status}`}>
          {lead.name.charAt(0)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="m-lead-name">{lead.name}</div>
          <div className="m-lead-meta">
            <span><MapPin size={11} style={{ verticalAlign: '-1px' }} /> {lead.city}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {lead.rooms && `${lead.rooms} חד׳`}
              {lead.rooms && ' · '}
              {lead.lookingFor === 'rent' ? 'שכירות' : 'קניה'}
            </span>
          </div>
          <div className="m-lead-budget">
            <DollarSign size={11} />
            <span>{formatPrice(lead.budget)}</span>
            {lead.preApproval && (
              <span className="m-lead-chip good">
                <FileCheck size={10} /> אישור עקרוני
              </span>
            )}
          </div>
        </div>
        <span className={`m-pulse ${lead.status}`} />
      </div>

      <style>{`
        .m-lead-budget {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; color: var(--gold-light); margin-top: 6px;
          font-family: var(--font-display);
        }
        .m-lead-chip {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 2px 8px; border-radius: var(--m-radius-pill);
          font-size: 10px; font-family: var(--font-body); margin-right: 6px;
          background: var(--success-bg); color: var(--success);
        }
      `}</style>
    </SwipeCard>
  );
}
