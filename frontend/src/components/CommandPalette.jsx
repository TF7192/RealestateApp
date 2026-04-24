import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Building2,
  Users,
  Handshake,
  LayoutDashboard,
  Plus,
  UserPlus,
  User,
  UserCircle,
} from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import './CommandPalette.css';

// Static list — always visible at the top of the palette, even offline.
// Dynamic server-backed entries (H1 globalSearch) are appended below.
const STATIC_ENTRIES = [
  { kind: 'nav', icon: LayoutDashboard, title: 'לוח בקרה',   to: '/' },
  { kind: 'nav', icon: Building2,        title: 'נכסים',      to: '/properties' },
  { kind: 'nav', icon: Users,            title: 'לקוחות',     to: '/customers' },
  { kind: 'nav', icon: Handshake,        title: 'עסקאות',     to: '/deals' },
  { kind: 'nav', icon: User,             title: 'הפרופיל שלי', to: '/profile' },
  { kind: 'action', icon: Plus,          title: 'קליטת נכס חדש', to: '/properties/new' },
  { kind: 'action', icon: UserPlus,      title: 'ליד חדש',      to: '/customers/new' },
];

// Format helpers for the server result shapes. The backend (H1) returns
// partial objects; be tolerant about which field is populated.
function propertyLabel(p) {
  const street = [p.street, p.number].filter(Boolean).join(' ').trim();
  const parts = [street || p.address || '', p.city || ''].filter(Boolean);
  return parts.join(', ') || 'נכס';
}

function propertySub(p) {
  return [p.type, p.owner, p.neighborhood].filter(Boolean).join(' · ') || '';
}

function leadSub(l) {
  return [l.city, l.phone].filter(Boolean).join(' · ');
}

function ownerSub(o) {
  return [o.email, o.phone].filter(Boolean).join(' · ');
}

function dealLabel(d) {
  return d.title || d.propertyAddress || d.propertyTitle || `עסקה #${d.id}`;
}

