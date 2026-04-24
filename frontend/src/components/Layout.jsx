// Layout — 1:1 port of the claude.ai/design bundle's DesktopShell
// (estia-new-project/project/src/desktop/shell.jsx). Espresso
// sidebar, gold accents, two sections (עבודה יומיומית / כלים),
// Premium upgrade card, agent row at bottom, cream topbar with
// search + ליד חדש + bell + WhatsApp.
//
// On narrow viewports (≤900 px) the sidebar becomes a slide-in
// drawer opened by a hamburger in the topbar, and the existing
// MobileTabBar renders at the bottom.
//
// Essential integrations carried over from the previous Layout:
//   - <Outlet /> for routed children
//   - <OfflineBanner /> / <Yad2ScanBanner /> / <MarketScanBanner />
//   - <QuickCreateFab /> (mobile quick create)
//   - <MobileTabBar />
//   - CommandPalette trigger via `window.dispatchEvent('estia:open-palette')`
//
// Dropped (the design doesn't carry them): favorites strip,
// breadcrumb back-button, collapsed sidebar state, MobileMoreSheet
// (superseded by the design's "עוד" tab → /settings).

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, Building2, MessageSquare, Crown, CalendarDays, Sparkles,
  BarChart2, Banknote, Upload, UsersRound, Settings,
  Bell, Search, Plus, MessageCircle, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isPopoutWindow } from '../lib/popout';
import OfflineBanner from './OfflineBanner';
import Yad2ScanBanner from './Yad2ScanBanner';
import MarketScanBanner from './MarketScanBanner';
import QuickCreateFab from './QuickCreateFab';
import MobileTabBar from './MobileTabBar';
import haptics from '../lib/haptics';

// ─── Tokens (shell.jsx / DT verbatim) ──────────────────────
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  sidebarBg: '#544433',
  sidebarInk: '#f5ecd8',
  sidebarMuted: '#bfae91',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);

const PRIMARY_NAV = [
  { k: 'dashboard',   to: '/dashboard',          label: 'לוח בקרה',  Icon: Home },
  { k: 'leads',       to: '/customers',          label: 'לידים',       Icon: Users },
  { k: 'properties',  to: '/properties',         label: 'נכסים',       Icon: Building2 },
  { k: 'owners',      to: '/owners',             label: 'בעלים',       Icon: Crown },
  { k: 'deals',       to: '/deals',              label: 'עסקאות',      Icon: Banknote },
  { k: 'calendar',    to: '/reminders',          label: 'יומן',        Icon: CalendarDays },
  { k: 'ai',          to: '/integrations/yad2',  label: 'Estia AI',    Icon: Sparkles, premium: true },
  { k: 'reports',     to: '/reports',            label: 'דוחות',       Icon: BarChart2 },
  { k: 'inbox',       to: '/admin/chats',        label: 'הודעות',      Icon: MessageSquare, adminOnly: true },
];
const TOOL_NAV = [
  { k: 'import',    to: '/import',    label: 'ייבוא אקסל', Icon: Upload },
  { k: 'team',      to: '/office',    label: 'צוות',        Icon: UsersRound },
  { k: 'settings',  to: '/settings',  label: 'הגדרות',      Icon: Settings },
];

// ─── Responsive hook ────────────────────────────────────────
function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 900px)');
    const h = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h);
    };
  }, []);
  return narrow;
}

export default function Layout({ onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const narrow = useIsNarrow();
  const isAdmin = user && ADMIN_EMAILS.has(user.email);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Public share pages (/p/:id) skip the entire shell.
  if (location.pathname.startsWith('/p/')) return <Outlet />;
  // Popout windows render just the main content.
  if (isPopoutWindow()) {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('is-popout');
    }
    return <main className="main-content is-popout-main"><Outlet /></main>;
  }

  const openPalette = () => {
    haptics.tap();
    window.dispatchEvent(new Event('estia:open-palette'));
  };

  const primary = PRIMARY_NAV.filter((it) => !it.adminOnly || isAdmin);
  const agentName = user?.displayName || user?.email?.split('@')[0] || 'סוכן';
  const agentInitial = (agentName || 'א').slice(0, 1);
  const agentSub = user?.agentProfile?.agency || 'נדל״ן';

  return (
    <div dir="rtl" style={{
      ...FONT, width: '100%', minHeight: '100vh', background: DT.cream,
      display: 'flex', color: DT.ink,
    }}>
      <OfflineBanner />
      <Yad2ScanBanner />
      <MarketScanBanner />

      {!narrow && (
        <Sidebar
          primary={primary} tools={TOOL_NAV}
          location={location}
          agentName={agentName} agentInitial={agentInitial} agentSub={agentSub}
          onLogout={onLogout}
        />
      )}

      {narrow && drawerOpen && (
        <MobileDrawer
          primary={primary} tools={TOOL_NAV}
          location={location}
          agentName={agentName} agentInitial={agentInitial} agentSub={agentSub}
          onLogout={onLogout}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        paddingBottom: narrow ? 72 : 0, // room for the mobile tab bar
      }}>
        <Topbar
          narrow={narrow}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenPalette={openPalette}
          onNewLead={() => navigate('/customers/new')}
          onOpenReminders={() => navigate('/reminders')}
        />
        <main style={{ flex: 1, minWidth: 0, background: DT.cream }}>
          <Outlet />
        </main>
      </div>

      {narrow && <QuickCreateFab />}
      {narrow && <MobileTabBar />}
    </div>
  );
}

