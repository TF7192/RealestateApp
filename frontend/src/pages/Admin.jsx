// Admin platform overview — visible only to users with role=ADMIN
// (SEC-010 replaced the prior email-allowlist gate).
//
// Single landing page for the platform admin. Replaces the simple-table
// version with a charts-and-cards dashboard:
//
//   • Hero KPI strip — total users, properties, leads, deals, AI MTD
//     and AI all-time, each with weekly-delta chips and gold trim on
//     the AI cards.
//   • Users-by-role horizontal bar chart (AGENT / OWNER / CUSTOMER).
//   • Weekly-growth grouped bar chart — new users, new properties,
//     new leads, all from `newThisWeek`.
//   • AI spend by feature donut + a per-feature legend with cost +
//     call counts. Driven by /office/ai-usage which is now admin-only.
//   • Top spenders table — first 8 users by MTD AI spend.
//   • Searchable recent-users table — filter by name/email/office.
//
// Data sources (all in parallel, all pre-existing — no new endpoints):
//   /api/admin/overview        — KPIs + role breakdown + weekly delta
//   /api/admin/users-summary   — full per-user roll-up
//   /api/office/ai-usage       — feature/member breakdown for current
//                                month (admin-gated server-side)
//
// All charts are inline SVG — no chart-lib dependency, no runtime cost
// beyond the data fetch. Cream & Gold inline DT to match the rest of
// the admin surfaces.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon, Users, Building2, Banknote, Bell,
  MessageSquare, Sparkles, ShieldCheck, Crown, Search,
  TrendingUp, ArrowUpRight, BarChart3, PieChart,
} from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', successSoft: 'rgba(21,128,61,0.12)',
  danger: '#b91c1c', info: '#2563eb', infoSoft: 'rgba(37,99,235,0.12)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const FEATURE_LABELS = {
  'chat': 'Estia AI (צ׳אט)',
  'voice-ingest': 'הקלטה → טופס',
  'describe-property': 'תיאור נכס AI',
  'meeting-brief': 'סיכום פגישה',
  'offer-review': 'ניתוח הצעה',
  'ai-match': 'התאמה חכמה',
};
const ROLE_LABELS = { AGENT: 'סוכן/ת', OWNER: 'מנהל/ת', CUSTOMER: 'לקוח/ה' };

// Distinct palette for the feature donut. Six slots = the six features
// we currently track; falls through to gold for anything new.
const FEATURE_COLORS = ['#b48b4c', '#7a5c2c', '#15803d', '#2563eb', '#a855f7', '#ea580c'];

const fmtUsd = (n) => `$${(n || 0).toFixed(2)}`;
const fmtPct = (n) => `${n.toFixed(1)}%`;

