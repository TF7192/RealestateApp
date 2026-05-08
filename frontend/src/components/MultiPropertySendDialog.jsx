// Send multiple properties to a single interested customer in one WhatsApp
// message. The agent picks N properties from the list (defaulting to the
// lead's city) and the dialog assembles a Hebrew message with one block
// per property, each with the public share link, then opens WhatsApp.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, MessageCircle, X, Building2 } from 'lucide-react';
import api from '../lib/api';
import { waUrl } from '../lib/waLink';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';

const PRICE = (n) => {
  if (!Number.isFinite(n) || !n) return '';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `₪${Math.round(n / 1_000)}K`;
  return `₪${n.toLocaleString('he-IL')}`;
};

function publicLink(prop, agent) {
  if (!prop) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (prop.slug && agent?.slug) {
    return `${origin}/agents/${encodeURI(agent.slug)}/${encodeURI(prop.slug)}`;
  }
  return `${origin}/p/${prop.id}`;
}

function buildMessage({ lead, picks, agent }) {
  const greetName = (lead?.name || '').split(' ')[0] || '';
  const intro = greetName
    ? `שלום ${greetName}, מצרף כמה נכסים שעשויים להתאים לך:`
    : 'מצרף כמה נכסים שעשויים להתאים לך:';
  const lines = [intro, ''];
  picks.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.street}${p.city ? `, ${p.city}` : ''}`);
    const facts = [];
    if (p.rooms != null) facts.push(`${p.rooms} חד׳`);
    if (p.sqm) facts.push(`${p.sqm} מ״ר`);
    if (p.floor != null) facts.push(`קומה ${p.floor}`);
    if (facts.length) lines.push(`   ${facts.join(' · ')}`);
    if (p.marketingPrice) lines.push(`   ${PRICE(p.marketingPrice)}`);
    lines.push(`   ${publicLink(p, agent)}`);
    lines.push('');
  });
  if (agent?.displayName) {
    const trail = [agent.displayName, agent.agency, agent.phone].filter(Boolean).join(' | ');
    if (trail) lines.push(trail);
  }
  return lines.join('\n').trimEnd();
}

export default function MultiPropertySendDialog({ lead, onClose }) {
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [cityFilter, setCityFilter] = useState(lead?.city || '');
  // The signed-in user has agent fields (slug, displayName, agency, phone)
  // — the message footer + per-property URL builder use them. No extra
  // round-trip needed.
  const agent = user || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const propRes = await api.listProperties({ mine: '1' });
        if (cancelled) return;
        const list = (propRes?.items || []).filter((p) => p.status !== 'ARCHIVED');
        setItems(list);
      } catch (e) {
        if (!cancelled) toast.error(e?.message || 'טעינת הנכסים נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const cities = useMemo(() => {
    const set = new Set();
    items.forEach((p) => { if (p.city) set.add(p.city); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [items]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      if (cityFilter && p.city !== cityFilter) return false;
      if (!needle) return true;
      return [p.street, p.city, p.type, p.neighborhood]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [items, q, cityFilter]);

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearPicks = () => setPicked(new Set());

  const send = () => {
    if (picked.size === 0) {
      toast.info('בחר לפחות נכס אחד לשליחה');
      return;
    }
    const picks = items.filter((p) => picked.has(p.id));
    const text = buildMessage({ lead, picks, agent });
    const url = lead?.phone ? waUrl(lead.phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    toast.success(`נשלחו ${picks.length} נכסים בוואטסאפ`);
    onClose?.();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mpd-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(13,15,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        dir="rtl"
        style={{
          width: 'min(680px, 100%)', maxHeight: '90vh',
          background: '#fff', borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          fontFamily: 'Assistant, Heebo, -apple-system, sans-serif',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(30,26,20,0.08)',
        }}>
          <div>
            <h3 id="mpd-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e1a14' }}>
              שלח נכסים ל{lead?.name || 'לקוח'}
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(30,26,20,0.55)', marginTop: 2 }}>
              בחר נכסים מהרשימה — כולם יישלחו בהודעת WhatsApp אחת
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'transparent', border: 'none', padding: 6,
              borderRadius: 8, cursor: 'pointer', color: 'rgba(30,26,20,0.55)',
            }}
          ><X size={18} /></button>
        </header>

        <div style={{
          display: 'flex', gap: 8, padding: '12px 18px', flexWrap: 'wrap',
          borderBottom: '1px solid rgba(30,26,20,0.06)',
          background: 'rgba(180,139,76,0.04)',
        }}>
          <div style={{
            flex: 1, minWidth: 180, position: 'relative',
            display: 'inline-flex', alignItems: 'center',
          }}>
            <Search size={14} style={{ position: 'absolute', insetInlineStart: 10, color: 'rgba(30,26,20,0.4)' }} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חפש לפי רחוב, עיר, שכונה…"
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                borderRadius: 10, border: '1px solid rgba(30,26,20,0.12)',
                background: '#fff', fontSize: 13,
              }}
            />
          </div>
          {cities.length > 0 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 10,
                border: '1px solid rgba(30,26,20,0.12)', background: '#fff',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <option value="">כל הערים</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(30,26,20,0.55)', fontSize: 13 }}>
              טוען נכסים…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'rgba(30,26,20,0.55)', fontSize: 13 }}>
              <Building2 size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>אין נכסים תואמים לסינון</div>
            </div>
          )}
          {!loading && visible.map((p) => {
            const checked = picked.has(p.id);
            const thumb = p.imageThumbs?.[0] || p.images?.[0];
            return (
              <label
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  background: checked ? 'rgba(180,139,76,0.10)' : 'transparent',
                  border: `1px solid ${checked ? 'rgba(180,139,76,0.35)' : 'transparent'}`,
                  marginBottom: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(p.id)}
                  style={{ width: 18, height: 18, accentColor: '#b48b4c' }}
                />
                <div style={{
                  width: 56, height: 42, borderRadius: 8, overflow: 'hidden',
                  background: 'linear-gradient(160deg, #fbf7f0, #efe9df)',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {thumb
                    ? <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Building2 size={18} style={{ color: 'rgba(180,139,76,0.55)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: '#1e1a14',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.street}{p.city ? `, ${p.city}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(30,26,20,0.55)', marginTop: 2 }}>
                    {[
                      p.rooms != null ? `${p.rooms} חד׳` : null,
                      p.sqm ? `${p.sqm} מ״ר` : null,
                      p.floor != null ? `קומה ${p.floor}` : null,
                      p.marketingPrice ? PRICE(p.marketingPrice) : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <footer style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 18px', borderTop: '1px solid rgba(30,26,20,0.08)',
          background: '#fff',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: 'rgba(30,26,20,0.7)' }}>
            נבחרו <strong style={{ color: '#1e1a14' }}>{picked.size}</strong> נכסים
            {picked.size > 0 && (
              <button
                type="button"
                onClick={clearPicks}
                style={{
                  marginInlineStart: 8, background: 'transparent', border: 'none',
                  color: '#b48b4c', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >נקה</button>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">ביטול</button>
          <button
            type="button"
            onClick={send}
            disabled={picked.size === 0}
            className="btn btn-whatsapp btn-sm"
          >
            <MessageCircle size={14} />
            שלח בוואטסאפ
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