function dealSub(d) {
  return [d.status, d.stage, d.propertyAddress].filter(Boolean).join(' · ');
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ properties: [], leads: [], owners: [], deals: [] });
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  // 250ms debounce — feels instant to an agent typing Hebrew, batches
  // per-key requests so a three-letter query hits the server once.
  const debouncedQ = useDebouncedValue(q.trim(), 250);

  // Reset when the palette opens. We don't prefetch anything; the server
  // global-search endpoint handles an empty string (no results).
  useEffect(() => {
    if (!open) return;
    setQ('');
    setIndex(0);
    setResults({ properties: [], leads: [], owners: [], deals: [] });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Hit api.globalSearch whenever the debounced query changes while open.
  // AbortController cancels in-flight requests if the user keeps typing —
  // important on slow networks so stale results never overwrite newer.
  useEffect(() => {
    if (!open) return undefined;
    if (!debouncedQ) {
      setResults({ properties: [], leads: [], owners: [], deals: [] });
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api.globalSearch(debouncedQ).then(
      (data) => {
        if (cancelled) return;
        setResults({
          properties: data?.properties || [],
          leads:      data?.leads      || [],
          owners:     data?.owners     || [],
          deals:      data?.deals      || [],
        });
        setIndex(0);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        // Swallow errors silently — the palette should degrade to just
        // static nav entries rather than crash. The error toast surface
        // is wrong for a passive dropdown like this.
        setResults({ properties: [], leads: [], owners: [], deals: [] });
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [debouncedQ, open]);

  // Build the flat, ordered item list. Navigation order = render order
  // so keyboard arrow navigation matches the visible sections top-down.
  const { navMatches, flat } = useMemo(() => {
    const query = q.trim();
    const nav = STATIC_ENTRIES.filter((e) => !query || e.title.includes(query));
    const propItems = results.properties.map((p) => ({
      kind: 'property',
      icon: Building2,
      id: p.id,
      title: propertyLabel(p),
      subtitle: propertySub(p),
      to: `/properties/${p.id}`,
    }));
    const leadItems = results.leads.map((l) => ({
      kind: 'lead',
      icon: Users,
      id: l.id,
      title: l.name || 'ליד',
      subtitle: leadSub(l),
      to: `/customers?selected=${l.id}`,
    }));
    const ownerItems = results.owners.map((o) => ({
      kind: 'owner',
      icon: UserCircle,
      id: o.id,
      title: o.name || 'בעל נכס',
      subtitle: ownerSub(o),
      to: `/owners/${o.id}`,
    }));
    const dealItems = results.deals.map((d) => ({
      kind: 'deal',
      icon: Handshake,
      id: d.id,
      title: dealLabel(d),
      subtitle: dealSub(d),
      to: '/deals',
    }));
    return {
      navMatches: nav,
      flat: [...nav, ...propItems, ...leadItems, ...ownerItems, ...dealItems],
    };
  }, [q, results]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(flat.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        const item = flat[index];
        if (item?.to) { navigate(item.to); onClose(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, index, navigate, onClose]);

  if (!open) return null;

  const hasQuery = debouncedQ.length > 0;
  const totalDynamic = results.properties.length + results.leads.length + results.owners.length + results.deals.length;
  // Group offsets so each Item knows its flat-list index for highlight.
  const navCount   = navMatches.length;
  const propOffset = navCount;
  const leadOffset = propOffset + results.properties.length;
  const ownerOffset = leadOffset + results.leads.length;
  const dealOffset  = ownerOffset + results.owners.length;

  return (
    <Portal>
      <div className="cmdp-backdrop" onClick={onClose}>
        <div
          className="cmdp-modal"
          role="dialog"
          aria-modal="true"
          aria-label="חיפוש"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cmdp-search">
            <Search size={16} />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="חפש לקוח, נכס, בעלים, עסקה… (⌘K)"
              value={q}
              onChange={(e) => { setQ(e.target.value); setIndex(0); }}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="cmdp-results">
            {navMatches.length > 0 && (
              <Section title="ניווט">
                {navMatches.map((e, i) => (
                  <Item
                    key={e.to}
                    item={e}
                    active={index === i}
                    onPick={() => { navigate(e.to); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {results.properties.length > 0 && (
              <Section title="נכסים">
                {results.properties.map((p, i) => (
                  <Item
                    key={`p-${p.id}`}
                    item={{ icon: Building2, title: propertyLabel(p), subtitle: propertySub(p) }}
                    active={index === propOffset + i}
                    onPick={() => { navigate(`/properties/${p.id}`); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {results.leads.length > 0 && (
              <Section title="לקוחות">
                {results.leads.map((l, i) => (
                  <Item
                    key={`l-${l.id}`}
                    item={{ icon: Users, title: l.name || 'ליד', subtitle: leadSub(l) }}
                    active={index === leadOffset + i}
                    onPick={() => { navigate(`/customers?selected=${l.id}`); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {results.owners.length > 0 && (
              <Section title="בעלים">
                {results.owners.map((o, i) => (
                  <Item
                    key={`o-${o.id}`}
                    item={{ icon: UserCircle, title: o.name || 'בעל נכס', subtitle: ownerSub(o) }}
                    active={index === ownerOffset + i}
                    onPick={() => { navigate(`/owners/${o.id}`); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {results.deals.length > 0 && (
              <Section title="עסקאות">
                {results.deals.map((d, i) => (
                  <Item
                    key={`d-${d.id}`}
                    item={{ icon: Handshake, title: dealLabel(d), subtitle: dealSub(d) }}
                    active={index === dealOffset + i}
                    onPick={() => { navigate('/deals'); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {hasQuery && !loading && totalDynamic === 0 && navMatches.length === 0 && (
              <div className="cmdp-empty">לא נמצאו תוצאות</div>
            )}
          </div>
          <div className="cmdp-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span>
            <span><kbd>Enter</kbd> פתח</span>
            <span><kbd>Esc</kbd> סגור</span>
            {/* Sprint 7 — deep-link to the full /search results page */}
            <button
              type="button"
              className="cmdp-see-all"
              disabled={!q.trim()}
              onClick={() => {
                const query = q.trim();
                if (!query) return;
                onClose();
                navigate(`/search?q=${encodeURIComponent(query)}`);
              }}
            >
              ראה את כל התוצאות ←
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function Section({ title, children }) {
  return (
    <div className="cmdp-section">
      <div className="cmdp-section-title">{title}</div>
      {children}
    </div>
  );
}

function Item({ item, active, onPick }) {
  const Icon = item.icon;
  return (
    <button
      className={`cmdp-item ${active ? 'active' : ''}`}
      onClick={onPick}
      onMouseMove={() => {
        /* keep hover behavior from moving the arrow-key selection */
      }}
    >
      {Icon && <span className="cmdp-item-icon"><Icon size={15} /></span>}
      <span className="cmdp-item-text">
        <span className="cmdp-item-title">{item.title}</span>
        {item.subtitle && <span className="cmdp-item-sub">{item.subtitle}</span>}
      </span>
    </button>
  );
}
