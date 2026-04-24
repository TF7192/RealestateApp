// Customers (leads) list — port of the claude.ai/design bundle's
// DLeads (estia-new-project/project/src/desktop/screens-1.jsx).
// Filter pill row + dense data table. No fixtures: rows come from
// GET /api/leads. Row click → /customers/:id. Actions cell has
// direct phone + WhatsApp launchers so the agent never has to open
// the detail page for a one-tap outreach.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Upload, Filter, Phone, MessageCircle, Sparkles, Search,
  MessageSquareText,
} from 'lucide-react';
import api from '../lib/api';
import { formatPhone } from '../lib/phone';
import { useViewportMobile } from '../hooks/mobile';
import LeadFiltersSheet from '../components/LeadFiltersSheet';
import SwipeRow from '../components/SwipeRow';
import PullRefresh from '../components/PullRefresh';
import { telUrl, waUrl } from '../lib/waLink';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  hot: '#b91c1c', warm: '#b45309', cold: '#475569',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const FILTERS = [
  { k: 'all',    label: 'הכול' },
  { k: 'hot',    label: 'חמים' },
  { k: 'warm',   label: 'פושרים' },
  { k: 'cold',   label: 'קרים' },
  { k: 'stale',  label: 'ללא מענה 24ש' },
];

export default function Customers() {
  const navigate = useNavigate();
  const isMobile = useViewportMobile();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  // `filter` is the status bucket — drives the desktop pill row AND
  // mirrors `filters.status` inside the mobile sheet. The mobile sheet
  // also pushes `filters.lookingFor/interestType/city/minBudget/
  // maxBudget/minRooms/maxRooms` into `advanced` (below), which the
  // memoized filter stage reads alongside `filter`.
  const [filter, setFilter] = useState('all');
  const [advanced, setAdvanced] = useState({
    lookingFor: '', interestType: '', city: '',
    minBudget: null, maxBudget: null, minRooms: null, maxRooms: null,
  });
  const [q, setQ] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cityList, setCityList] = useState([]);

  // Lazy-load the city lookup once the sheet is about to open. Cheap
  // payload (~a few KB), cached by api.js's GET-level HTTP cache.
  useEffect(() => {
    if (!sheetOpen || cityList.length) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => api.cities?.())
      .then((r) => {
        if (cancelled || !r) return;
        const arr = Array.isArray(r) ? r : (r?.items || r?.cities || []);
        setCityList(arr.map((c) => (typeof c === 'string' ? c : (c?.name || c?.city))).filter(Boolean));
      })
      .catch(() => { /* soft-fail: datalist just renders empty */ });
    return () => { cancelled = true; };
  }, [sheetOpen, cityList.length]);

  // `load` is callable from PullRefresh on mobile. Plain stable ref —
  // no dependencies change the listLeads call shape.
  const load = useCallback(async () => {
    try {
      const res = await api.listLeads();
      setLeads(res?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const by = { hot: 0, warm: 0, cold: 0, stale: 0 };
    const now = Date.now();
    for (const l of leads) {
      const s = (l.status || '').toUpperCase();
      if (s === 'HOT')  by.hot++;
      if (s === 'WARM') by.warm++;
      if (s === 'COLD') by.cold++;
      const lastContact = l.lastContact ? new Date(l.lastContact).getTime() : 0;
      if (!lastContact || now - lastContact > 24 * 60 * 60 * 1000) by.stale++;
    }
    return by;
  }, [leads]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const cityQ = (advanced.city || '').trim();
    return leads.filter((l) => {
      if (qq) {
        const haystack = `${l.name || ''} ${l.phone || ''} ${l.city || ''} ${l.email || ''}`.toLowerCase();
        if (!haystack.includes(qq)) return false;
      }
      const status = (l.status || '').toUpperCase();
      if (filter === 'hot'  && status !== 'HOT')  return false;
      if (filter === 'warm' && status !== 'WARM') return false;
      if (filter === 'cold' && status !== 'COLD') return false;
      if (filter === 'stale') {
        const lastContact = l.lastContact ? new Date(l.lastContact).getTime() : 0;
        if (lastContact && Date.now() - lastContact <= 24 * 60 * 60 * 1000) return false;
      }
      // Sheet-only dimensions. Each one is "unset" until the sheet
      // applies a truthy value, so a desktop-only session behaves
      // exactly as before.
      if (advanced.lookingFor && (l.lookingFor || '').toUpperCase() !== advanced.lookingFor) return false;
      if (advanced.interestType && (l.interestType || '').toUpperCase() !== advanced.interestType) return false;
      if (cityQ && !(l.city || '').includes(cityQ)) return false;
      if (advanced.minBudget != null && Number(l.budget || 0) < advanced.minBudget) return false;
      if (advanced.maxBudget != null && l.budget && Number(l.budget) > advanced.maxBudget) return false;
      if (advanced.minRooms != null && Number(l.rooms || 0) < advanced.minRooms) return false;
      if (advanced.maxRooms != null && l.rooms && Number(l.rooms) > advanced.maxRooms) return false;
      return true;
    });
  }, [leads, filter, q, advanced]);

  const pillCount = (k) => {
    if (k === 'all')  return leads.length;
    return counts[k] || 0;
  };

  // Count of active non-default filter dimensions (status !== all counts
  // as one). Surfaced in the mobile chip so the agent knows the list
  // is narrowed without opening the sheet.
  const activeCount = useMemo(() => {
    let n = 0;
    if (filter && filter !== 'all') n++;
    if (advanced.lookingFor)   n++;
    if (advanced.interestType) n++;
    if ((advanced.city || '').trim()) n++;
    if (advanced.minBudget != null) n++;
    if (advanced.maxBudget != null) n++;
    if (advanced.minRooms  != null) n++;
    if (advanced.maxRooms  != null) n++;
    return n;
  }, [filter, advanced]);

  // Sprint 8 parity sweep — on mobile (<=820px) the page content lives
  // inside a PullRefresh wrapper so the list reloads with a gold-spinner
  // PTR gesture. Desktop keeps its static render (PTR hook is a no-op
  // under pointer:fine per PullRefresh.css) so the behaviour is
  // mobile-only without two code paths.
  const Container = isMobile
    ? ({ children }) => <PullRefresh onRefresh={load}>{children}</PullRefresh>
    : ({ children }) => <>{children}</>;

  return (
    <Container>
    <div dir="rtl" style={{
      ...FONT, padding: isMobile ? '16px 14px 40px' : 28,
      color: DT.ink, minHeight: '100%',
    }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>לידים</h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {leads.length} סך הכול · {counts.hot} חמים · {counts.warm} פושרים · {counts.cold} קרים
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              const el = document.querySelector('[data-customers-search]');
              if (el) el.focus();
            }}
            style={actionBtn()}
          >
            <Filter size={14} /> מסננים
          </button>
          <Link to="/import/leads" style={actionBtn()}>
            <Upload size={14} /> ייבוא
          </Link>
          <Link to="/customers/new" style={primaryBtn()}>
            <Plus size={14} /> ליד חדש
          </Link>
        </div>
      </div>

      {/* Filter pills + search. On mobile (<820px) the pill row collapses
          into a single "סינון" chip that opens the LeadFiltersSheet —
          the desktop experience is unchanged. */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {isMobile ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="סינון לידים"
            style={{
              ...FONT,
              background: DT.white, color: DT.ink,
              border: `1px solid ${DT.border}`,
              padding: '10px 14px', borderRadius: 99,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Filter size={14} /> סינון
            {activeCount > 0 && (
              <span style={{
                background: DT.ink, color: DT.cream,
                borderRadius: 99, padding: '1px 7px',
                fontSize: 11, fontWeight: 800,
              }}>{activeCount}</span>
            )}
          </button>
        ) : (
          FILTERS.map((f) => {
            const on = filter === f.k;
            return (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                style={{
                  ...FONT,
                  background: on ? DT.ink : DT.white,
                  color: on ? DT.cream : DT.ink,
                  border: `1px solid ${on ? DT.ink : DT.border}`,
                  padding: '7px 12px', borderRadius: 99,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{f.label} · {pillCount(f.k)}</button>
            );
          })
        )}
        <div style={{
          marginInlineStart: 'auto', position: 'relative',
          display: 'inline-flex', alignItems: 'center',
        }}>
          <Search size={14} style={{
            position: 'absolute', insetInlineEnd: 10,
            top: '50%', transform: 'translateY(-50%)',
            color: DT.muted, pointerEvents: 'none',
          }} />
          <input
            data-customers-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שם / טלפון / עיר…"
            style={{
              ...FONT, padding: '8px 30px 8px 12px',
              border: `1px solid ${DT.border}`, borderRadius: 99,
              background: DT.white, fontSize: 12, color: DT.ink,
              outline: 'none', width: 220, textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* Mobile filter sheet. Mounted regardless of isMobile so closing
          the sheet while the viewport crosses a breakpoint mid-session
          doesn't strand a ghost overlay. */}
      <LeadFiltersSheet
        open={sheetOpen}
        values={{ status: filter, ...advanced }}
        cities={cityList}
        onApply={(next) => {
          const { status, ...rest } = next || {};
          setFilter(status || 'all');
          setAdvanced({
            lookingFor: rest.lookingFor || '',
            interestType: rest.interestType || '',
            city: rest.city || '',
            minBudget: rest.minBudget ?? null,
            maxBudget: rest.maxBudget ?? null,
            minRooms: rest.minRooms ?? null,
            maxRooms: rest.maxRooms ?? null,
          });
        }}
        onClose={() => setSheetOpen(false)}
      />

      {/* List — dense table on desktop, swipe-card stack on mobile. */}
      {isMobile ? (
        <div>
          {loading && (
            <div style={{
              padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13,
              background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
            }}>טוען לידים…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              borderRadius: 14, overflow: 'hidden',
            }}>
              <EmptyState filter={filter} hasAny={leads.length > 0} />
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((l) => (
                <MobileLeadRow
                  key={l.id}
                  lead={l}
                  onOpen={() => navigate(`/customers/${l.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13 }}>
              טוען לידים…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <EmptyState filter={filter} hasAny={leads.length > 0} />
          )}
          {!loading && filtered.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${DT.border}`, background: DT.cream2 }}>
                    {['שם', 'טלפון', 'עיר', 'תקציב', 'מה מחפש', 'מקור', 'עודכן', ''].map((h) => (
                      <th key={h} style={headerCell()}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => navigate(`/customers/${l.id}`)}
                      onMouseEnter={() => setHoverId(l.id)}
                      onMouseLeave={() => setHoverId(null)}
                      style={{
                        borderBottom: `1px solid ${DT.border}`,
                        cursor: 'pointer',
                        background: hoverId === l.id ? DT.cream4 : 'transparent',
                      }}
                    >
                      <td style={bodyCell()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={l.name} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{l.name || 'ליד'}</div>
                            <StatusChip status={l.status} />
                          </div>
                        </div>
                      </td>
                      <td style={{ ...bodyCell(), color: DT.muted, fontVariantNumeric: 'tabular-nums', direction: 'ltr', textAlign: 'right' }}>
                        {l.phone ? formatPhone(l.phone) : '—'}
                      </td>
                      <td style={bodyCell()}>{l.city || '—'}</td>
                      <td style={{ ...bodyCell(), fontWeight: 700 }}>
                        {l.budget ? `₪${Math.round(l.budget / 1000)}K` : (l.priceRangeLabel || '—')}
                      </td>
                      <td style={{
                        ...bodyCell(), color: DT.muted,
                        maxWidth: 220, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {[l.rooms ? `${l.rooms} חד׳` : null, l.lookingFor === 'BUY' ? 'קנייה' : 'שכירות']
                          .filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td style={{ ...bodyCell(), color: DT.muted, fontSize: 12 }}>{l.source || '—'}</td>
                      <td style={{ ...bodyCell(), color: DT.muted, fontSize: 12 }}>
                        {l.updatedAt
                          ? new Date(l.updatedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                          : '—'}
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {l.phone && (
                            <a
                              href={`tel:${l.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="התקשר"
                              style={iconBtn(DT.cream2, DT.ink)}
                            ><Phone size={12} /></a>
                          )}
                          {l.phone && (
                            <a
                              href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="WhatsApp"
                              style={iconBtn('rgba(21,128,61,0.12)', DT.success)}
                            ><MessageCircle size={12} /></a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
    </Container>
  );
}

// Sprint 8 — MobileLeadRow wraps the lead card in a SwipeRow so RTL
// swipe-left (trailing reveal) exposes call / WhatsApp / SMS actions.
// Matches the ScreenLeads mockup's card shape (avatar + name + need +
// city/budget meta) while routing taps to /customers/:id.
function MobileLeadRow({ lead, onOpen }) {
  const phone = (lead.phone || '').replace(/\D/g, '');
  const actions = phone ? [
    {
      icon: Phone, label: 'התקשר', color: 'gold',
      onClick: () => { window.location.href = telUrl(lead.phone); },
    },
    {
      icon: MessageCircle, label: 'וואטסאפ', color: 'green',
      onClick: () => {
        const text = `שלום ${(lead.name || '').split(' ')[0] || ''}, כאן מהמשרד.`;
        window.open(waUrl(lead.phone, text), '_blank', 'noopener,noreferrer');
      },
    },
    {
      icon: MessageSquareText, label: 'SMS', color: 'blue',
      onClick: () => { window.location.href = `sms:${lead.phone}`; },
    },
  ] : [];

  return (
    <SwipeRow actions={actions}>
      <div
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen?.(); }}
        style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: 12, display: 'flex',
          gap: 12, alignItems: 'center', cursor: 'pointer',
        }}
      >
        <Avatar name={lead.name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
            flexWrap: 'wrap',
          }}>
            <div style={{
              fontWeight: 700, fontSize: 15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{lead.name || 'ליד'}</div>
            <StatusChip status={lead.status} />
          </div>
          <div style={{
            fontSize: 11, color: DT.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {[
              lead.city || null,
              lead.budget ? `₪${Math.round(lead.budget / 1000)}K` : null,
              lead.rooms ? `${lead.rooms} חד׳` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </SwipeRow>
  );
}

// ─── Cells / atoms ──────────────────────────────────────────
function headerCell() {
  return {
    padding: '12px 14px', textAlign: 'right',
    fontSize: 11, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
  };
}
function bodyCell() {
  return { padding: '12px 14px', verticalAlign: 'middle' };
}
function actionBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function iconBtn(bg, color) {
  return {
    background: bg, border: 'none',
    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
    color, display: 'grid', placeItems: 'center', textDecoration: 'none',
  };
}

function Avatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
      color: DT.ink, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: size * 0.4, flexShrink: 0,
    }}>{name ? name.charAt(0) : '?'}</div>
  );
}

function StatusChip({ status }) {
  const s = (status || '').toUpperCase();
  const map = {
    HOT:  { label: '🔥 חם', color: DT.hot,  bg: 'rgba(185,28,28,0.12)' },
    WARM: { label: 'פושר',  color: DT.warm, bg: 'rgba(180,83,9,0.12)' },
    COLD: { label: 'קר',    color: DT.cold, bg: 'rgba(71,85,105,0.12)' },
  };
  const cfg = map[s];
  if (!cfg) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: cfg.bg, color: cfg.color,
      borderRadius: 99, fontWeight: 700, fontSize: 10,
      padding: '2px 7px', marginTop: 2,
    }}>{cfg.label}</span>
  );
}

function EmptyState({ filter, hasAny }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: DT.muted }}>
      <Sparkles size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        {hasAny ? 'אין תוצאות למסנן הזה' : 'עדיין אין לידים'}
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        {hasAny
          ? 'נסו מסנן אחר או נקו את החיפוש כדי לראות את כל הלידים.'
          : 'התחילו עם ליד ראשון — הקלדה ידנית או ייבוא מ-Excel.'}
      </p>
      {!hasAny && (
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <Link to="/customers/new" style={primaryBtn()}>
            <Plus size={14} /> ליד חדש
          </Link>
          <Link to="/import/leads" style={actionBtn()}>
            <Upload size={14} /> ייבוא מ-Excel
          </Link>
        </div>
      )}
    </div>
  );
}
