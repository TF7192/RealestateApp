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

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, Building2, MessageSquare, Crown, CalendarDays, Sparkles,
  BarChart2, Banknote, Upload, UsersRound, Settings,
  Bell, Search, Plus, MessageCircle, LogOut, Menu, X,
  ChevronsLeft, ChevronsRight, Calculator, FileText, ArrowLeftRight,
  Activity as ActivityIcon, Tag, Download as DownloadIcon, Heart,
  Star,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
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
  // Sidebar palette — espresso #544433 from the claude-design bundle
  // verbatim. Gold accents are calibrated against this dark brown.
  sidebarBg: '#544433',
  sidebarInk: '#f5ecd8',
  sidebarMuted: '#bfae91',
};

// Bundle's DesktopShell width — 240 expanded, 72 collapsed rail.
const SIDEBAR_W = 240;
const SIDEBAR_W_COLLAPSED = 72;
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);

const PRIMARY_NAV = [
  { k: 'dashboard',   to: '/dashboard',  label: 'לוח בקרה', Icon: Home },
  { k: 'leads',       to: '/customers',  label: 'לידים',      Icon: Users },
  { k: 'properties',  to: '/properties', label: 'נכסים',      Icon: Building2 },
  { k: 'owners',      to: '/owners',     label: 'בעלים',      Icon: Crown },
  { k: 'deals',       to: '/deals',      label: 'עסקאות',     Icon: Banknote },
  { k: 'calendar',    to: '/reminders',  label: 'יומן',       Icon: CalendarDays },
  { k: 'calendar-month', to: '/calendar', label: 'לוח שנה',    Icon: CalendarDays },
  { k: 'transfers',   to: '/transfers',  label: 'העברות',     Icon: ArrowLeftRight },
  { k: 'reports',     to: '/reports',    label: 'דוחות',      Icon: BarChart2 },
  { k: 'activity',    to: '/activity',   label: 'פעילות',     Icon: ActivityIcon },
  { k: 'inbox',       to: '/admin/chats', label: 'הודעות צ׳אט', Icon: MessageSquare, adminOnly: true },
];
const TOOL_NAV = [
  { k: 'yad2',      to: '/integrations/yad2', label: 'ייבוא מ-Yad2', Icon: DownloadIcon, premium: true },
  { k: 'import',    to: '/import',            label: 'ייבוא אקסל',    Icon: Upload },
  { k: 'calculator', to: '/calculator',       label: 'מחשבון',         Icon: Calculator },
  { k: 'templates',  to: '/templates',        label: 'תבניות',         Icon: FileText },
  { k: 'office',     to: '/office',           label: 'משרד / צוות',    Icon: UsersRound },
  { k: 'tags',       to: '/settings/tags',    label: 'ניהול תגיות',    Icon: Tag },
  { k: 'settings',   to: '/settings',         label: 'הגדרות',         Icon: Settings },
];

