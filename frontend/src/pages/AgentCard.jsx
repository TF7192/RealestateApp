// AgentCard — the logged-in agent's public-ish "business card" surface.
//
// Sprint 7. Reuses the existing VCardQr component (same one embedded in
// Profile + the public /a/:agentId portal) so the QR-code handoff is
// identical everywhere. Stats are derived client-side from the same
// endpoints Dashboard already hits (listProperties mine=1, listDeals)
// — no new backend surface.
//
// The share surface follows the "share dialog if available, else
// navigator.share" convention from the task brief: we use the existing
// native/share.js helper which already prefers the OS share sheet on
// iOS and falls back to navigator.share / clipboard on web.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Phone, Mail, MessageCircle, Share2,
  Download, Building2, IdCard, Award, CalendarDays,
  Home as HomeIcon, CheckCircle2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import VCardQr, { buildVCard } from '../components/VCardQr';
import { waUrl, telUrl } from '../lib/waLink';
import { shareSheet } from '../native/share';

// Cream & Gold — inline tokens, matching Profile.jsx / Dashboard.jsx.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Quarter bounds — first day of the current calendar quarter through now.
function quarterStart(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).getTime();
}

export default function AgentCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [properties, setProperties] = useState([]);
  const [deals, setDeals] = useState([]);

  // Public-ish URL the QR encodes + the Share button hands off. Same
  // logic as Profile.jsx — prefer the slug route when present, else fall
  // back to /a/:id so a freshly-signed-up agent without a slug still has
  // a valid share target.
  const publicUrl = useMemo(() => {
    if (!user) return '';
    return user.slug
      ? `${window.location.origin}/agents/${encodeURI(user.slug)}`
      : `${window.location.origin}/a/${user.id}`;
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, dRes] = await Promise.all([
          api.listProperties?.({ mine: '1' }).catch(() => null),
          api.listDeals?.().catch(() => null),
        ]);
        if (cancelled) return;
        setProperties(pRes?.items || []);
        setDeals(dRes?.items || []);
      } catch { /* empty state handles it */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stats — all computed locally from records the agent already owns.
  const stats = useMemo(() => {
    const activeCount = properties.filter(
      (p) => (p.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length;

    const qStart = quarterStart();
    const closedQtd = deals.filter((d) => {
      const s = (d.status || d.stage || '').toUpperCase();
      if (s !== 'CLOSED' && s !== 'SIGNED') return false;
      const t = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
      return t >= qStart;
    }).length;

    // "Years in business" — derived from the oldest property / deal the
    // agent owns. No server field for this today (`User.createdAt` isn't
    // exposed in the /me envelope), so we approximate from the earliest
    // record we can see. Floors to 1 once there's any signal, drops the
    // chip entirely when we have nothing to show.
    const candidates = [
      ...properties.map((p) => p.createdAt || p.onMarketAt).filter(Boolean),
      ...deals.map((d) => d.createdAt).filter(Boolean),
    ].map((v) => new Date(v).getTime()).filter((n) => !Number.isNaN(n));
    const oldest = candidates.length ? Math.min(...candidates) : null;
    const years = oldest
      ? Math.max(1, Math.floor((Date.now() - oldest) / (365.25 * 24 * 3600 * 1000)))
      : null;

    return [
      { k: 'active', icon: HomeIcon, label: 'נכסים פעילים', value: activeCount },
      { k: 'closed', icon: CheckCircle2, label: 'עסקאות סגורות ברבעון', value: closedQtd },
      ...(years
        ? [{ k: 'years', icon: CalendarDays, label: 'שנות ניסיון', value: years }]
        : []),
    ];
  }, [properties, deals]);

  // Download helper — uses the same buildVCard we import from VCardQr,
  // so "שמור איש קשר" on the QR block and "שמור את הכרטיס" on the
  // action row produce byte-identical .vcf files.
  const downloadVCard = () => {
    const vcard = buildVCard(user || {});
    try {
      const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(user?.displayName || 'contact').replace(/\s+/g, '_')}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      // Last-ditch data: URL so the download still fires on restricted
      // WKWebView builds.
      const href = `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
      const a = document.createElement('a');
      a.href = href;
      a.download = `${(user?.displayName || 'contact').replace(/\s+/g, '_')}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const onShare = async () => {
    if (!publicUrl) return;
    const title = user?.displayName
      ? `הכרטיס של ${user.displayName}`
      : 'כרטיס סוכן';
    const result = await shareSheet({
      title,
      text: `${title} — ${user?.agentProfile?.agency || ''}`.trim(),
      url: publicUrl,
    });
    if (result === 'copied') toast.info('הקישור הועתק');
  };

  if (!user) return null;

  const agency = user.agentProfile?.agency || '';
  const title  = user.agentProfile?.title  || '';
  const initial = (user.displayName || '?').charAt(0);

  return (
    <div dir="rtl" style={{
      ...FONT, padding: 28, color: DT.ink, minHeight: '100%',
      background: DT.cream,
    }}>
      {/* Back */}
      <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            ...FONT, background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DT.muted, fontSize: 13, fontWeight: 700, padding: 0,
          }}
        >
          <ArrowRight size={16} />
          חזרה
        </button>
      </div>

      {/* Hero card — large avatar + identity + agency */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 16, padding: 24, marginBottom: 16,
        display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
        boxShadow: '0 2px 10px rgba(30,26,20,0.04)',
      }}>
        <div style={{
          width: 112, height: 112, borderRadius: 99,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          fontWeight: 800, fontSize: 44, overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 6px 18px rgba(180,139,76,0.3)',
        }}>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, color: DT.goldDark,
            background: DT.goldSoft, padding: '3px 10px', borderRadius: 99,
            letterSpacing: 0.3, marginBottom: 8,
          }}>
            הכרטיס שלי
          </span>
          <h1 style={{
            fontSize: 30, fontWeight: 800, letterSpacing: -0.6,
            margin: 0, color: DT.ink,
          }}>
            {user.displayName || '—'}
          </h1>
          {(title || agency) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, color: DT.muted, marginTop: 8, flexWrap: 'wrap',
            }}>
              {title && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IdCard size={14} /> {title}
                </span>
              )}
              {title && agency && <span>·</span>}
              {agency && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  <Building2 size={14} /> {agency}
                </span>
              )}
            </div>
          )}
          {user.agentProfile?.license && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: DT.muted, marginTop: 4,
            }}>
              <Award size={12} /> רישיון #{user.agentProfile.license}
            </div>
          )}
        </div>
      </div>

      {/* Stats chips */}
      {stats.length > 0 && (
        <div style={{
          display: 'grid', gap: 10, marginBottom: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}>
          {stats.map(({ k, icon: Icon, label, value }) => (
            <div key={k} style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                background: DT.goldSoft, color: DT.goldDark,
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icon size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 22, fontWeight: 800, color: DT.ink, lineHeight: 1,
                }}>{value}</div>
                <div style={{
                  fontSize: 11, color: DT.muted, marginTop: 4,
                  textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700,
                }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {/* QR card — the QR encodes the vCard so anyone who scans it
            pulls the contact straight into their address book. The same
            component is used on the public /a/:agentId portal; here it
            shows the agent their own QR for "show-and-scan" handoffs in
            person. */}
        <section style={sectionCard()} aria-label="קוד QR">
          <h3 style={sectionTitle()}>
            <Share2 size={16} /> סריקה מהירה
            <span style={sectionSubtitle()}>
              לחץ "שתף" כדי להעביר את הכרטיס ללקוח
            </span>
          </h3>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <VCardQr agent={user} size={180} />
          </div>
          <div style={{
            marginTop: 10, fontSize: 11, color: DT.muted,
            textAlign: 'center', direction: 'ltr',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all',
          }}>
            {publicUrl}
          </div>
        </section>

        {/* Contact channels — fast row of primary actions. */}
        <section style={sectionCard()} aria-label="ערוצי קשר">
          <h3 style={sectionTitle()}>
            <Phone size={16} /> ערוצי קשר
            <span style={sectionSubtitle()}>
              כפתורים מהירים כדי לפתוח שיחה / וואטסאפ / מייל
            </span>
          </h3>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}>
            {user.phone && (
              <a href={telUrl(user.phone)} style={channelBtn()}>
                <Phone size={14} /> חייג
              </a>
            )}
            {user.phone && (
              <a
                href={waUrl(user.phone, '')}
                target="_blank"
                rel="noopener noreferrer"
                style={channelBtn()}
              >
                <MessageCircle size={14} /> וואטסאפ
              </a>
            )}
            {user.email && (
              <a href={`mailto:${user.email}`} style={channelBtn()}>
                <Mail size={14} /> מייל
              </a>
            )}
            <button type="button" onClick={onShare} style={channelBtn()}>
              <Share2 size={14} /> שתף
            </button>
          </div>

          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: `1px solid ${DT.border}`,
            display: 'flex', gap: 8, flexWrap: 'wrap',
          }}>
            <button type="button" onClick={downloadVCard} style={primaryBtn()}>
              <Download size={14} /> שמור את הכרטיס
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={secondaryBtn()}
            >
              <Building2 size={14} /> תצוגה מקדימה
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2, flexWrap: 'wrap',
  };
}
function sectionSubtitle() {
  return {
    fontSize: 12, fontWeight: 500, color: DT.muted, marginInlineStart: 4,
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
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
// "Channel" button — pill-sized, centered, one icon + short label.
function channelBtn() {
  return {
    ...FONT,
    background: DT.cream4, border: `1px solid ${DT.border}`,
    color: DT.ink, padding: '10px 12px', borderRadius: 10,
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none',
  };
}
