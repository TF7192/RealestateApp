// Sprint 7 — SearchResults page.
//
// Full-page results for the global search. Reads `?q=` from the URL,
// hits `api.search(q)`, and renders 4 vertical buckets (Leads /
// Properties / Owners / Deals). Each bucket is a cream-card list with
// row-click → detail page. On desktop (>=900px) a sticky right-side
// category nav scrolls to each bucket; on mobile the same categories
// surface as filter pills under the heading.
//
// Pairs with CommandPalette.jsx: the palette's new "ראה את כל
// התוצאות" footer button closes the palette and navigates here.
//
// Inline Cream + Gold DT tokens — matches Team / Office pages in this
// lane so the design audit stays consistent.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Search, Building2, Users, UserCircle, Handshake, Inbox,
} from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Bucket metadata — one source of truth for labels, icons, empty copy,
// row formatters, and row targets. Ordering here = render order.
function bucketDefs() {
  return [
    {
      key: 'leads',
      label: 'לידים',
      Icon: Users,
      empty: 'לא נמצאו לידים',
      title: (l) => l.name || 'ליד',
      sub:   (l) => [l.city, l.phone].filter(Boolean).join(' · '),
      to:    (l) => `/customers?selected=${l.id}`,
    },
    {
      key: 'properties',
      label: 'נכסים',
      Icon: Building2,
      empty: 'לא נמצאו נכסים',
      title: (p) => {
        const street = [p.street, p.number].filter(Boolean).join(' ').trim();
        const parts = [street || p.address || '', p.city || ''].filter(Boolean);
        return parts.join(', ') || 'נכס';
      },
      sub:   (p) => [p.type, p.owner, p.neighborhood].filter(Boolean).join(' · '),
      to:    (p) => `/properties/${p.id}`,
    },
    {
      key: 'owners',
      label: 'בעלים',
      Icon: UserCircle,
      empty: 'לא נמצאו בעלים',
      title: (o) => o.name || 'בעל נכס',
      sub:   (o) => [o.email, o.phone].filter(Boolean).join(' · '),
      to:    (o) => `/owners/${o.id}`,
    },
    {
      key: 'deals',
      label: 'עסקאות',
      Icon: Handshake,
      empty: 'לא נמצאו עסקאות',
      title: (d) => d.title || d.propertyAddress || d.propertyTitle || `עסקה #${d.id}`,
      sub:   (d) => [d.status, d.stage, d.propertyAddress].filter(Boolean).join(' · '),
      to:    () => '/deals',
    },
  ];
}

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get('q') || '').trim();

  const [input, setInput] = useState(q);
  const [results, setResults] = useState({ properties: [], leads: [], owners: [], deals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Re-sync the input field if the user hits back/forward and ?q=
  // changes underneath us.
  useEffect(() => { setInput(q); }, [q]);

  // Fetch on query change. AbortController cancels stale in-flight
  // requests — a fast typist otherwise clobbers the newest with the
  // oldest response when network latency jitters.
  useEffect(() => {
    if (!q) {
      setResults({ properties: [], leads: [], owners: [], deals: [] });
      setLoading(false);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.search(q, 25).then(
      (data) => {
        if (cancelled) return;
        setResults({
          properties: data?.properties || [],
          leads:      data?.leads      || [],
          owners:     data?.owners     || [],
          deals:      data?.deals      || [],
        });
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setResults({ properties: [], leads: [], owners: [], deals: [] });
        setError(err?.message || 'שגיאה בחיפוש');
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [q]);

  const buckets = useMemo(() => bucketDefs(), []);
  const totals = {
    leads:      results.leads.length,
    properties: results.properties.length,
    owners:     results.owners.length,
    deals:      results.deals.length,
  };
  const grandTotal = totals.leads + totals.properties + totals.owners + totals.deals;

  const scrollToBucket = (key) => {
    const el = document.getElementById(`search-bucket-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const next = input.trim();
    if (!next) return;
    // Push the new query through the URL so shareable / back-button
    // works and so the useEffect above re-runs.
    setParams({ q: next });
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
          תוצאות חיפוש
        </h1>
        <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
          {loading ? 'מחפש…'
            : q
              ? `${grandTotal} תוצאות עבור “${q}”`
              : 'הקלד/י מונח חיפוש למטה'}
        </div>
      </div>

      {/* Search box */}
      <form onSubmit={onSubmit} style={{ marginBottom: 18 }}>
        <div style={{
          position: 'relative', maxWidth: 560,
        }}>
          <span style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            right: 14, color: DT.muted, pointerEvents: 'none',
            display: 'inline-flex',
          }}><Search size={15} /></span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="חפש לקוח, נכס, בעלים, עסקה…"
            aria-label="חיפוש"
            autoFocus
            style={{
              ...FONT, width: '100%',
              padding: '12px 44px 12px 14px',
              border: `1px solid ${DT.border}`, borderRadius: 10,
              background: DT.white, fontSize: 14, color: DT.ink,
              outline: 'none',
            }}
          />
        </div>
      </form>

      {/* Mobile filter pills — hidden on wider viewports via the
          container class so desktop gets the sidebar instead. */}
      {q && !loading && (
        <div
          className="search-mobile-pills"
          style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14,
          }}
        >
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => scrollToBucket(b.key)}
              style={{
                ...FONT,
                background: totals[b.key] > 0 ? DT.white : DT.cream2,
                color: totals[b.key] > 0 ? DT.ink : DT.muted,
                border: `1px solid ${DT.border}`,
                padding: '6px 12px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <b.Icon size={13} aria-hidden="true" />
              {b.label}
              <span style={{
                background: DT.goldSoft, color: DT.goldDark,
                borderRadius: 99, padding: '1px 7px', fontSize: 11, fontWeight: 800,
              }}>{totals[b.key]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Two-column layout: results + desktop category nav on the right.
          `display: grid` with a fixed 200px trailing column gives the
          cleanest reflow; on narrow viewports the media-query style
          below collapses the second column to 0 so only the pills show. */}
      <div
        className="search-grid"
        style={{
          display: 'grid', gap: 24,
          gridTemplateColumns: 'minmax(0,1fr) 220px',
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {!q && <EmptyHint />}
          {q && error && <ErrorBox message={error} />}
          {q && !error && !loading && grandTotal === 0 && (
            <NoResults q={q} />
          )}
          {q && !error && buckets.map((b) => (
            <Bucket
              key={b.key}
              id={`search-bucket-${b.key}`}
              def={b}
              items={results[b.key]}
              loading={loading}
              onPick={(item) => navigate(b.to(item))}
            />
          ))}
        </div>

        {/* Desktop category nav. `position: sticky` keeps it anchored
            to the top of the viewport as the result panes scroll. */}
        <aside
          className="search-sidebar"
          aria-label="קטגוריות"
          style={{
            position: 'sticky', top: 14,
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 12, padding: 10,
          }}
        >
          <div style={{
            fontSize: 10, color: DT.muted, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            padding: '4px 8px 8px',
          }}>קטגוריות</div>
          {buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => scrollToBucket(b.key)}
              style={{
                ...FONT, width: '100%', textAlign: 'right',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 10px', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 10, color: DT.ink,
                fontSize: 13, fontWeight: 600,
              }}
            >
              <b.Icon size={15} aria-hidden="true" />
              <span style={{ flex: 1 }}>{b.label}</span>
              <span style={{
                background: totals[b.key] > 0 ? DT.goldSoft : DT.cream2,
                color: totals[b.key] > 0 ? DT.goldDark : DT.muted,
                borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 800,
                minWidth: 22, textAlign: 'center',
              }}>{totals[b.key]}</span>
            </button>
          ))}
          <div style={{
            marginTop: 10, borderTop: `1px solid ${DT.border}`,
            paddingTop: 10,
          }}>
            <Link
              to="/dashboard"
              style={{
                ...FONT, fontSize: 12, color: DT.muted, textDecoration: 'none',
                padding: '4px 8px', display: 'inline-block',
              }}
            >← חזרה ללוח הבקרה</Link>
          </div>
        </aside>
      </div>

      {/* Scoped CSS: hide the desktop sidebar on narrow viewports so
          the mobile pills are the single entry point, and vice-versa. */}
      <style>{`
        @media (max-width: 600px) {
          .search-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .search-sidebar { display: none !important; }
        }
        @media (min-width: 601px) {
          .search-mobile-pills { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ═══ Pieces ═════════════════════════════════════════════════════

function Bucket({ id, def, items, loading, onPick }) {
  const { label, Icon, empty, title, sub } = def;
  return (
    <section
      id={id}
      aria-label={label}
      style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, marginBottom: 14, overflow: 'hidden',
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: `1px solid ${DT.border}`,
        background: DT.cream2,
      }}>
        <Icon size={16} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: -0.2 }}>
          {label}
        </h2>
        <span style={{
          marginInlineStart: 'auto',
          background: items.length > 0 ? DT.goldSoft : DT.cream3,
          color: items.length > 0 ? DT.goldDark : DT.muted,
          borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 800,
        }}>{items.length}</span>
      </header>

      {loading ? (
        <div style={{ padding: 20, color: DT.muted, fontSize: 13, textAlign: 'center' }}>
          טוען…
        </div>
      ) : items.length === 0 ? (
        <div style={{
          padding: 28, textAlign: 'center', color: DT.muted, fontSize: 13,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <Inbox size={22} aria-hidden="true" />
          <span>{empty}</span>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((item, i) => (
            <li key={`${id}-${item.id ?? i}`}>
              <button
                type="button"
                onClick={() => onPick(item)}
                style={{
                  ...FONT, width: '100%', textAlign: 'right',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: i < items.length - 1 ? `1px solid ${DT.border}` : 'none',
                  padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12, color: DT.ink,
                }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: DT.goldSoft, color: DT.goldDark,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontWeight: 700, fontSize: 13,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{title(item)}</span>
                  {sub(item) && (
                    <span style={{
                      display: 'block', marginTop: 2,
                      fontSize: 11, color: DT.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{sub(item)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyHint() {
  return (
    <div style={{
      background: DT.white, border: `1px dashed ${DT.borderStrong}`,
      borderRadius: 14, padding: 32, textAlign: 'center', color: DT.muted,
    }}>
      <Search size={22} aria-hidden="true" />
      <div style={{ marginTop: 8, fontSize: 13 }}>
        הקלד/י שם, טלפון או כתובת ולחצ/י Enter
      </div>
    </div>
  );
}

function NoResults({ q }) {
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: 40, textAlign: 'center',
    }}>
      <Inbox size={28} aria-hidden="true" />
      <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700 }}>
        לא נמצאו תוצאות
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: DT.muted }}>
        לא מצאנו תוצאות עבור “{q}”. נסה/י מילות מפתח אחרות.
      </div>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: 24, textAlign: 'center',
      color: DT.ink,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>שגיאה בחיפוש</div>
      <div style={{ marginTop: 4, fontSize: 12, color: DT.muted }}>{message}</div>
    </div>
  );
}