// Pick the single most-specific nav route that matches the current
// pathname. `/dashboard` also wins when the pathname is `/`.
function pickActiveRoute(pathname, routes) {
  const p = pathname === '/' ? '/dashboard' : pathname;
  let best = null;
  for (const to of routes) {
    if (!to) continue;
    if (to === p) return to;
    if (p.startsWith(`${to}/`) && (!best || to.length > best.length)) best = to;
  }
  return best;
}

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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('estia-sidebar-collapsed') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('estia-sidebar-collapsed', collapsed ? '1' : '0'); }
    catch { /* ignore */ }
  }, [collapsed]);

  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const narrow = useIsNarrow();
  const isAdmin = user && ADMIN_EMAILS.has(user.email);

  // ─── Favorites (restored from the previous layout) ─────────────
  const [favorites, setFavorites] = useState([]);
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const favRes = await api.listFavorites();
        const favItems = (favRes?.items || []).slice(0, 5);
        if (!favItems.length) { if (!cancelled) setFavorites([]); return; }
        const [propsRes, leadsRes, ownersRes] = await Promise.all([
          api.listProperties({ mine: '1' }).catch(() => ({ items: [] })),
          api.listLeads().catch(() => ({ items: [] })),
          api.listOwners().catch(() => ({ items: [] })),
        ]);
        const byId = {
          PROPERTY: new Map((propsRes?.items || []).map((p) => [p.id, p])),
          LEAD:     new Map((leadsRes?.items || []).map((l) => [l.id, l])),
          OWNER:    new Map((ownersRes?.items || []).map((o) => [o.id, o])),
        };
        const hydrated = favItems.map((fav) => {
          const entity = byId[fav.entityType]?.get(fav.entityId);
          if (!entity) return null;
          if (fav.entityType === 'PROPERTY') {
            const street = [entity.street, entity.number].filter(Boolean).join(' ').trim();
            const label = [street || entity.address || 'נכס', entity.city].filter(Boolean).join(', ');
            return { key: `P-${fav.entityId}`, label, to: `/properties/${fav.entityId}` };
          }
          if (fav.entityType === 'LEAD') {
            return { key: `L-${fav.entityId}`, label: entity.name || 'ליד', to: `/customers?selected=${fav.entityId}` };
          }
          if (fav.entityType === 'OWNER') {
            return { key: `O-${fav.entityId}`, label: entity.name || 'בעלים', to: `/owners/${fav.entityId}` };
          }
          return null;
        }).filter(Boolean);
        if (!cancelled) setFavorites(hydrated);
      } catch { /* favorites are best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

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
          primary={primary} tools={TOOL_NAV} favorites={favorites}
          location={location}
          agentName={agentName} agentInitial={agentInitial} agentSub={agentSub}
          onLogout={onLogout}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      )}

      {/* Mobile: no hamburger drawer. All navigation lives on the
          bottom TabBar; the "עוד" tab opens a full-screen sheet with
          the complete nav tree. Cleaner than two entry points. */}

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        paddingBottom: narrow ? 72 : 0, // room for the mobile tab bar
      }}>
        <Topbar
          narrow={narrow}
          onOpenPalette={openPalette}
          onNewLead={() => navigate('/customers/new')}
          onNewProperty={() => navigate('/properties/new')}
          onOpenChat={() => window.dispatchEvent(new Event('estia:open-chat'))}
          user={user}
        />
        <main style={{ flex: 1, minWidth: 0, background: DT.cream }}>
          <Outlet />
        </main>
      </div>

      {narrow && <QuickCreateFab />}
      {narrow && (
        <MobileTabBar
          primary={primary}
          tools={TOOL_NAV}
          favorites={favorites}
          onLogout={onLogout}
          agentName={agentName}
          agentInitial={agentInitial}
          agentSub={agentSub}
        />
      )}
    </div>
  );
}

