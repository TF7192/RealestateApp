// Team → agent detail page — opens when the OWNER clicks a row on
// /team. Shows the agent's profile, KPI strip, active property
// inventory, active leads, and recent deals so the manager has one
// screen with full intel on the agent.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Building2, Users, Banknote, Mail, Phone, MessageCircle,
  AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import { formatPhone } from '../lib/phone';
import { relativeDate } from '../lib/relativeDate';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', hot: '#b91c1c', warm: '#b45309', cold: '#475569',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function formatPrice(p) {
  if (p == null) return '—';
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 1_000)     return `₪${Math.round(p / 1_000)}K`;
  return `₪${p.toLocaleString('he-IL')}`;
}

export default function TeamAgentDetail() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.teamAgent(agentId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'שגיאה בטעינת הסוכן');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (err || !data) {
    return (
      <div dir="rtl" style={{
        ...FONT, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        color: DT.ink,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.hot,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {err || 'סוכן לא נמצא במשרד שלך'}
        </div>
        <button type="button" onClick={() => navigate('/team')} style={ghostBtn()}>
          <ArrowRight size={14} /> חזרה לצוות
        </button>
      </div>
    );
  }

  const { agent, properties, leads, deals, totals } = data;
  const activeProps = properties.filter((p) => p.status === 'ACTIVE').length;
  const activeLeads = leads.length;
  const initial = (agent.displayName || '?').charAt(0);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Back */}
      <Link to="/team" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        marginBottom: 16,
      }}>
        <ArrowRight size={16} /> חזרה לצוות
      </Link>

      {/* Header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 99, flexShrink: 0,
          background: agent.avatarUrl ? `url(${agent.avatarUrl}) center/cover`
            : `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          fontWeight: 800, fontSize: 28,
        }}>{agent.avatarUrl ? '' : initial}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            {agent.displayName || agent.email}
          </div>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {agent.agentProfile?.title && <span>{agent.agentProfile.title}</span>}
            {agent.agentProfile?.agency && <span>· {agent.agentProfile.agency}</span>}
            {agent.role === 'OWNER' && (
              <span style={{
                background: DT.goldSoft, color: DT.goldDark,
                padding: '2px 8px', borderRadius: 99, fontWeight: 700, fontSize: 11,
              }}>מנהל/ת משרד</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {agent.phone && (
              <a href={`tel:${agent.phone}`} style={secondaryBtn()}>
                <Phone size={13} /> {formatPhone(agent.phone)}
              </a>
            )}
            {agent.phone && (
              <a
                href={`https://wa.me/${agent.phone.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                style={secondaryBtn()}
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
            {agent.email && (
              <a href={`mailto:${agent.email}`} style={secondaryBtn()}>
                <Mail size={13} /> {agent.email}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <Kpi icon={<Banknote size={16} />} label="עסקאות חתומות" value={totals.closedCount} />
        <Kpi icon={<Banknote size={16} />} label="סה״כ ערך עסקאות" value={formatPrice(totals.volume)} />
        <Kpi icon={<Banknote size={16} />} label="עמלות" value={formatPrice(totals.commissions)} color={DT.success} />
        <Kpi icon={<Building2 size={16} />} label="נכסים פעילים" value={activeProps} />
        <Kpi icon={<Users size={16} />} label="לידים פעילים" value={activeLeads} />
      </div>

      {/* Two-col grid: properties + leads */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
      }}>
        <Section title="נכסים בשיווק" count={properties.length} icon={<Building2 size={16} />}>
          {properties.length === 0 ? (
            <Empty>אין נכסים לסוכן זה</Empty>
          ) : (
            <ul style={listReset}>
              {properties.map((p) => (
                <li key={p.id}>
                  <Link to={`/properties/${p.id}`} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {[p.street, p.city].filter(Boolean).join(', ') || 'נכס ללא כתובת'}
                      </div>
                      <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                        {[p.type, p.rooms ? `${p.rooms} חד׳` : null, p.sqm ? `${p.sqm} מ״ר` : null, p.status]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: DT.goldDark }}>
                      {formatPrice(p.marketingPrice)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="לידים פעילים" count={leads.length} icon={<Users size={16} />}>
          {leads.length === 0 ? (
            <Empty>אין לידים פעילים</Empty>
          ) : (
            <ul style={listReset}>
              {leads.map((l) => (
                <li key={l.id}>
                  <Link to={`/customers/${l.id}`} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{l.name || '—'}</div>
                      <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                        {[l.phone ? formatPhone(l.phone) : null, l.city,
                          l.lookingFor === 'RENT' ? 'שכירות' : 'קנייה',
                          l.budget ? formatPrice(l.budget) : null]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <StatusChip status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Recent deals */}
      <Section title="עסקאות אחרונות" count={deals.length} icon={<Banknote size={16} />} style={{ marginTop: 16 }}>
        {deals.length === 0 ? (
          <Empty>עוד אין עסקאות</Empty>
        ) : (
          <ul style={listReset}>
            {deals.map((d) => (
              <li key={d.id}>
                <Link to={`/deals/${d.id}`} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {[d.propertyStreet, d.city].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                      {d.status} · {d.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'} ·{' '}
                      {d.category === 'RENT' ? 'השכרה' : 'מכירה'} ·{' '}
                      {d.signedAt ? relativeDate(d.signedAt).label : relativeDate(d.updateDate).label}
                    </div>
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {formatPrice(d.closedPrice || d.marketingPrice)}
                    </div>
                    {d.commission != null && (
                      <div style={{ fontSize: 11, color: DT.success, fontWeight: 700 }}>
                        עמלה: {formatPrice(d.commission)}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>{label}</div>
        <span style={{
          color: DT.gold, background: DT.goldSoft,
          width: 28, height: 28, borderRadius: 8,
          display: 'grid', placeItems: 'center',
        }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: color || DT.ink }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, count, icon, style, children }) {
  return (
    <section style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: 20, ...(style || {}),
    }}>
      <h3 style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 14, fontWeight: 800, margin: '0 0 12px',
      }}>
        {icon} {title} <span style={{
          color: DT.muted, fontWeight: 700, fontSize: 12,
        }}>· {count}</span>
      </h3>
      {children}
    </section>
  );
}

const listReset = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
};
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 10,
  background: DT.cream4, border: `1px solid ${DT.border}`,
  textDecoration: 'none', color: DT.ink,
};

function Empty({ children }) {
  return (
    <div style={{
      fontSize: 13, color: DT.muted, padding: '14px 0', textAlign: 'center',
    }}>{children}</div>
  );
}

function StatusChip({ status }) {
  const s = (status || '').toUpperCase();
  const map = {
    HOT:  { label: '🔥 חם',  color: DT.hot,  bg: 'rgba(185,28,28,0.12)' },
    WARM: { label: 'פושר',    color: DT.warm, bg: 'rgba(180,83,9,0.12)' },
    COLD: { label: 'קר',      color: DT.cold, bg: 'rgba(71,85,105,0.12)' },
  };
  const cfg = map[s];
  if (!cfg) return null;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 99, fontWeight: 700, fontSize: 10,
      padding: '2px 8px', flexShrink: 0,
    }}>{cfg.label}</span>
  );
}

function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '7px 11px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