export default function Admin() {
  const [overview, setOverview] = useState(null);
  const [usage, setUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.adminOverview().catch(() => null),
      api.officeAiUsage().catch(() => null),
      api.adminUsersSummary().catch(() => ({ items: [] })),
    ]).then(([o, u, s]) => {
      if (cancelled) return;
      setOverview(o);
      setUsage(u);
      setUsers(s?.items || []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const hay = [u.displayName, u.email, u.officeName, u.role]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q]);

  // Top spenders (sorted desc by MTD AI cost) — bypasses the q filter
  // so the leaderboard always shows the same big spenders.
  const topSpenders = useMemo(() => {
    return [...users]
      .filter((u) => (u.aiCostUsd || 0) > 0)
      .sort((a, b) => (b.aiCostUsd || 0) - (a.aiCostUsd || 0))
      .slice(0, 8);
  }, [users]);

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען נתוני אדמין…
      </div>
    );
  }

  const totalUsers = overview?.users?.total || 0;
  const premiumUsers = overview?.users?.premium || 0;
  const premiumPct = totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0;
  const avgPropPerAgent =
    overview?.users?.agents > 0
      ? (overview.properties / overview.users.agents)
      : 0;

  return (
    <div dir="rtl" style={{
      ...FONT, color: DT.ink, padding: 28, minHeight: '100%',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          width: 48, height: 48, borderRadius: 14,
          background: `linear-gradient(160deg, ${DT.ink} 0%, #2a2218 100%)`,
          color: DT.cream,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 6px 18px rgba(30,26,20,0.18)',
        }}><ShieldCheck size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            לוח בקרה — Admin
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            סקירה כוללת של המערכת — משתמשים, נכסים, לידים, וצריכת AI.
          </div>
        </div>
        <Link
          to="/admin/users"
          style={ctaSecondary()}
        >
          <Users size={14} /> כל המשתמשים
        </Link>
        <Link
          to="/admin/chats"
          style={ctaPrimary()}
        >
          <MessageSquare size={14} /> שיחות תמיכה
        </Link>
      </header>

      {/* Hero KPI strip */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        <Kpi
          icon={<Users size={16} />}
          label="משתמשים פעילים"
          value={totalUsers}
          delta={overview?.newThisWeek?.users}
          sub={`${overview?.users?.agents || 0} סוכנים · ${premiumUsers} פרימיום (${fmtPct(premiumPct)})`}
        />
        <Kpi
          icon={<Building2 size={16} />}
          label="נכסים"
          value={overview?.properties || 0}
          delta={overview?.newThisWeek?.properties}
          sub={`ממוצע ${avgPropPerAgent.toFixed(1)} לסוכן`}
        />
        <Kpi
          icon={<ActivityIcon size={16} />}
          label="לידים"
          value={overview?.leads || 0}
          delta={overview?.newThisWeek?.leads}
        />
        <Kpi
          icon={<Banknote size={16} />}
          label="עסקאות"
          value={overview?.deals || 0}
          sub={`${overview?.offices || 0} משרדים פעילים`}
        />
        <Kpi
          icon={<Sparkles size={16} />}
          label="צריכת AI · החודש"
          value={fmtUsd(overview?.ai?.thisMonth?.costUsd)}
          sub={`${overview?.ai?.thisMonth?.callCount || 0} קריאות · ${overview?.ai?.thisMonth?.activeOffices || 0} משרדים פעילים`}
          gold
        />
        <Kpi
          icon={<Sparkles size={16} />}
          label="צריכת AI · מצטבר"
          value={fmtUsd(overview?.ai?.allTime?.costUsd)}
          sub={`${overview?.ai?.allTime?.callCount || 0} קריאות מאז ההשקה`}
        />
      </div>

      {/* Two-column charts row */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
      }}>
        <RoleBreakdownCard overview={overview} />
        <WeeklyGrowthCard overview={overview} />
      </div>

      {/* AI usage breakdown — donut + per-feature legend + member list */}
      {usage && (
        <AiUsageCard usage={usage} topSpenders={topSpenders} />
      )}

      {/* Searchable per-user table */}
      <section style={card()}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 12, flexWrap: 'wrap',
        }}>
          <Users size={16} style={{ color: DT.goldDark }} />
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>משתמשים — סיכום אחרונים</h2>
          <div style={{
            position: 'relative',
            marginInlineStart: 'auto',
            minWidth: 240,
          }}>
            <span style={{
              position: 'absolute', insetInlineEnd: 12,
              top: '50%', transform: 'translateY(-50%)', color: DT.muted,
              pointerEvents: 'none',
            }}><Search size={14} /></span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש שם / אימייל / משרד"
              style={{
                ...FONT,
                width: '100%', padding: '8px 34px 8px 12px',
                border: `1px solid ${DT.border}`, borderRadius: 9,
                background: DT.white, color: DT.ink, fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <Link to="/admin/users" style={{
            fontSize: 12, fontWeight: 700,
            color: DT.gold, textDecoration: 'none',
          }}>הכל ←</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: DT.muted, fontSize: 11, textAlign: 'right' }}>
                <th style={th()}>משתמש</th>
                <th style={th()}>תפקיד</th>
                <th style={th()}>משרד</th>
                <th style={thNum()}>נכסים</th>
                <th style={thNum()}>לידים</th>
                <th style={thNum()}>עסקאות</th>
                <th style={thNum()}>תזכורות</th>
                <th style={thNum()}>קריאות AI</th>
                <th style={thNum()}>עלות AI</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} style={{ borderTop: `1px solid ${DT.border}` }}>
                  <td style={td()}>
                    <div style={{ fontWeight: 700 }}>{u.displayName || u.email}</div>
                    <div style={{ fontSize: 11, color: DT.muted, direction: 'ltr', textAlign: 'right' }}>{u.email}</div>
                  </td>
                  <td style={td()}>
                    <span style={{
                      display: 'inline-flex', gap: 4, alignItems: 'center',
                      fontSize: 11, fontWeight: 700, color: u.role === 'OWNER' ? DT.goldDark : DT.muted,
                    }}>
                      {u.role === 'OWNER' && <Crown size={10} />}
                      {ROLE_LABELS[u.role] || u.role}
                      {u.isPremium && (
                        <span style={{
                          marginInlineStart: 4, padding: '0 6px', borderRadius: 99,
                          background: DT.goldSoft, color: DT.goldDark, fontSize: 9, fontWeight: 800,
                        }}>PREMIUM</span>
                      )}
                    </span>
                  </td>
                  <td style={td()}>{u.officeName || <span style={{ color: DT.muted }}>—</span>}</td>
                  <td style={tdNum()}>{u.properties}</td>
                  <td style={tdNum()}>{u.leads}</td>
                  <td style={tdNum()}>{u.deals}</td>
                  <td style={tdNum()}>{u.reminders}</td>
                  <td style={tdNum()}>{u.aiCalls}</td>
                  <td style={tdNum()}>
                    <bdi style={{ direction: 'ltr', fontWeight: u.aiCostUsd > 0 ? 800 : 400, color: u.aiCostUsd > 0 ? DT.ink : DT.muted }}>
                      {fmtUsd(u.aiCostUsd)}
                    </bdi>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={9} style={{
                    padding: 32, textAlign: 'center',
                    color: DT.muted, fontSize: 13,
                  }}>
                    {q ? `אין תוצאות עבור "${q}"` : 'אין משתמשים להציג'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────

function Kpi({ icon, label, value, sub, delta, gold }) {
  // `delta` here is "new this week" — if it's a positive number we
  // surface a tiny up-arrow chip so the headline number tells a story.
  const showDelta = typeof delta === 'number' && delta > 0;
  return (
    <div style={{
      ...card(),
      display: 'flex', flexDirection: 'column', gap: 6,
      borderColor: gold ? DT.gold : DT.border,
      background: gold ? DT.goldSoft : DT.white,
      position: 'relative', overflow: 'hidden',
    }}>
      {gold && (
        <div aria-hidden="true" style={{
          position: 'absolute', insetBlockStart: -30, insetInlineStart: -30,
          width: 100, height: 100, borderRadius: 99,
          background: `radial-gradient(circle, ${DT.goldLight}55, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      }}>
        {icon} {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 28, fontWeight: 800, color: DT.ink, letterSpacing: -0.5,
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
        {showDelta && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 11, fontWeight: 800,
            color: DT.success, background: DT.successSoft,
            padding: '2px 6px', borderRadius: 99,
          }}>
            <ArrowUpRight size={10} /> +{delta} השבוע
          </span>
        )}
      </div>
      {sub && <span style={{ fontSize: 11, color: DT.muted, lineHeight: 1.55 }}>{sub}</span>}
    </div>
  );
}

function RoleBreakdownCard({ overview }) {
  const agents = overview?.users?.agents || 0;
  const owners = overview?.users?.owners || 0;
  // CUSTOMER count is total - agents - owners (we don't return CUSTOMER
  // explicitly from /admin/overview yet; this is the closest derivation).
  const total = overview?.users?.total || 0;
  const customers = Math.max(0, total - agents - owners);
  const max = Math.max(agents, owners, customers, 1);
  const rows = [
    { label: 'סוכנים', value: agents,    color: DT.gold },
    { label: 'מנהלים', value: owners,    color: DT.goldDark },
    { label: 'לקוחות', value: customers, color: DT.info },
  ];
  return (
    <section style={card()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <BarChart3 size={16} style={{ color: DT.goldDark }} />
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>פילוח משתמשים לפי תפקיד</h2>
        <span style={{
          marginInlineStart: 'auto',
          fontSize: 11, fontWeight: 700, color: DT.muted,
        }}>סה״כ {total}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, fontWeight: 700, color: DT.ink, marginBottom: 4,
            }}>
              <span>{r.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: DT.muted }}>{r.value}</span>
            </div>
            <div style={{
              height: 10, borderRadius: 99, background: DT.cream2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${(r.value / max) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${r.color}, ${r.color}dd)`,
                borderRadius: 99,
                transition: 'width 280ms ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeeklyGrowthCard({ overview }) {
  const u = overview?.newThisWeek?.users || 0;
  const p = overview?.newThisWeek?.properties || 0;
  const l = overview?.newThisWeek?.leads || 0;
  const max = Math.max(u, p, l, 1);
  const cols = [
    { label: 'משתמשים חדשים', value: u, color: DT.info },
    { label: 'נכסים חדשים',   value: p, color: DT.gold },
    { label: 'לידים חדשים',   value: l, color: DT.success },
  ];
  return (
    <section style={card()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <TrendingUp size={16} style={{ color: DT.goldDark }} />
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>צמיחה שבועית · 7 הימים האחרונים</h2>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        alignItems: 'end', minHeight: 160,
      }}>
        {cols.map((c) => (
          <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              fontSize: 22, fontWeight: 800, color: DT.ink,
              fontVariantNumeric: 'tabular-nums',
            }}>+{c.value}</div>
            <div style={{
              width: '100%',
              height: Math.max(4, (c.value / max) * 100),
              background: `linear-gradient(180deg, ${c.color}, ${c.color}cc)`,
              borderRadius: 8,
              boxShadow: `0 2px 6px ${c.color}33`,
              transition: 'height 280ms ease',
            }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: DT.muted, textAlign: 'center' }}>
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AiUsageCard({ usage, topSpenders }) {
  const features = (usage.features || []).filter((f) => f.costUsd > 0);
  const totalUsd = usage.totalUsd || 0;
  return (
    <section style={card()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Sparkles size={16} style={{ color: DT.goldDark }} />
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
          צריכת AI · {usage.month}
        </h2>
        <span style={{
          marginInlineStart: 'auto', fontSize: 22, fontWeight: 800, color: DT.goldDark,
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtUsd(totalUsd)}</span>
      </div>

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: features.length > 0 ? 'auto 1fr' : '1fr',
        alignItems: 'center',
      }}>
        {features.length > 0 && (
          <FeatureDonut features={features} totalUsd={totalUsd} />
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          {features.length === 0 ? (
            <div style={{ fontSize: 13, color: DT.muted, padding: '20px 0' }}>אין שימוש ב-AI החודש.</div>
          ) : features.map((f, i) => {
            const pct = totalUsd > 0 ? (f.costUsd / totalUsd) * 100 : 0;
            return (
              <div key={f.feature} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0',
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 99, flexShrink: 0,
                  background: FEATURE_COLORS[i] || DT.gold,
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0 }}>
                  {FEATURE_LABELS[f.feature] || f.feature}
                </span>
                <span style={{
                  fontSize: 11, color: DT.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}>{f.callCount} קריאות</span>
                <bdi style={{
                  fontSize: 13, fontWeight: 800, color: DT.ink,
                  direction: 'ltr', fontVariantNumeric: 'tabular-nums',
                  minWidth: 64, textAlign: 'left',
                }}>{fmtUsd(f.costUsd)}</bdi>
                <span style={{
                  fontSize: 11, color: DT.muted, minWidth: 40, textAlign: 'left',
                  fontVariantNumeric: 'tabular-nums',
                }}>{fmtPct(pct)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {topSpenders.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${DT.border}` }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: DT.muted, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 8,
          }}>5 המוציאים הגדולים ביותר · החודש</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {topSpenders.slice(0, 5).map((u, i) => {
              const top = topSpenders[0]?.aiCostUsd || 1;
              const pct = (u.aiCostUsd / top) * 100;
              return (
                <div key={u.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto',
                  alignItems: 'center', gap: 10,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 99,
                    background: i === 0 ? DT.gold : DT.cream2,
                    color: i === 0 ? DT.ink : DT.muted,
                    display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 800,
                  }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.displayName || u.email}
                    </div>
                    <div style={{
                      height: 6, borderRadius: 99, background: DT.cream2, overflow: 'hidden',
                      marginTop: 4,
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: `linear-gradient(90deg, ${DT.goldLight}, ${DT.gold})`,
                        borderRadius: 99,
                        transition: 'width 280ms ease',
                      }} />
                    </div>
                  </div>
                  <bdi style={{
                    direction: 'ltr', fontVariantNumeric: 'tabular-nums',
                    fontSize: 13, fontWeight: 800, color: DT.ink,
                    minWidth: 64, textAlign: 'left',
                  }}>{fmtUsd(u.aiCostUsd)}</bdi>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// SVG donut chart for the AI feature breakdown. Pure SVG so we don't
// pull in a charting library; the math is straightforward (cumulative
// arc lengths along a known circumference).
function FeatureDonut({ features, totalUsd }) {
  const size = 160;
  const radius = 60;
  const stroke = 22;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={DT.cream2} strokeWidth={stroke} />
        {/* Slices */}
        {features.map((f, i) => {
          const frac = totalUsd > 0 ? (f.costUsd / totalUsd) : 0;
          const dash = frac * circumference;
          const slice = (
            <circle
              key={f.feature}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={FEATURE_COLORS[i] || DT.gold}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += dash;
          return slice;
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', placeItems: 'center',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DT.muted, letterSpacing: 0.5 }}>סה״כ</div>
          <bdi style={{
            display: 'block', direction: 'ltr',
            fontSize: 17, fontWeight: 800, color: DT.ink,
            fontVariantNumeric: 'tabular-nums',
          }}>{fmtUsd(totalUsd)}</bdi>
        </div>
      </div>
    </div>
  );
}

// ── Inline style helpers ───────────────────────────────────────

function card(extra = {}) {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 18,
    boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
    ...extra,
  };
}
function ctaPrimary() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    color: DT.ink, padding: '9px 14px', borderRadius: 10,
    fontSize: 13, fontWeight: 800, textDecoration: 'none',
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
  };
}
function ctaSecondary() {
  return {
    ...FONT,
    background: DT.white, color: DT.ink,
    padding: '9px 14px', borderRadius: 10,
    border: `1px solid ${DT.border}`,
    fontSize: 13, fontWeight: 800, textDecoration: 'none',
    display: 'inline-flex', gap: 6, alignItems: 'center',
  };
}
function th() {
  return { padding: '6px 8px', fontWeight: 700, textAlign: 'right' };
}
function thNum() {
  return { padding: '6px 8px', fontWeight: 700, textAlign: 'left', direction: 'ltr' };
}
function td() {
  return { padding: '8px', verticalAlign: 'top' };
}
function tdNum() {
  return { padding: '8px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', direction: 'ltr' };
}