// ═══ Sidebar (desktop) ═══════════════════════════════════════════
function Sidebar(p) {
  const width = p.collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;
  return (
    <aside style={{
      width, flexShrink: 0, background: DT.sidebarBg, color: DT.sidebarInk,
      display: 'flex', flexDirection: 'column', padding: '18px 0',
      height: '100vh', position: 'sticky', top: 0,
      transition: 'width 200ms ease',
    }}>
      <SidebarInner {...p} />
      <HiddenScrollbarStyles />
      {/* Collapse handle — anchored on the sidebar's outer (content-
          facing) edge, vertically centered, so it sits ON the seam
          between the sidebar and the main area. */}
      {p.onToggleCollapse && (
        <button
          type="button"
          onClick={p.onToggleCollapse}
          aria-label={p.collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
          title={p.collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
          style={{
            position: 'absolute',
            top: '50%',
            // RTL: insetInlineEnd is the LEFT side of the sidebar —
            // the edge that faces the main content. Putting the handle
            // at -12 there hangs it over the seam. The previous
            // `insetInlineStart: -12` put it on the OUTER edge, which
            // in RTL is the viewport's right side → offscreen.
            insetInlineEnd: -12,
            transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 99,
            background: DT.white, color: DT.ink,
            border: `1px solid ${DT.border}`,
            boxShadow: '0 4px 12px rgba(30,26,20,0.18)',
            cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            zIndex: 2,
          }}
        >
          {p.collapsed ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
        </button>
      )}
    </aside>
  );
}

// Utility: inject a scoped style block that kills the scrollbar inside
// the sidebar's nav while keeping it scrollable. Placed once here so
// both the sticky sidebar and the mobile drawer inherit it.
function HiddenScrollbarStyles() {
  return (
    <style>{`
      .estia-sidebar-nav { scrollbar-width: none; -ms-overflow-style: none; }
      .estia-sidebar-nav::-webkit-scrollbar { width: 0; height: 0; display: none; }
    `}</style>
  );
}


function SidebarInner({
  primary, tools, favorites = [],
  location, agentName, agentInitial, agentSub,
  onLogout, collapsed = false, onToggleCollapse,
}) {
  // Single-active resolver: of all items whose `to` is a prefix of the
  // current pathname, keep only the longest match. Without this,
  // /settings/tags lit BOTH /settings and /settings/tags because
  // startsWith matched both (bug the user just flagged).
  const allRoutes = [
    ...primary.map((i) => i.to),
    ...tools.map((i) => i.to),
    ...favorites.map((f) => f.to),
  ];
  const activeTo = pickActiveRoute(location.pathname, allRoutes);
  const isActive = (to) => to === activeTo;
  return (
    <>
      {/* Brand + collapse toggle */}
      <div style={{
        padding: `0 ${collapsed ? 14 : 18}px 18px`,
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <NavLink to="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', flex: 1, minWidth: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink,
            fontWeight: 900, fontSize: 17, letterSpacing: -1, flexShrink: 0,
          }}>E</div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>Estia</div>
              <div style={{ fontSize: 10, color: DT.sidebarMuted, fontWeight: 600 }}>נדל״ן AI</div>
            </div>
          )}
        </NavLink>
        {/* Collapse toggle moved out to the sidebar's outer edge
            (rendered by the wrapping <Sidebar>). Cleaner — the brand
            row stays clean. */}
      </div>

      <nav className="estia-sidebar-nav" style={{
        flex: 1, padding: `12px ${collapsed ? 8 : 10}px`,
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {!collapsed && <SectionLabel>עבודה יומיומית</SectionLabel>}
        {primary.map((item) => (
          <NavRow key={item.k} item={item} active={isActive(item.to)} collapsed={collapsed} />
        ))}
        <div style={{ height: 10 }} />
        {!collapsed && <SectionLabel>כלים</SectionLabel>}
        {tools.map((item) => (
          <NavRow key={item.k} item={item} active={isActive(item.to)} collapsed={collapsed} tight />
        ))}
        {favorites.length > 0 && (
          <>
            <div style={{ height: 10 }} />
            {!collapsed && <SectionLabel>המועדפים</SectionLabel>}
            {favorites.map((fav) => (
              <NavRow
                key={fav.key}
                item={{ to: fav.to, label: fav.label, Icon: Heart }}
                active={isActive(fav.to)}
                collapsed={collapsed}
                tight
              />
            ))}
          </>
        )}
      </nav>

      {/* Upgrade card (hidden when collapsed to preserve width) */}
      {!collapsed && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{
            background: `linear-gradient(160deg, rgba(180,139,76,0.28), rgba(180,139,76,0.12))`,
            border: '1px solid rgba(180,139,76,0.32)', borderRadius: 12, padding: 12,
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
      )}

      {/* Agent row */}
      <div style={{
        padding: `10px ${collapsed ? 10 : 14}px 12px`,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <NavLink to="/profile" style={{
          width: 34, height: 34, borderRadius: 99, background: DT.gold, color: DT.ink,
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
          textDecoration: 'none', flexShrink: 0,
        }}>{agentInitial}</NavLink>
        {!collapsed && (
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
        )}
        {!collapsed && (
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
        )}
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

function NavRow({ item, active, tight, collapsed }) {
  const { Icon } = item;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      style={{
        ...FONT,
        width: '100%',
        display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 11,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '10px 0' : tight ? '9px 12px' : '10px 12px',
        background: active ? 'rgba(180,139,76,0.18)' : 'transparent',
        borderRadius: 9, color: active ? DT.goldLight : DT.sidebarInk,
        fontSize: 13, fontWeight: active ? 700 : 500,
        marginBottom: 2, position: 'relative', textDecoration: 'none',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', insetInlineEnd: 0, top: 8, bottom: 8,
          width: 2.5, background: DT.gold, borderRadius: 99,
        }} />
      )}
      <Icon size={tight ? 16 : 17} aria-hidden="true" />
      {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
      {!collapsed && item.badge && (
        <span style={{
          background: DT.gold, color: DT.ink, fontSize: 10, fontWeight: 800,
          padding: '2px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
        }}>{item.badge}</span>
      )}
      {!collapsed && item.premium && <Sparkles size={11} aria-hidden="true" />}
    </NavLink>
  );
}

// ═══ Topbar ══════════════════════════════════════════════════════
function Topbar({ narrow, onOpenPalette, onNewLead, onNewProperty, onOpenChat, user }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const notifAnchorRef = useRef(null);

  useEffect(() => {
    if (!notifOpen) return undefined;
    const onDoc = (e) => {
      if (notifAnchorRef.current && !notifAnchorRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  // Load notifications on first open. Uses /reminders list + /activity
  // as a stand-in for a dedicated notifications endpoint — both return
  // recent items the agent hasn't acted on yet.
  const loadNotifs = async () => {
    setLoadingNotifs(true);
    try {
      const [rem, act] = await Promise.all([
        api.listReminders?.({ upcoming: '1' }).catch(() => null),
        api.activityLog?.({ limit: 10 }).catch(() => null),
      ]);
      const reminderItems = (rem?.items || []).slice(0, 5).map((r) => ({
        key: `r-${r.id}`, kind: 'reminder',
        title: r.title || 'תזכורת', when: r.dueAt || r.createdAt,
        to: '/reminders',
      }));
      const activityItems = (act?.items || []).slice(0, 5).map((a) => ({
        key: `a-${a.id}`, kind: 'activity',
        title: a.summary || `${a.verb} ${a.entityType}`, when: a.createdAt,
        to: '/activity',
      }));
      setNotifs([...reminderItems, ...activityItems]);
    } catch { setNotifs([]); }
    finally { setLoadingNotifs(false); }
  };

  const toggleNotifs = () => {
    setNotifOpen((v) => {
      if (!v) loadNotifs();
      return !v;
    });
  };

  return (
    <header style={{
      flexShrink: 0, borderBottom: `1px solid ${DT.border}`,
      padding: narrow ? '12px 16px' : '14px 28px',
      display: 'flex', alignItems: 'center', gap: narrow ? 10 : 20,
      background: DT.cream, position: 'sticky', top: 0, zIndex: 20,
    }}>
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
          <>
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
            <button
              type="button"
              onClick={onNewProperty}
              style={{
                ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
                padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
                color: DT.ink, display: 'inline-flex', gap: 6, alignItems: 'center',
                fontSize: 12, fontWeight: 700,
              }}
            ><Plus size={14} /> נכס חדש</button>
          </>
        )}
        <div ref={notifAnchorRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={toggleNotifs}
            aria-label="התראות"
            aria-expanded={notifOpen}
            style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
              color: DT.ink, display: 'grid', placeItems: 'center', position: 'relative',
            }}
          >
            <Bell size={15} />
            {notifs.length > 0 && (
              <span style={{
                position: 'absolute', top: 7, insetInlineStart: 9,
                width: 7, height: 7, borderRadius: 99, background: DT.gold,
                border: `2px solid ${DT.white}`,
              }} />
            )}
          </button>
          {notifOpen && (
            <NotificationsPopover items={notifs} loading={loadingNotifs} onClose={() => setNotifOpen(false)} />
          )}
        </div>
        <button
          type="button"
          onClick={onOpenChat}
          aria-label="שיחה עם הצוות"
          title="שיחה עם הצוות"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
            color: DT.ink, display: 'grid', placeItems: 'center',
          }}
        >
          <MessageCircle size={15} />
        </button>
      </div>
    </header>
  );
}

function NotificationsPopover({ items, loading, onClose }) {
  return (
    <div style={{
      // Anchor to the bell's LEFT edge so the popover flows rightward
      // into the viewport. The action cluster is `marginInlineStart:
      // auto` which in RTL sits on the viewport's LEFT — so `right: 0`
      // pushed the 340-wide popover off that left edge. `left: 0` lets
      // it extend toward the middle of the page where there's room.
      position: 'absolute', top: 'calc(100% + 6px)', left: 0,
      width: 340, maxWidth: 'calc(100vw - 24px)',
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 12, boxShadow: '0 14px 34px rgba(30,26,20,0.14)',
      overflow: 'hidden', zIndex: 30,
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${DT.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>התראות</div>
        <NavLink to="/reminders" onClick={onClose} style={{ fontSize: 11, color: DT.gold, fontWeight: 700, textDecoration: 'none' }}>הכול ←</NavLink>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 16, color: DT.muted, fontSize: 12 }}>טוען…</div>}
        {!loading && items.length === 0 && (
          <div style={{ padding: 16, color: DT.muted, fontSize: 12 }}>אין התראות חדשות</div>
        )}
        {!loading && items.map((it) => (
          <NavLink key={it.key} to={it.to} onClick={onClose} style={{
            display: 'flex', gap: 10, padding: '10px 14px',
            borderBottom: `1px solid ${DT.border}`,
            textDecoration: 'none', color: DT.ink,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: DT.goldSoft, color: DT.gold, display: 'grid', placeItems: 'center',
            }}>
              {it.kind === 'reminder' ? <Bell size={14} /> : <ActivityIcon size={14} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.title}
              </div>
              {it.when && (
                <div style={{ fontSize: 10, color: DT.muted }}>
                  {new Date(it.when).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