// ═══ Sidebar (desktop) ═══════════════════════════════════════════
function Sidebar(p) {
  return (
    <aside style={{
      width: 240, flexShrink: 0, background: DT.sidebarBg, color: DT.sidebarInk,
      display: 'flex', flexDirection: 'column', padding: '22px 0',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      <SidebarInner {...p} />
    </aside>
  );
}

// ═══ Sidebar (mobile drawer) ═════════════════════════════════════
function MobileDrawer(p) {
  return (
    <div
      role="presentation"
      onClick={p.onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(20,17,13,0.45)', backdropFilter: 'blur(2px)',
        animation: 'estia-drawer-fade 160ms ease-out',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, bottom: 0, insetInlineEnd: 0, zIndex: 81,
          width: 260, background: DT.sidebarBg, color: DT.sidebarInk,
          boxShadow: '-20px 0 60px rgba(20,17,13,0.4)',
          display: 'flex', flexDirection: 'column', padding: '22px 0',
          animation: 'estia-drawer-slide 220ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={p.onClose}
          aria-label="סגור תפריט"
          style={{
            position: 'absolute', top: 14, insetInlineStart: 12,
            background: 'transparent', border: 'none', color: DT.sidebarInk,
            cursor: 'pointer', padding: 6, display: 'inline-flex',
          }}
        ><X size={18} /></button>
        <SidebarInner {...p} />
      </aside>
      <style>{`
        @keyframes estia-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes estia-drawer-slide {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function SidebarInner({ primary, tools, location, agentName, agentInitial, agentSub, onLogout }) {
  const isActive = (to) => {
    if (to === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };
  return (
    <>
      {/* Brand */}
      <div style={{
        padding: '0 22px 22px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <NavLink to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink,
            fontWeight: 900, fontSize: 17, letterSpacing: -1,
          }}>E</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>Estia</div>
            <div style={{ fontSize: 10, color: DT.sidebarMuted, fontWeight: 600 }}>נדל״ן AI</div>
          </div>
        </NavLink>
      </div>

      <nav style={{ flex: 1, padding: '14px 12px', overflow: 'auto' }}>
        <SectionLabel>עבודה יומיומית</SectionLabel>
        {primary.map((item) => (
          <NavRow key={item.k} item={item} active={isActive(item.to)} />
        ))}
        <div style={{ height: 12 }} />
        <SectionLabel>כלים</SectionLabel>
        {tools.map((item) => (
          <NavRow key={item.k} item={item} active={isActive(item.to)} tight />
        ))}
      </nav>

      {/* Upgrade card */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          background: `linear-gradient(160deg, rgba(180,139,76,0.25), rgba(180,139,76,0.1))`,
          border: '1px solid rgba(180,139,76,0.3)', borderRadius: 12, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Sparkles size={13} />
            <div style={{ fontSize: 12, fontWeight: 800, color: DT.goldLight }}>Estia Premium</div>
          </div>
          <div style={{ fontSize: 10, color: DT.sidebarInk, opacity: 0.85, lineHeight: 1.5, marginBottom: 8 }}>
            פתיחת AI, תיאורי נכסים אוטומטיים, סיכומי פגישות קוליים ועוד
          </div>
          <a
            href="mailto:hello@estia.co.il?subject=שדרוג ל-Premium"
            style={{
              ...FONT, display: 'block', textAlign: 'center',
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink, border: 'none', padding: '7px 10px', borderRadius: 7,
              fontSize: 11, fontWeight: 800, textDecoration: 'none',
            }}
          >שדרג ל-Premium</a>
        </div>
      </div>

      {/* Agent row */}
      <div style={{
        padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <NavLink to="/profile" style={{
          width: 34, height: 34, borderRadius: 99, background: DT.gold, color: DT.ink,
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
          textDecoration: 'none', flexShrink: 0,
        }}>{agentInitial}</NavLink>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{agentName}</div>
          <div style={{
            fontSize: 10, color: DT.sidebarMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{agentSub}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="התנתקות"
          aria-label="התנתקות"
          style={{
            background: 'transparent', border: 'none', color: DT.sidebarMuted,
            cursor: 'pointer', padding: 4, display: 'inline-flex',
          }}
        ><LogOut size={16} /></button>
      </div>
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: DT.sidebarMuted, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 1,
      padding: '6px 10px',
    }}>{children}</div>
  );
}

function NavRow({ item, active, tight }) {
  const { Icon } = item;
  return (
    <NavLink to={item.to} style={{
      ...FONT,
      width: '100%', display: 'flex', alignItems: 'center', gap: 11,
      padding: tight ? '9px 12px' : '10px 12px',
      background: active ? 'rgba(180,139,76,0.18)' : 'transparent',
      borderRadius: 9, color: active ? DT.goldLight : DT.sidebarInk,
      fontSize: 13, fontWeight: active ? 700 : 500,
      marginBottom: 1, position: 'relative', textDecoration: 'none',
    }}>
      {active && (
        <span style={{
          position: 'absolute', insetInlineEnd: 0, top: 8, bottom: 8,
          width: 2.5, background: DT.gold, borderRadius: 99,
        }} />
      )}
      <Icon size={tight ? 16 : 17} aria-hidden="true" />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{
          background: DT.gold, color: DT.ink, fontSize: 10, fontWeight: 800,
          padding: '2px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
        }}>{item.badge}</span>
      )}
      {item.premium && <Sparkles size={11} aria-hidden="true" />}
    </NavLink>
  );
}

// ═══ Topbar ══════════════════════════════════════════════════════
function Topbar({ narrow, onOpenDrawer, onOpenPalette, onNewLead, onOpenReminders }) {
  return (
    <header style={{
      flexShrink: 0, borderBottom: `1px solid ${DT.border}`,
      padding: narrow ? '12px 16px' : '14px 28px',
      display: 'flex', alignItems: 'center', gap: narrow ? 10 : 20,
      background: DT.cream, position: 'sticky', top: 0, zIndex: 20,
    }}>
      {narrow && (
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="תפריט"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
            color: DT.ink, display: 'inline-grid', placeItems: 'center',
          }}
        ><Menu size={18} /></button>
      )}
      <button
        type="button"
        onClick={onOpenPalette}
        style={{
          ...FONT, flex: 1, maxWidth: narrow ? 'none' : 480, position: 'relative',
          padding: '10px 40px 10px 14px',
          border: `1px solid ${DT.border}`, borderRadius: 10,
          background: DT.white, fontSize: 13, color: DT.muted,
          cursor: 'pointer', textAlign: 'right',
        }}
      >
        <span style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          right: 14, color: DT.muted, pointerEvents: 'none',
          display: 'inline-flex',
        }}><Search size={15} /></span>
        {narrow ? 'חיפוש…' : 'חיפוש לידים, נכסים, פגישות…  (⌘K)'}
      </button>
      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {!narrow && (
          <button
            type="button"
            onClick={onNewLead}
            style={{
              ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
              padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
              color: DT.ink, display: 'inline-flex', gap: 6, alignItems: 'center',
              fontSize: 12, fontWeight: 700,
            }}
          ><Plus size={14} /> ליד חדש</button>
        )}
        <button
          type="button"
          onClick={onOpenReminders}
          aria-label="התראות"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
            color: DT.ink, display: 'grid', placeItems: 'center', position: 'relative',
          }}
        >
          <Bell size={15} />
          <span style={{
            position: 'absolute', top: 7, insetInlineStart: 9,
            width: 7, height: 7, borderRadius: 99, background: DT.gold,
            border: `2px solid ${DT.white}`,
          }} />
        </button>
        <a
          href="https://wa.me/972501234567"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
            color: DT.ink, display: 'grid', placeItems: 'center', textDecoration: 'none',
          }}
        >
          <MessageCircle size={15} />
        </a>
      </div>
    </header>
  );
}
