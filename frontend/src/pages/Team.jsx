// Team (DTeam / ScreenTeam) — sprint-6 port of the claude.ai/design
// bundle. The page shows deals closed, volume, rating, open leads and
// active listings per agent in the caller's office for a chosen
// quarter. Cream + Gold DT palette; sortable dense table with a gold
// highlight on the top performer (by totalVolume).
//
// Distinct from /office (Office invite admin) — we link there from the
// header so OWNERs who land here can jump to the team-management tools.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trophy, Sparkles, UsersRound, Building2, Banknote, ArrowUpDown,
  ChevronUp, ChevronDown, Users,
} from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  goldSoft2: 'rgba(180,139,76,0.22)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Build the last four quarter labels (including the current one) so
// the picker pill reflects realistic windows. Current first.
function recentQuarters(count = 6) {
  const now = new Date();
  const result = [];
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  let y = now.getUTCFullYear();
  for (let i = 0; i < count; i++) {
    result.push(`Q${q}-${y}`);
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }
  return result;
}

// Hebrew KPI columns; `key` matches the server field name so the sort
// comparator is a single keyed lookup.
const COLS = [
  { key: 'displayName',      label: 'סוכן',            numeric: false, width: '22%' },
  { key: 'closedDeals',      label: 'עסקאות נסגרו',   numeric: true  },
  { key: 'totalVolume',      label: 'מחזור',           numeric: true  },
  { key: 'avgRating',        label: 'דירוג',           numeric: true  },
  { key: 'leadsOpen',        label: 'לידים פתוחים',   numeric: true  },
  { key: 'propertiesActive', label: 'נכסים פעילים',   numeric: true  },
];

