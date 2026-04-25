// Dashboard — port of the claude.ai/design bundle's DDashboard
// (estia-new-project/project/src/desktop/screens-1.jsx).
// Visual match is the goal; data comes from the real API where
// available. AI-specific actions open a "Premium only" modal instead
// of firing — the feature is gated behind the upgrade path.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Calendar as CalendarIcon, Banknote, BarChart2,
  Sparkles, X, Star, Activity as ActivityIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import Portal from '../components/Portal';

// ─── Tokens lifted from the bundle's shell.jsx ──────────────
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

// AI priorities are computed from live data — no fixtures. Helper
// below inspects the agent's real leads/properties/deals/meetings
// and returns up to 5 actionable items sorted by urgency. Each row
// is still gated by the Premium modal on click (the AI layer that
// would auto-draft the action is premium-only); the signals come
// from the agent's own records.
function computeAiPriorities({ leads, properties, deals, meetings }) {
  const out = [];
  const now = Date.now();

  // Hot leads whose last-contact is stale (>4 h ago or never). Sorted
  // newest-stale-first so the most recently missed call surfaces.
  const hotStale = (leads || [])
    .filter((l) => (l.status || '').toUpperCase() === 'HOT')
    .map((l) => ({ l, gap: l.lastContact ? now - new Date(l.lastContact).getTime() : Infinity }))
    .filter((x) => x.gap > 4 * 60 * 60 * 1000)
    .sort((a, b) => a.gap - b.gap);
  for (const { l } of hotStale.slice(0, 2)) {
    out.push({
      key: `hot-${l.id}`,
      t: `תתקשרו ל-${l.name || 'ליד'} · לא עניתם זמן רב`,
      sub: [l.city, l.priceRangeLabel].filter(Boolean).join(' · ') || 'ליד חם ממתין למענה',
      tag: 'hot', action: 'התקשר עכשיו',
    });
  }

  // Upcoming meeting today → remind the agent to prep.
  const nextMeeting = (meetings || []).find((m) => m.dueAt && new Date(m.dueAt).getTime() > now);
  if (nextMeeting) {
    out.push({
      key: `meet-${nextMeeting.id}`,
      t: `הכינו את הפגישה: ${nextMeeting.title || 'פגישה'}`,
      sub: nextMeeting.description || 'סדר עדיפויות · נכסים · היסטוריית לקוח',
      tag: 'gold', action: 'פתח סיכום',
    });
  }

  // Deals sitting in NEGOTIATION for more than a week → nudge.
  const stuckDeals = (deals || []).filter((d) => {
    const stage = (d.stage || d.status || '').toUpperCase();
    if (stage !== 'NEGOTIATION') return false;
    const touched = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
    return touched > 0 && now - touched > 7 * 24 * 60 * 60 * 1000;
  });
  for (const d of stuckDeals.slice(0, 1)) {
    out.push({
      key: `deal-${d.id}`,
      t: `עסקה במו״מ ללא זיז שבוע — ${d.propertyStreet || 'עסקה'}`,
      sub: 'מומלץ להתקשר לשני הצדדים ולסגור מועד חתימה.',
      tag: 'warm', action: 'פתח עסקה',
    });
  }

  // Stale properties (active + no updatedAt touch in 14 days).
  const staleProps = (properties || []).filter((p) => {
    const touched = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
    return (p.status || '').toUpperCase() === 'ACTIVE' && touched > 0
      && now - touched > 14 * 24 * 60 * 60 * 1000;
  });
  for (const p of staleProps.slice(0, 1)) {
    out.push({
      key: `prop-${p.id}`,
      t: `רענן את הנכס ${p.street || ''}${p.street && p.city ? ', ' : ''}${p.city || ''}`,
      sub: 'לא נגעתם בנכס יותר משבועיים — מומלץ לעדכן מחיר / תמונות.',
      tag: 'ink', action: 'ערוך נכס',
    });
  }

  return out.slice(0, 5);
}

