import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, Users, Handshake, LayoutDashboard, Plus, UserPlus, User } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import './CommandPalette.css';

const STATIC_ENTRIES = [
  { kind: 'nav', icon: LayoutDashboard, title: 'לוח בקרה',   to: '/' },
  { kind: 'nav', icon: Building2,        title: 'נכסים',      to: '/properties' },
  { kind: 'nav', icon: Users,            title: 'לקוחות',     to: '/customers' },
  { kind: 'nav', icon: Handshake,        title: 'עסקאות',     to: '/deals' },
  { kind: 'nav', icon: User,             title: 'הפרופיל שלי', to: '/profile' },
  { kind: 'action', icon: Plus,          title: 'קליטת נכס חדש', to: '/properties/new' },
  { kind: 'action', icon: UserPlus,      title: 'ליד חדש',      to: '/customers/new' },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [props, setProps] = useState([]);
  const [leads, setLeads] = useState([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  // Load searchable data once when the palette first opens
  useEffect(() => {
    if (!open) return;
    setQ('');
    setIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
    (async () => {
      try {
        const [p, l] = await Promise.all([
          api.listProperties({ mine: '1' }).catch(() => ({ items: [] })),
          api.listLeads().catch(() => ({ items: [] })),
        ]);
        setProps(p.items || []);
        setLeads(l.items || []);
      } catch { /* ignore */ }
    })();
  }, [open]);

  const query = q.trim().toLowerCase();
  const propMatches = !query ? [] : props.filter((p) =>
    p.street?.toLowerCase().includes(query) ||
    p.city?.toLowerCase().includes(query) ||
    p.owner?.toLowerCase().includes(query) ||
    p.type?.toLowerCase().includes(query)
  ).slice(0, 6);
  const leadMatches = !query ? [] : leads.filter((l) =>
    l.name?.toLowerCase().includes(query) ||
    l.phone?.includes(query) ||
    l.city?.toLowerCase().includes(query)
  ).slice(0, 6);
  const navMatches = STATIC_ENTRIES.filter((e) =>
    !query || e.title.includes(q.trim())
  );

  const flat = [
    ...navMatches.map((e) => ({ ...e, kind: e.kind })),
    ...leadMatches.map((l) => ({ kind: 'lead', icon: Users, title: l.name, subtitle: `${l.city || ''} · ${l.phone || ''}`, to: `/customers?selected=${l.id}` })),
    ...propMatches.map((p) => ({ kind: 'property', icon: Building2, title: `${p.street}, ${p.city}`, subtitle: `${p.type} · ${p.owner}`, to: `/properties/${p.id}` })),
  ];

  useEffect(() => {
    if (!open) return;
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

  return (
    <Portal>
      <div className="cmdp-backdrop" onClick={onClose}>
        <div className="cmdp-modal" onClick={(e) => e.stopPropagation()}>
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
              placeholder="חפש לקוח, נכס או מסך… (⌘K)"
              value={q}
              onChange={(e) => { setQ(e.target.value); setIndex(0); }}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="cmdp-results">
            {navMatches.length > 0 && (
              <Section title="ניווט">
                {navMatches.map((e, i) => (
                  <Item key={e.to} item={e} active={index === i} onPick={() => { navigate(e.to); onClose(); }} />
                ))}
              </Section>
            )}
            {leadMatches.length > 0 && (
              <Section title="לקוחות">
                {leadMatches.map((l, i) => (
                  <Item
                    key={l.id}
                    item={{ icon: Users, title: l.name, subtitle: `${l.city || ''} · ${l.phone || ''}` }}
                    active={index === navMatches.length + i}
                    onPick={() => { navigate(`/customers?selected=${l.id}`); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {propMatches.length > 0 && (
              <Section title="נכסים">
                {propMatches.map((p, i) => (
                  <Item
                    key={p.id}
                    item={{ icon: Building2, title: `${p.street}, ${p.city}`, subtitle: `${p.type} · ${p.owner}` }}
                    active={index === navMatches.length + leadMatches.length + i}
                    onPick={() => { navigate(`/properties/${p.id}`); onClose(); }}
                  />
                ))}
              </Section>
            )}
            {query && leadMatches.length === 0 && propMatches.length === 0 && navMatches.length === 0 && (
              <div className="cmdp-empty">לא נמצאו תוצאות</div>
            )}
          </div>
          <div className="cmdp-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span>
            <span><kbd>Enter</kbd> פתח</span>
            <span><kbd>Esc</kbd> סגור</span>
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