export default function Team() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [quarter, setQuarter] = useState(() => recentQuarters(1)[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'totalVolume', dir: 'desc' });

  const quarterOptions = useMemo(() => recentQuarters(6), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.teamScoreboard(quarter);
        if (!cancelled) setAgents(res?.agents || []);
      } catch (e) {
        if (!cancelled) {
          setAgents([]);
          // 404 = user has no office yet; everything else is a real error.
          setError(e?.status === 404
            ? 'no-office'
            : (e?.message || 'שגיאה בטעינת הצוות'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [quarter]);

  const sortedAgents = useMemo(() => {
    const copy = agents.slice();
    const { key, dir } = sort;
    copy.sort((a, b) => {
      const av = a[key] ?? (COLS.find((c) => c.key === key)?.numeric ? 0 : '');
      const bv = b[key] ?? (COLS.find((c) => c.key === key)?.numeric ? 0 : '');
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv), 'he')
        : String(bv).localeCompare(String(av), 'he');
    });
    return copy;
  }, [agents, sort]);

  // Top performer = highest totalVolume. Breaks on closedDeals, then name.
  const topAgentId = useMemo(() => {
    if (!agents.length) return null;
    const best = agents.slice().sort((a, b) => {
      if (b.totalVolume !== a.totalVolume) return b.totalVolume - a.totalVolume;
      if (b.closedDeals !== a.closedDeals) return b.closedDeals - a.closedDeals;
      return String(a.displayName).localeCompare(String(b.displayName), 'he');
    })[0];
    return best?.totalVolume > 0 ? best.agentId : null;
  }, [agents]);

  const totals = useMemo(() => {
    return agents.reduce(
      (acc, a) => ({
        closedDeals: acc.closedDeals + (a.closedDeals || 0),
        totalVolume: acc.totalVolume + (a.totalVolume || 0),
        leadsOpen: acc.leadsOpen + (a.leadsOpen || 0),
        propertiesActive: acc.propertiesActive + (a.propertiesActive || 0),
      }),
      { closedDeals: 0, totalVolume: 0, leadsOpen: 0, propertiesActive: 0 },
    );
  }, [agents]);

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Default desc for numeric columns (biggest first), asc for names.
      const numeric = COLS.find((c) => c.key === key)?.numeric;
      return { key, dir: numeric ? 'desc' : 'asc' };
    });
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            הצוות שלי
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {loading
              ? 'טוען נתונים…'
              : agents.length
                ? `${agents.length} סוכנים · ${totals.closedDeals} עסקאות · ${formatVolume(totals.totalVolume)}`
                : ' '}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/office" style={actionBtn()}>
            <UsersRound size={14} /> ניהול משרד
          </Link>
        </div>
      </div>

      {/* Quarter picker + legend */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {quarterOptions.map((q) => {
          const on = q === quarter;
          return (
            <button
              key={q}
              type="button"
              onClick={() => setQuarter(q)}
              style={{
                ...FONT,
                background: on ? DT.ink : DT.white,
                color: on ? DT.cream : DT.ink,
                border: `1px solid ${on ? DT.ink : DT.border}`,
                padding: '7px 12px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >{q}</button>
          );
        })}
        <div style={{
          marginInlineStart: 'auto', display: 'inline-flex',
          alignItems: 'center', gap: 6, color: DT.muted, fontSize: 11,
        }}>
          <Trophy size={13} style={{ color: DT.gold }} aria-hidden="true" />
          <span>הדגשת זהב = מוביל/ה ברבעון</span>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13 }}>
            טוען…
          </div>
        )}
        {!loading && error === 'no-office' && (
          <EmptyOffice />
        )}
        {!loading && error && error !== 'no-office' && (
          <div style={{ padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13 }}>
            {error}
          </div>
        )}
        {!loading && !error && agents.length === 0 && (
          <EmptyTeam />
        )}
        {!loading && !error && agents.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${DT.border}`, background: DT.cream2 }}>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      style={{ ...headerCell(), width: c.width || 'auto',
                               textAlign: c.numeric ? 'center' : 'right' }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        style={{
                          ...FONT,
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', color: 'inherit',
                          fontSize: 'inherit', fontWeight: 'inherit',
                          textTransform: 'inherit', letterSpacing: 'inherit',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: 0,
                        }}
                        aria-label={`מיון לפי ${c.label}`}
                      >
                        {c.label}
                        <SortIcon active={sort.key === c.key} dir={sort.dir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a) => {
                  const isTop = a.agentId === topAgentId;
                  return (
                    <tr
                      key={a.agentId}
                      onClick={() => navigate(`/team/${a.agentId}`)}
                      title="פתח פרטי סוכן"
                      style={{
                        borderBottom: `1px solid ${DT.border}`,
                        background: isTop ? DT.goldSoft : 'transparent',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={bodyCell()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar agent={a} highlight={isTop} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontWeight: 700,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}>
                              {a.displayName}
                              {isTop && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  background: DT.gold, color: DT.white,
                                  borderRadius: 99, fontWeight: 800, fontSize: 10,
                                  padding: '2px 7px',
                                }}>
                                  <Trophy size={10} aria-hidden="true" />
                                  מוביל/ה
                                </span>
                              )}
                            </div>
                            {a.role === 'OWNER' && (
                              <div style={{
                                fontSize: 11, color: DT.muted, marginTop: 2,
                              }}>בעלים</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'center', fontWeight: 700 }}>
                        {a.closedDeals}
                      </td>
                      <td style={{
                        ...bodyCell(), textAlign: 'center',
                        fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      }}>
                        {formatVolume(a.totalVolume)}
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'center' }}>
                        <RatingCell value={a.avgRating} />
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'center' }}>
                        {a.leadsOpen}
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'center' }}>
                        {a.propertiesActive}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cells / atoms ──────────────────────────────────────────
function headerCell() {
  return {
    padding: '12px 14px', textAlign: 'right',
    fontSize: 11, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  };
}
function bodyCell() {
  return { padding: '14px 14px', verticalAlign: 'middle' };
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

function Avatar({ agent, highlight, size = 36 }) {
  const name = agent?.displayName || '?';
  const initial = name.charAt(0);
  if (agent?.avatarUrl) {
    return (
      <img
        src={agent.avatarUrl}
        alt={name}
        style={{
          width: size, height: size, borderRadius: 99, objectFit: 'cover',
          flexShrink: 0,
          boxShadow: highlight ? `0 0 0 2px ${DT.gold}` : 'none',
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: highlight
        ? `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`
        : `linear-gradient(160deg, ${DT.cream3}, ${DT.cream2})`,
      color: DT.ink, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: size * 0.42, flexShrink: 0,
      boxShadow: highlight ? `0 0 0 2px ${DT.gold}` : 'none',
    }}>{initial}</div>
  );
}

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown size={12} aria-hidden="true" style={{ opacity: 0.5 }} />;
  return dir === 'asc'
    ? <ChevronUp size={12} aria-hidden="true" />
    : <ChevronDown size={12} aria-hidden="true" />;
}

function RatingCell({ value }) {
  // Placeholder — the server ships 0 until the review system ships.
  // Displaying a real "—" instead of a misleading zero keeps the UI
  // honest. Once ratings are live, swap to a 5-star glyph.
  if (!value) return <span style={{ color: DT.muted }}>—</span>;
  return <span style={{ fontWeight: 700 }}>{value.toFixed(1)}</span>;
}

function formatVolume(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₪${Math.round(n / 1_000)}K`;
  return `₪${n}`;
}

function EmptyTeam() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: DT.muted }}>
      <Users size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        אין עדיין חברי צוות
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        הזמינו סוכנים למשרד דרך מסך ניהול המשרד.
      </p>
      <Link to="/office" style={{
        ...FONT,
        background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
        border: 'none', color: DT.ink,
        padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontWeight: 800,
        display: 'inline-flex', gap: 6, alignItems: 'center',
        boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
        textDecoration: 'none',
      }}>
        <UsersRound size={14} /> ניהול משרד
      </Link>
    </div>
  );
}

function EmptyOffice() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: DT.muted }}>
      <Building2 size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        אינך משויך למשרד
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        כדי לראות את הצוות, יש ליצור משרד ולהזמין אליו סוכנים.
      </p>
      <Link to="/office" style={{
        ...FONT,
        background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
        border: 'none', color: DT.ink,
        padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontWeight: 800,
        display: 'inline-flex', gap: 6, alignItems: 'center',
        boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
        textDecoration: 'none',
      }}>
        <Sparkles size={14} /> צור/י משרד
      </Link>
    </div>
  );
}

// Suppress the unused-import warning on Banknote — reserved for a
// forthcoming KPI-totals ribbon above the table.
void Banknote;
