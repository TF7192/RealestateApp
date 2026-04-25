// Admin platform overview. Visible only to talfuks1234@gmail.com.
// Single page with three sections:
//   1. Platform-wide KPIs (users / properties / leads / AI spend MTD)
//   2. AI usage breakdown (per user + per feature, MTD)
//   3. Per-user table (assets, leads, deals, reminders, AI MTD spend)
//
// All data comes from /api/admin/{overview,users-summary} and
// /api/office/ai-usage (the latter is now admin-only).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon, Users, Building2, Banknote, Bell,
  MessageSquare, Sparkles, ShieldCheck, Crown,
} from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c', info: '#2563eb',
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

const fmtUsd = (n) => `$${(n || 0).toFixed(2)}`;

export default function Admin() {
  const [overview, setOverview] = useState(null);
  const [usage, setUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען נתוני אדמין…
      </div>
    );
  }

  return (
    <div dir="rtl" style={{
      ...FONT, color: DT.ink, padding: 28, minHeight: '100%',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 44, height: 44, borderRadius: 12,
          background: DT.ink, color: DT.cream,
          display: 'grid', placeItems: 'center',
        }}><ShieldCheck size={20} /></span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            לוח בקרה — Admin
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            סקירה כוללת של המערכת — משתמשים, נכסים, לידים, וצריכת AI.
          </div>
        </div>
        <Link
          to="/admin/chats"
          style={{
            ...FONT, marginInlineStart: 'auto',
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink, padding: '9px 14px', borderRadius: 10,
            fontSize: 13, fontWeight: 800, textDecoration: 'none',
            display: 'inline-flex', gap: 6, alignItems: 'center',
            boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
          }}
        >
          <MessageSquare size={14} /> שיחות תמיכה
        </Link>
      </header>

      {/* KPI grid */}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}>
        <Kpi icon={<Users size={16} />}
             label="משתמשים פעילים"
             value={overview?.users?.total || 0}
             sub={`${overview?.users?.agents || 0} סוכנים · ${overview?.users?.owners || 0} מנהלים · ${overview?.users?.premium || 0} פרימיום`} />
        <Kpi icon={<Building2 size={16} />}
             label="נכסים"
             value={overview?.properties || 0}
             sub={`${overview?.newThisWeek?.properties || 0} נוספו השבוע`} />
        <Kpi icon={<ActivityIcon size={16} />}
             label="לידים"
             value={overview?.leads || 0}
             sub={`${overview?.newThisWeek?.leads || 0} נוספו השבוע`} />
        <Kpi icon={<Banknote size={16} />}
             label="עסקאות"
             value={overview?.deals || 0}
             sub={`${overview?.offices || 0} משרדים פעילים`} />
        <Kpi icon={<Bell size={16} />}
             label="תזכורות"
             value={overview?.reminders || 0} />
        <Kpi icon={<Sparkles size={16} />}
             label="צריכת AI החודש"
             value={fmtUsd(overview?.ai?.thisMonth?.costUsd)}
             sub={`${overview?.ai?.thisMonth?.callCount || 0} קריאות · ${overview?.ai?.thisMonth?.activeOffices || 0} משרדים פעילים`}
             gold />
        <Kpi icon={<Sparkles size={16} />}
             label="צריכת AI מצטברת"
             value={fmtUsd(overview?.ai?.allTime?.costUsd)}
             sub={`${overview?.ai?.allTime?.callCount || 0} קריאות מאז ההשקה`} />
      </div>

      {/* AI usage breakdown (full system) */}
      {usage && (
        <section style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkles size={16} style={{ color: DT.goldDark }} />
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              צריכת AI · {usage.month}
            </h2>
            <span style={{
              marginInlineStart: 'auto', fontSize: 18, fontWeight: 800, color: DT.goldDark,
            }}>{fmtUsd(usage.totalUsd)}</span>
          </div>
          {usage.features?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {usage.features.map((f) => (
                <span key={f.feature} style={{
                  padding: '6px 10px', borderRadius: 99, background: DT.cream3,
                  fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center',
                }}>
                  <span>{FEATURE_LABELS[f.feature] || f.feature}</span>
                  <bdi style={{ color: DT.goldDark, direction: 'ltr' }}>{fmtUsd(f.costUsd)}</bdi>
                  <span style={{ color: DT.muted, fontWeight: 500 }}>· {f.callCount}</span>
                </span>
              ))}
            </div>
          )}
          {usage.members?.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {usage.members.filter((m) => m.costUsd > 0).slice(0, 12).map((m) => (
                <li key={m.id} style={memberRow()}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: DT.ink }}>
                    {m.displayName || m.email}
                    {m.role === 'OWNER' && (
                      <span style={{ marginInlineStart: 6, color: DT.goldDark, fontSize: 11 }}>· מנהל/ת</span>
                    )}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline', fontVariantNumeric: 'tabular-nums' }}>
                    <bdi style={{ fontSize: 11, color: DT.muted }}>{m.callCount} קריאות</bdi>
                    <bdi style={{ fontSize: 13, fontWeight: 800, color: DT.ink, direction: 'ltr' }}>{fmtUsd(m.costUsd)}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, color: DT.muted }}>אין שימוש ב-AI החודש.</div>
          )}
        </section>
      )}

      {/* Per-user table */}
      <section style={card()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Users size={16} style={{ color: DT.goldDark }} />
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>משתמשים — סיכום אחרונים</h2>
          <Link to="/admin/users" style={{
            marginInlineStart: 'auto', fontSize: 12, fontWeight: 700,
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
              {users.map((u) => (
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
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, sub, gold }) {
  return (
    <div style={{
      ...card(),
      display: 'flex', flexDirection: 'column', gap: 6,
      borderColor: gold ? DT.gold : DT.border,
      background: gold ? DT.goldSoft : DT.white,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, color: DT.ink, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: DT.muted, lineHeight: 1.5 }}>{sub}</span>}
    </div>
  );
}

function card(extra = {}) {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 16,
    boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
    ...extra,
  };
}
function memberRow() {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, padding: '6px 10px', borderRadius: 8, background: DT.cream4,
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
