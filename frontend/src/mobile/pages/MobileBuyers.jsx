import { useState, useMemo } from 'react';
import { Search, ShoppingBag, Key, PhoneCall, MessageCircle, MapPin } from 'lucide-react';
import { leads, formatPrice } from '../../data/mockData';
import SwipeCard from '../components/SwipeCard';
import { haptics, openExternal } from '../../native';
import { telUrl, whatsappUrl } from '../../native/actions';

export default function MobileBuyers() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('buy');

  const list = useMemo(() => leads.filter((l) => {
    if (l.lookingFor !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.name.toLowerCase().includes(s) || l.city.toLowerCase().includes(s);
    }
    return true;
  }), [search, tab]);

  return (
    <div className="m-page">
      <div className="m-search">
        <Search size={18} />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="חפש לפי שם, עיר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="m-seg" style={{ marginTop: 12 }}>
        <button className={`m-seg-btn ${tab === 'buy' ? 'active' : ''}`} onClick={() => { haptics.select(); setTab('buy'); }}>
          <ShoppingBag size={13} style={{ marginLeft: 6, verticalAlign: '-2px' }} />
          קונים
        </button>
        <button className={`m-seg-btn ${tab === 'rent' ? 'active' : ''}`} onClick={() => { haptics.select(); setTab('rent'); }}>
          <Key size={13} style={{ marginLeft: 6, verticalAlign: '-2px' }} />
          שוכרים
        </button>
      </div>

      <div className="m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {list.map((lead) => (
          <SwipeCard key={lead.id}
            actions={[
              { key: 'call', label: 'התקשר', className: 'call', icon: <PhoneCall size={18} />, onClick: () => openExternal(telUrl(lead.phone)) },
              { key: 'wa', label: 'וואטסאפ', className: 'whatsapp', icon: <MessageCircle size={18} />, onClick: () => openExternal(whatsappUrl(lead.phone, `שלום ${lead.name.split(' ')[0]}`)) },
            ]}
          >
            <div className="m-lead-card" style={{ padding: 16 }}>
              <div className={`m-lead-avatar ${lead.status}`}>{lead.name.charAt(0)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="m-lead-name">{lead.name}</div>
                <div className="m-lead-meta">
                  <MapPin size={11} /> {lead.city}
                  {lead.rooms && <> · {lead.rooms} חד׳</>}
                </div>
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gold-light)', fontFamily: 'var(--font-display)' }}>
                  {formatPrice(lead.budget)}
                </div>
              </div>
              <span className={`m-pulse ${lead.status}`} />
            </div>
          </SwipeCard>
        ))}

        {list.length === 0 && (
          <div className="m-empty">
            <div className="m-empty-ring">
              {tab === 'buy' ? <ShoppingBag size={28} /> : <Key size={28} />}
            </div>
            <h3>אין {tab === 'buy' ? 'קונים' : 'שוכרים'} כרגע</h3>
          </div>
        )}
      </div>
    </div>
  );
}
