import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Bed,
  Maximize,
  Building2,
  Phone,
  MessageCircle,
  SlidersHorizontal,
  X,
  Home,
  Briefcase,
} from 'lucide-react';
import api from '../lib/api';
import './AgentPortal.css';

function formatPrice(price) {
  if (!price) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

export default function AgentPortal() {
  // Supports BOTH route shapes:
  //   /agents/:agentSlug  (SEO-friendly)
  //   /a/:agentId         (legacy short)
  const params = useParams();
  const agentKey = params.agentSlug || params.agentId;
  const isSlugRoute = !!params.agentSlug;
  const [agent, setAgent] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all'); // all|SALE|RENT
  const [assetClass, setAssetClass] = useState('all'); // all|RESIDENTIAL|COMMERCIAL
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState({
    city: '',
    minPrice: '',
    maxPrice: '',
    minRooms: '',
    maxRooms: '',
  });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (isSlugRoute) {
          // New SEO endpoint returns agent + properties in one shot
          const r = await api.publicAgent(agentKey);
          if (!cancelled) {
            setAgent(r.agent);
            setProperties(r.properties || []);
          }
        } else {
          const [a, p] = await Promise.all([
            api.getAgentPublic(agentKey),
            api.listAgentProperties(agentKey, { status: 'ACTIVE' }),
          ]);
          if (!cancelled) {
            setAgent(a.agent);
            setProperties(p.items || []);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'שגיאה בטעינה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [agentKey, isSlugRoute]);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (assetClass !== 'all' && p.assetClass !== assetClass) return false;
      if (adv.city && !p.city.includes(adv.city)) return false;
      if (adv.minPrice && p.marketingPrice < Number(adv.minPrice)) return false;
      if (adv.maxPrice && p.marketingPrice > Number(adv.maxPrice)) return false;
      if (adv.minRooms && p.rooms != null && p.rooms < Number(adv.minRooms)) return false;
      if (adv.maxRooms && p.rooms != null && p.rooms > Number(adv.maxRooms)) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          p.street?.toLowerCase().includes(s) ||
          p.city?.toLowerCase().includes(s) ||
          p.type?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [properties, category, assetClass, search, adv]);

  if (loading) {
    return (
      <div className="ap-loading">
        <div className="ap-loading-spinner" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="ap-empty">
        <Building2 size={48} />
        <h3>לא נמצא סוכן</h3>
        <p>{error || 'ייתכן שהקישור אינו תקין'}</p>
      </div>
    );
  }

  const phoneDigits = (agent.phone || '').replace(/[^0-9]/g, '');
  const waLink = phoneDigits ? `https://wa.me/${phoneDigits}` : null;

  return (
    <div className="agent-portal">
      {/* Hero header */}
      <header className="ap-hero">
        <div className="ap-hero-inner">
          <div className="ap-agent-card">
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.displayName} className="ap-agent-avatar" />
            ) : (
              <div className="ap-agent-avatar placeholder">{agent.displayName?.charAt(0)}</div>
            )}
            <div className="ap-agent-info">
              <span className="ap-agent-label">הקטלוג של</span>
              <h1 className="ap-agent-name">{agent.displayName}</h1>
              <span className="ap-agent-meta">
                {[agent.title, agent.agency].filter(Boolean).join(' · ')}
              </span>
              {agent.bio && <p className="ap-agent-bio">{agent.bio}</p>}
            </div>
          </div>
          {agent.phone && (
            <div className="ap-contact-row">
              <a href={`tel:${agent.phone}`} className="ap-contact-chip">
                <Phone size={14} />
                {agent.phone}
              </a>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer" className="ap-contact-chip whatsapp">
                  <MessageCircle size={14} />
                  וואטסאפ
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <section className="ap-filters">
        <div className="ap-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="חיפוש לפי רחוב, עיר, סוג..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="ap-tabs">
          <button
            className={`ap-tab ${assetClass === 'all' ? 'active' : ''}`}
            onClick={() => setAssetClass('all')}
          >
            הכל
          </button>
          <button
            className={`ap-tab ${assetClass === 'RESIDENTIAL' ? 'active' : ''}`}
            onClick={() => setAssetClass('RESIDENTIAL')}
          >
            <Home size={14} /> מגורים
          </button>
          <button
            className={`ap-tab ${assetClass === 'COMMERCIAL' ? 'active' : ''}`}
            onClick={() => setAssetClass('COMMERCIAL')}
          >
            <Briefcase size={14} /> מסחרי
          </button>
        </div>

        <div className="ap-tabs">
          <button
            className={`ap-tab ${category === 'all' ? 'active' : ''}`}
            onClick={() => setCategory('all')}
          >
            הכל
          </button>
          <button
            className={`ap-tab ${category === 'SALE' ? 'active' : ''}`}
            onClick={() => setCategory('SALE')}
          >
            מכירה
          </button>
          <button
            className={`ap-tab ${category === 'RENT' ? 'active' : ''}`}
            onClick={() => setCategory('RENT')}
          >
            השכרה
          </button>
        </div>

        <button
          className={`ap-adv-btn ${showAdvanced ? 'active' : ''}`}
          onClick={() => setShowAdvanced((s) => !s)}
        >
          <SlidersHorizontal size={14} />
          סינון מתקדם
        </button>
      </section>

      {showAdvanced && (
        <section className="ap-adv-panel">
          <div className="ap-adv-grid">
            <div>
              <label>עיר</label>
              <input
                type="text"
                value={adv.city}
                onChange={(e) => setAdv({ ...adv, city: e.target.value })}
                placeholder="לדוגמה: רמלה"
              />
            </div>
            <div>
              <label>מחיר מ-</label>
              <input
                type="number"
                value={adv.minPrice}
                onChange={(e) => setAdv({ ...adv, minPrice: e.target.value })}
                placeholder="₪"
              />
            </div>
            <div>
              <label>מחיר עד</label>
              <input
                type="number"
                value={adv.maxPrice}
                onChange={(e) => setAdv({ ...adv, maxPrice: e.target.value })}
                placeholder="₪"
              />
            </div>
            <div>
              <label>חדרים מ-</label>
              <input
                type="number"
                value={adv.minRooms}
                onChange={(e) => setAdv({ ...adv, minRooms: e.target.value })}
              />
            </div>
            <div>
              <label>חדרים עד</label>
              <input
                type="number"
                value={adv.maxRooms}
                onChange={(e) => setAdv({ ...adv, maxRooms: e.target.value })}
              />
            </div>
          </div>
          <button
            className="ap-adv-clear"
            onClick={() => setAdv({ city: '', minPrice: '', maxPrice: '', minRooms: '', maxRooms: '' })}
          >
            <X size={13} /> נקה סינון
          </button>
        </section>
      )}

      {/* Results */}
      <section className="ap-results">
        <div className="ap-results-count">
          {filtered.length} נכסים {search || adv.city ? 'תואמים לסינון' : 'במאגר'}
        </div>

        <div className="ap-grid">
          {filtered.map((p) => {
            const propPath =
              p.slug && agent?.slug
                ? `/agents/${encodeURI(agent.slug)}/${encodeURI(p.slug)}`
                : `/p/${p.id}`;
            const interest = () => {
              const text = [
                `שלום ${agent.displayName},`,
                `אני מעוניין/ת בנכס ב${p.street}, ${p.city}.`,
                `(מחיר: ${formatPrice(p.marketingPrice)})`,
                'אשמח לפרטים נוספים / תיאום ביקור.',
                '',
                `${window.location.origin}${propPath}`,
              ].join('\n');
              const digits = (agent.phone || '').replace(/[^0-9]/g, '');
              const url = digits
                ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
                : `https://wa.me/?text=${encodeURIComponent(text)}`;
              window.open(url, '_blank');
            };
            return (
              <div key={p.id} className="ap-card">
                <Link to={propPath} className="ap-card-inner">
                  <div className="ap-card-image">
                    <img src={p.images?.[0] || 'https://via.placeholder.com/800x450'} alt={p.street} loading="lazy" />
                    <div className="ap-card-badges">
                      <span className={`ap-badge ${p.assetClass === 'COMMERCIAL' ? 'commercial' : 'residential'}`}>
                        {p.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
                      </span>
                      <span className={`ap-badge ${p.category === 'SALE' ? 'sale' : 'rent'}`}>
                        {p.category === 'SALE' ? 'מכירה' : 'השכרה'}
                      </span>
                    </div>
                    <div className="ap-card-price">{formatPrice(p.marketingPrice)}</div>
                  </div>
                  <div className="ap-card-body">
                    <div className="ap-card-address">
                      <MapPin size={13} />
                      {p.street}, {p.city}
                    </div>
                    <div className="ap-card-specs">
                      {p.rooms != null && <span><Bed size={13} />{p.rooms} חד׳</span>}
                      <span><Maximize size={13} />{p.sqm} מ״ר</span>
                      <span><Building2 size={13} />{p.type}</span>
                    </div>
                  </div>
                </Link>
                <button
                  className="ap-interested-btn"
                  onClick={interest}
                  title="שלח הודעה לסוכן על הנכס הזה"
                >
                  <MessageCircle size={14} />
                  אני מעוניין/ת
                </button>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="ap-empty small">
            <Search size={32} />
            <p>לא נמצאו נכסים בסינון הנוכחי</p>
          </div>
        )}
      </section>

      <footer className="ap-footer">
        <span>מוצג על ידי Estia · מערכת לסוכני נדל״ן</span>
      </footer>
    </div>
  );
}