export default function Dashboard() {
  const { user } = useAuth();
  const isMobile = useViewportMobile(820);
  const [leads, setLeads] = useState([]);
  const [properties, setProperties] = useState([]);
  const [deals, setDeals] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [premiumOpen, setPremiumOpen] = useState(false);

  // PERF-007 — replaces a 4-way unbounded fan-out (listLeads,
  // listProperties, listDeals, listReminders) with one aggregated
  // /dashboard/summary call. The backend serves counts + ≤5-row
  // top-lists from `count()` queries instead of marshaling the
  // entire book. Falls back to the legacy fan-out if the new
  // endpoint isn't available (older backend / native iOS clients
  // hitting a stale build).
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.dashboardSummary?.();
        if (cancelled) return;
        if (s && s.counts) {
          setSummary(s);
          return;
        }
      } catch { /* fall through to legacy */ }
      try {
        const [lRes, pRes, dRes, mRes] = await Promise.all([
          api.listLeads?.().catch(() => null),
          api.listProperties?.({ mine: '1' }).catch(() => null),
          api.listDeals?.().catch(() => null),
          (api.listReminders?.({ upcoming: '1' }) || Promise.resolve(null)).catch(() => null),
        ]);
        if (cancelled) return;
        setLeads(lRes?.items || []);
        setProperties(pRes?.items || []);
        setDeals(dRes?.items || []);
        setMeetings(mRes?.items || []);
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // When the server-aggregated summary is available, surface its
  // top-5 lists directly. Each setter still keeps an `items`-shaped
  // array so the rest of the file (hotLeads memo, todaysReminders,
  // computeAiPriorities, kpis) doesn't have to branch on which path
  // populated it.
  useEffect(() => {
    if (!summary) return;
    setLeads(summary.hotLeads || []);
    setMeetings(summary.todayMeetings || []);
    setProperties(summary.staleProperties || []);
    setDeals(summary.stuckDeals || []);
  }, [summary]);

  const hotLeads = useMemo(
    () => leads.filter((l) => (l.status || '').toUpperCase() === 'HOT').slice(0, 4),
    [leads],
  );
  // Today card must only surface reminders whose dueAt falls inside
  // the user's local "today" — backend returns the upcoming window
  // so we filter client-side to stop yesterday bleeding in after
  // midnight.
  const todaysReminders = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    return (meetings || [])
      .filter((m) => {
        if (!m.dueAt) return false;
        if (m.status && m.status !== 'PENDING') return false;
        const t = new Date(m.dueAt).getTime();
        return t >= startOfDay && t < endOfDay;
      })
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [meetings]);
  const aiPriorities = useMemo(
    () => computeAiPriorities({ leads, properties, deals, meetings }),
    [leads, properties, deals, meetings],
  );
  // PERF-007 — when the aggregated /dashboard/summary is in play, the
  // KPI numbers must come from `summary.counts`, NOT from the top-5
  // arrays we now hold in `leads`/`properties`/etc. Falls back to
  // `<list>.length` for the legacy fan-out path.
  const kpis = useMemo(() => {
    const c = summary?.counts;
    return [
      { l: 'לידים פעילים',   v: c?.leads ?? leads.length,           i: Users },
      { l: 'פגישות השבוע',   v: c?.todayMeetings ?? meetings.length, i: CalendarIcon },
      { l: 'עסקאות פתוחות', v: c?.deals ?? deals.length,             i: Banknote },
      { l: 'נכסים פעילים',   v: c?.properties ?? properties.length,  i: BarChart2 },
    ];
  }, [summary, leads.length, meetings.length, deals.length, properties.length]);

  const firstName = (user?.displayName || user?.email?.split('@')[0] || 'אדם').split(' ')[0];
  const todayStr = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  // Time-of-day greeting — local machine time, not server clock.
  //   05:00-11:59 → בוקר טוב ☀️
  //   12:00-16:59 → צהריים טובים 🌤️
  //   17:00-20:59 → ערב טוב 🌇
  //   21:00-04:59 → לילה טוב 🌙
  const { greeting, greetingEmoji } = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12)  return { greeting: 'בוקר טוב',    greetingEmoji: '☀️' };
    if (h >= 12 && h < 17) return { greeting: 'צהריים טובים', greetingEmoji: '🌤️' };
    if (h >= 17 && h < 21) return { greeting: 'ערב טוב',      greetingEmoji: '🌇' };
    return                         { greeting: 'לילה טוב',    greetingEmoji: '🌙' };
  })();

  const navigate = useNavigate();
  // Sprint 10 — premium users skip the upsell modal and go straight
  // to the real AI surface. Free-tier users still see the old teaser.
  const openPremium = () => {
    if (user?.isPremium) { navigate('/ai'); return; }
    setPremiumOpen(true);
  };

  return (
    <div dir="rtl" style={{
      ...FONT,
      // Mobile pass: the design's desktop padding + 30-px greeting +
      // 190-px min KPI column all overflow on iPhone SE-class widths.
      // Shrink just the mobile branch; desktop is untouched.
      padding: isMobile ? '18px 14px 28px' : 28,
      color: DT.ink, minHeight: '100%',
    }}>
      {/* Greeting */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 12, marginBottom: isMobile ? 16 : 20, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0, flex: isMobile ? 1 : 'unset' }}>
          <div style={{ fontSize: isMobile ? 11 : 12, color: DT.muted, fontWeight: 600 }}>{todayStr}</div>
          <h1 style={{
            fontSize: isMobile ? 22 : 30,
            fontWeight: 800,
            letterSpacing: isMobile ? -0.5 : -0.8,
            margin: '4px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {greeting} {firstName} {greetingEmoji}
          </h1>
          <div style={{ fontSize: isMobile ? 12 : 14, color: DT.muted, marginTop: 4, lineHeight: 1.5 }}>
            יש לכם <strong style={{ color: DT.gold }}>{meetings.length} פגישות</strong> השבוע ·{' '}
            <strong style={{ color: DT.gold }}>{hotLeads.length} לידים חמים</strong> ממתינים למענה
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* User ask 2026-04-25 — /activity moved out of the sidebar;
              add the quick-access link here so agents still reach the
              event stream in one click from the dashboard. */}
          <Link
            to="/activity"
            title="יומן פעילות"
            style={{
              ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
              padding: isMobile ? '8px 11px' : '10px 14px', borderRadius: 10,
              fontSize: isMobile ? 12 : 13, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              color: DT.ink, textDecoration: 'none',
            }}
          >
            <ActivityIcon size={14} /> {isMobile ? 'פעילות' : 'יומן פעילות'}
          </Link>
          <button
            type="button"
            onClick={openPremium}
            style={{
              ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
              padding: isMobile ? '8px 11px' : '10px 14px', borderRadius: 10, cursor: 'pointer',
              fontSize: isMobile ? 12 : 13, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
            }}
          >
            <Sparkles size={14} /> {isMobile ? 'Estia AI' : 'שאל את Estia AI'}
          </button>
        </div>
      </div>

      {/* KPI row — 2×2 grid on mobile so four chips fit without
          horizontal scroll; min-column is 140 there vs 190 on desktop. */}
      <div style={{
        display: 'grid', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 16 : 20,
        gridTemplateColumns: isMobile
          ? 'repeat(2, minmax(0, 1fr))'
          : 'repeat(auto-fit, minmax(190px, 1fr))',
      }}>
        {kpis.map((k, i) => (
          <DCard key={i} compact={isMobile}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                fontSize: isMobile ? 11 : 12, color: DT.muted, fontWeight: 600,
                lineHeight: 1.35, minWidth: 0,
              }}>{k.l}</div>
              <span style={{
                color: DT.gold, background: DT.goldSoft,
                width: isMobile ? 26 : 32, height: isMobile ? 26 : 32, borderRadius: 8,
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}><k.i size={isMobile ? 13 : 15} /></span>
            </div>
            <div style={{
              fontSize: isMobile ? 22 : 30, fontWeight: 800,
              letterSpacing: isMobile ? -0.5 : -0.8, marginTop: isMobile ? 4 : 8,
            }}>{k.v}</div>
          </DCard>
        ))}
      </div>

      {/* Main grid: AI priorities + today's schedule.
          Perf 2026-04-25: reserve a minHeight so the bottom pipeline +
          hot-leads grid doesn't jump when API data lands. Lighthouse
          flagged a CLS score of ~0.17 on this surface; the reserve
          eliminates the visible push. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: 14, marginBottom: 14,
        minHeight: 360,
      }}>
        <DCard>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14, gap: 8, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontSize: 10, color: DT.goldDark, fontWeight: 700, letterSpacing: 1,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Sparkles size={11} /> ESTIA AI · סדר עדיפויות היום
                <span style={{
                  marginInlineStart: 6,
                  background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                  color: DT.ink, padding: '1px 6px', borderRadius: 99,
                  fontSize: 9, letterSpacing: 0.4,
                }}>PREMIUM</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                {aiPriorities.length > 0
                  ? `${aiPriorities.length} פעולות שיזיזו אתכם קדימה היום`
                  : 'אין פעולות דחופות כרגע'}
              </div>
            </div>
          </div>
          {aiPriorities.length === 0 && (
            <div style={{ fontSize: 13, color: DT.muted, padding: '16px 0', lineHeight: 1.7 }}>
              אין עדיפויות לטיפול עכשיו. מרגע שיופיעו לידים חמים, פגישות או
              עסקאות במו״מ — ה-AI יסדר אותם כאן לפי דחיפות.
            </div>
          )}
          {aiPriorities.map((r, i) => (
            <div key={r.key} style={{
              display: 'flex', gap: 14, alignItems: 'center',
              padding: '12px 0',
              borderBottom: i === aiPriorities.length - 1 ? 'none' : `1px solid ${DT.border}`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: DT.cream3,
                color: DT.muted, display: 'grid', placeItems: 'center',
                fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.t}
                  {r.tag === 'hot'  && <Chip tone="hot">דחוף</Chip>}
                  {r.tag === 'gold' && <Chip tone="gold">AI</Chip>}
                </div>
                <div style={{ fontSize: 11, color: DT.muted, marginTop: 1 }}>{r.sub}</div>
              </div>
              <button
                type="button"
                onClick={openPremium}
                style={{
                  ...FONT,
                  background: i === 0
                    ? `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`
                    : DT.white,
                  border: i === 0 ? 'none' : `1px solid ${DT.borderStrong}`,
                  padding: '7px 12px', borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', color: DT.ink, whiteSpace: 'nowrap',
                }}
              >{r.action}</button>
            </div>
          ))}
        </DCard>

        <DCard>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              היום · {todaysReminders.length || 0} תזכורות
            </div>
            <Link to="/reminders" style={{ color: DT.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              יומן מלא
            </Link>
          </div>
          {todaysReminders.length === 0 && (
            <div style={{ fontSize: 13, color: DT.muted, padding: '12px 0' }}>
              אין תזכורות להיום — הוסיפו תזכורת כדי לראות אותה כאן.
            </div>
          )}
          {todaysReminders.slice(0, 4).map((m, i) => {
            const when = m.dueAt ? new Date(m.dueAt) : null;
            const time = when
              ? when.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
              : '—';
            const isNext = i === 0;
            return (
              <div key={m.id || i} style={{
                display: 'flex', gap: 10, padding: '10px 0',
                borderBottom: i === Math.min(3, todaysReminders.length - 1) ? 'none' : `1px solid ${DT.border}`,
                position: 'relative',
              }}>
                {isNext && (
                  <div style={{
                    // Sits flush inside the card (was bleeding past the
                    // edge at insetInlineEnd: -18). Keep a small outside
                    // gap with `insetInlineEnd: 2` so it still reads as a
                    // ribbon, not a full-width label.
                    position: 'absolute', insetInlineEnd: 2, top: '50%',
                    transform: 'translateY(-50%)',
                    background: DT.gold, color: DT.ink, fontSize: 9, fontWeight: 800,
                    padding: '2px 7px', borderRadius: 99,
                    boxShadow: '0 2px 6px rgba(180,139,76,0.3)',
                  }}>הבא</div>
                )}
                <div style={{ width: 54, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 15, fontWeight: 800, color: DT.goldDark,
                    letterSpacing: -0.3,
                  }}>{time}</div>
                </div>
                <div style={{
                  width: 2, background: isNext ? DT.gold : DT.border,
                  borderRadius: 99, flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{m.title || 'פגישה'}</div>
                  {m.description && (
                    <div style={{
                      fontSize: 11, color: DT.muted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{m.description}</div>
                  )}
                </div>
              </div>
            );
          })}
        </DCard>
      </div>

      {/* Bottom grid: pipeline + hot leads.
          Perf 2026-04-25: matched min-height so the API-arrival fill
          doesn't shift this row either. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 14,
        minHeight: 320,
      }}>
        <DCard>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>צינור עסקאות</div>
            <Link to="/deals" style={{ color: DT.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              לכל העסקאות
            </Link>
          </div>
          <Pipeline deals={deals} />
        </DCard>

        <DCard>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>לידים חמים</div>
            <Link to="/customers" style={{ color: DT.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              הכול
            </Link>
          </div>
          {hotLeads.length === 0 && (
            <div style={{ fontSize: 13, color: DT.muted, padding: '12px 0' }}>
              אין לידים חמים כרגע. הוסיפו לידים בעמוד <Link to="/customers" style={{ color: DT.gold }}>לידים</Link>.
            </div>
          )}
          {hotLeads.map((l) => (
            <Link
              key={l.id}
              to={`/customers/${l.id}`}
              style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '9px 0', borderBottom: `1px solid ${DT.border}`,
                textDecoration: 'none', color: DT.ink,
              }}
            >
              <Avatar name={l.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{l.name}</div>
                <div style={{ fontSize: 11, color: DT.muted }}>
                  {[l.city, l.priceRangeLabel].filter(Boolean).join(' · ') || 'ליד חם'}
                </div>
              </div>
              {l.budget && (
                <div style={{ fontSize: 11, color: DT.gold, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ₪{Math.round(l.budget / 1000)}K
                </div>
              )}
            </Link>
          ))}
        </DCard>
      </div>

      {premiumOpen && <PremiumModal onClose={() => setPremiumOpen(false)} />}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────
function DCard({ children, style = {}, pad = 18, compact = false }) {
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: compact ? 12 : pad, ...style,
    }}>{children}</div>
  );
}

function Avatar({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
      color: DT.ink, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: size * 0.4, flexShrink: 0,
    }}>{name ? name.charAt(0) : '?'}</div>
  );
}

function Chip({ children, tone = 'ink' }) {
  const map = {
    hot: [DT.hot, 'rgba(185,28,28,0.12)'],
    warm: [DT.warm, 'rgba(180,83,9,0.12)'],
    cold: [DT.cold, 'rgba(71,85,105,0.12)'],
    gold: [DT.goldDark, DT.goldSoft],
    success: [DT.success, 'rgba(21,128,61,0.12)'],
    ink: [DT.ink, DT.cream3],
  };
  const [c, bg] = map[tone] || map.ink;
  return (
    <span style={{
      color: c, background: bg, borderRadius: 99, fontWeight: 700,
      padding: '2px 8px', fontSize: 10,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>{children}</span>
  );
}

function Pipeline({ deals }) {
  // Match the real Deal.status enum the backend writes. The previous
  // keys (NEW / VIEWING / OFFER / NEGOTIATION / CONTRACT) never
  // matched anything, so every bar read 0. Bars now fill proportional
  // to the bucket's share of the busiest stage.
  const stages = [
    { key: 'NEGOTIATING',      l: 'משא ומתן' },
    { key: 'WAITING_MORTGAGE', l: 'אישור משכנתא' },
    { key: 'PENDING_CONTRACT', l: 'לקראת חתימה' },
    { key: 'SIGNED',           l: 'נחתמה' },
    { key: 'CLOSED',           l: 'נסגרה' },
  ];
  const buckets = stages.map((s) => {
    const matching = deals.filter((d) => String(d.status || '').toUpperCase() === s.key);
    const sum = matching.reduce((acc, d) => (
      acc + (d.closedPrice || d.marketingPrice || d.dealValue || d.price || 0)
    ), 0);
    return { ...s, n: matching.length, sum };
  });
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const fmt = (n) => n >= 1_000_000
    ? `₪${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `₪${Math.round(n / 1_000)}K`
      : n > 0
        ? `₪${n.toLocaleString('he-IL')}`
        : '—';
  return (
    <>
      {buckets.map((s, i) => {
        const pct = s.n === 0 ? 4 : Math.max(8, Math.round((s.n / max) * 100));
        return (
          <div key={s.key} style={{ marginBottom: i === buckets.length - 1 ? 0 : 10 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4,
            }}>
              <span style={{ fontWeight: 600 }}>{s.l} · {s.n}</span>
              <span style={{ color: DT.gold, fontWeight: 700 }}>{fmt(s.sum)}</span>
            </div>
            <div style={{ background: DT.cream3, height: 8, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: s.n === 0
                  ? DT.cream2
                  : `linear-gradient(90deg, ${DT.goldLight}, ${DT.gold})`,
                transition: 'width 420ms cubic-bezier(.2,.7,.2,1)',
              }} />
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Premium-only popup ─────────────────────────────────────
function PremiumModal(props) {
  return <Portal><PremiumModalInner {...props} /></Portal>;
}
function PremiumModalInner({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20,17,13,0.55)', backdropFilter: 'blur(2px)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...FONT, background: DT.cream, color: DT.ink,
          borderRadius: 18, maxWidth: 420, width: '100%',
          boxShadow: '0 30px 80px rgba(20,17,13,0.28)',
          border: `2px solid ${DT.gold}`, position: 'relative',
          padding: '28px 26px 22px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 12, insetInlineStart: 12,
            background: 'transparent', border: 'none', color: DT.muted,
            cursor: 'pointer', padding: 6, display: 'inline-flex',
          }}
        ><X size={16} /></button>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          marginBottom: 12,
        }}><Star size={22} /></div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 800, color: DT.goldDark,
          letterSpacing: 1, marginBottom: 6,
        }}>
          <Sparkles size={12} /> ESTIA AI · PREMIUM
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 8px' }}>
          זמין במסלול Premium
        </h2>
        <p style={{ fontSize: 14, color: DT.muted, lineHeight: 1.7, margin: '0 0 18px' }}>
          כל פעולות ה-AI — סדר עדיפויות חכם, תיאורי נכסים, התאמת לידים,
          וסיכומי פגישות — כלולות במסלול Premium. שדרוג בחצי דקה, ביטול בכל רגע.
        </p>
        <a
          href="mailto:hello@estia.co.il?subject=שדרוג ל-Estia Premium"
          style={{
            ...FONT, display: 'block', textAlign: 'center',
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink, padding: '13px 18px', borderRadius: 12,
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
            boxShadow: '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >שדרג ל-Premium</a>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...FONT, width: '100%',
            background: 'transparent', border: 'none',
            color: DT.muted, fontSize: 13, fontWeight: 600,
            padding: '10px', marginTop: 8, cursor: 'pointer',
          }}
        >אולי מאוחר יותר</button>
      </div>
    </div>
  );
}
