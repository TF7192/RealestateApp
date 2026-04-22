import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  Handshake,
  Plus,
  UserPlus,
  X,
  LogOut,
  Sun,
  Moon,
  HelpCircle,
  Share2,
  Check,
  PanelRightClose,
  PanelRightOpen,
  ArrowRight,
  ArrowLeftRight,
  FileText,
  Shield,
  Search,
  MessageCircle,
  Calculator,
  Download as DownloadIcon,
  BarChart2,
  Activity as ActivityIcon,
  Bell,
  Tag,
  Heart,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import MobileTabBar from './MobileTabBar';
import MobileMoreSheet from './MobileMoreSheet';
import { isPopoutWindow } from '../lib/popout';
import QuickCreateFab from './QuickCreateFab';
import VoiceCaptureFab from './VoiceCaptureFab';

// Mirrors backend ADMIN_EMAILS default — anyone in this list sees the
// admin chat link in the sidebar and the admin page loads for them.
const ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);
import haptics from '../lib/haptics';
import './Layout.css';

// Nav items reference labels by i18n key — resolved inside the component
// where `t()` is available. Keys live in nav.json (menu.*, quick.*,
// mobileMore.*, etc.).
const navItems = [
  { path: '/', icon: LayoutDashboard, labelKey: 'menu.dashboard' },
  { path: '/properties', icon: Building2, labelKey: 'menu.properties' },
  { path: '/owners', icon: UserCircle, labelKey: 'menu.owners' },
  { path: '/customers', icon: Users, labelKey: 'menu.customers' },
  { path: '/deals', icon: Handshake, labelKey: 'menu.deals' },
  { path: '/transfers', icon: ArrowLeftRight, labelKey: 'menu.transfers' },
  { path: '/templates', icon: FileText, labelKey: 'menu.templates' },
  { path: '/calculator', icon: Calculator, labelKey: 'menu.calculator' },
  { path: '/integrations/yad2', icon: DownloadIcon, labelKey: 'menu.yad2Import' },
];

const quickActions = [
  { path: '/properties/new', icon: Plus, labelKey: 'quick.newProperty' },
  { path: '/customers/new', icon: UserPlus, labelKey: 'quick.newLead' },
];

// Sprint 4 reporting surfaces + Sprint 1 A2 tag-settings entry point.
// Collected in a "כלי ניהול" group so the main nav isn't cluttered; Office
// (Sprint 7 A1) is gated to role === 'OWNER' — rendered conditionally below.
const MANAGEMENT_ITEMS = [
  { path: '/reports',       icon: BarChart2,    labelKey: 'menu.reports' },
  { path: '/activity',      icon: ActivityIcon, labelKey: 'menu.activity' },
  { path: '/reminders',     icon: Bell,         labelKey: 'menu.reminders' },
  { path: '/settings/tags', icon: Tag,          labelKey: 'menu.tagSettings' },
];

// Pages that should show a back arrow + contextual title instead of the logo.
// `titleHintKey` is a fallback title (i18n key in nav.pageHints / menu);
// dynamic titles come via the `estia:title` custom event.
const BACK_TARGETS = [
  { match: /^\/properties\/new$/,   titleHintKey: 'pageHints.newProperty',  back: '/properties' },
  { match: /^\/properties\/[^/]+$/, titleHintKey: 'pageHints.propertyDetail', back: '/properties' },
  { match: /^\/customers\/new$/,    titleHintKey: 'pageHints.newLead',      back: '/customers' },
  { match: /^\/owners\/[^/]+$/,     titleHintKey: 'pageHints.ownerDetail',  back: '/owners' },
  { match: /^\/profile$/,           titleHintKey: 'menu.profileMine',       back: -1 },
];

// Top-level section titles for the breadcrumb (P1-M1). Keyed by path so
// the resolver inside the component can call t() per entry.
const SECTION_TITLE_KEYS = {
  '/': 'menu.dashboard',
  '/properties': 'menu.properties',
  '/owners': 'menu.owners',
  '/customers': 'menu.customers',
  '/deals': 'menu.deals',
  '/transfers': 'menu.transfers',
  '/templates': 'menu.templates',
  '/profile': 'menu.profile',
};

function pickBack(pathname) {
  for (const target of BACK_TARGETS) if (target.match.test(pathname)) return target;
  return null;
}

export default function Layout({ onLogout }) {
  const { t } = useTranslation('nav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('estia-sidebar-collapsed') === '1'; }
    catch { return false; }
  });
  const [copiedShare, setCopiedShare] = useState(false);
  const [dynamicTitle, setDynamicTitle] = useState('');
  const [headerHidden, setHeaderHidden] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const isOwner = user?.role === 'OWNER';

  // Sprint 7 B4 — sidebar "המועדפים" strip.
  // Hydrates each favorite's display label by cross-referencing the list
  // endpoints (properties / leads / owners). Cached in component state;
  // refetched on window focus so a favorite added in another tab shows
  // up when the agent returns. Kept to 5 items max in the UI.
  const loadFavorites = useCallback(async () => {
    if (!user?.id) return;
    try {
      const favRes = await api.listFavorites();
      const favItems = (favRes?.items || []).slice(0, 5);
      if (favItems.length === 0) { setFavorites([]); return; }
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
      const hydrated = favItems
        .map((fav) => {
          const entity = byId[fav.entityType]?.get(fav.entityId);
          if (!entity) return null;
          if (fav.entityType === 'PROPERTY') {
            const street = [entity.street, entity.number].filter(Boolean).join(' ').trim();
            const label = [street || entity.address || t('fallbacks.property'), entity.city].filter(Boolean).join(', ');
            return { key: `P-${fav.entityId}`, label, to: `/properties/${fav.entityId}` };
          }
          if (fav.entityType === 'LEAD') {
            return { key: `L-${fav.entityId}`, label: entity.name || t('fallbacks.lead'), to: `/customers?selected=${fav.entityId}` };
          }
          if (fav.entityType === 'OWNER') {
            return { key: `O-${fav.entityId}`, label: entity.name || t('fallbacks.owner'), to: `/owners/${fav.entityId}` };
          }
          return null;
        })
        .filter(Boolean);
      setFavorites(hydrated);
    } catch {
      // Fail silently — favorites are a nice-to-have; 401 will bounce
      // via the api client already.
    }
  }, [user?.id, t]);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);
  useEffect(() => {
    const onFocus = () => loadFavorites();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadFavorites]);

  useEffect(() => {
    try { localStorage.setItem('estia-sidebar-collapsed', collapsed ? '1' : '0'); }
    catch { /* ignore */ }
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
  }, [collapsed]);

  // Reset dynamic title when pathname changes; pages announce via event.
  useEffect(() => { setDynamicTitle(''); }, [location.pathname]);

  useEffect(() => {
    const onTitle = (e) => setDynamicTitle(e.detail || '');
    window.addEventListener('estia:title', onTitle);
    return () => window.removeEventListener('estia:title', onTitle);
  }, []);

  // Close sidebar on ESC + on outside click
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // P1-M15 — auto-hide mobile header on scroll-down, restore on scroll-up.
  // Tab bar stays put because it IS the navigation target.
  useEffect(() => {
    if (window.innerWidth > 900) return undefined;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 60) { setHeaderHidden(false); lastY = y; return; }
      const delta = y - lastY;
      if (delta > 6 && y > 80) setHeaderHidden(true);
      else if (delta < -6) setHeaderHidden(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  const isCustomerPage = location.pathname.startsWith('/p/');
  if (isCustomerPage) return <Outlet />;

  // B7 — when the current tab was opened as a popout (?popout=1), skip
  // all app chrome and just render the page content. The class on
  // <html> is available for any extra styling pages might want to add.
  if (isPopoutWindow()) {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('is-popout');
    }
    return (
      <main className="main-content is-popout-main">
        <Outlet />
      </main>
    );
  }

  const handleShareCatalog = () => {
    if (!user?.id) return;
    const url = `${window.location.origin}/a/${user.id}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const back = pickBack(location.pathname);
  const goBack = () => {
    haptics.tap();
    if (back?.back === -1) navigate(-1);
    else if (back?.back) navigate(back.back);
    else navigate('/');
  };

  // Build the header title: dynamic > hint > section > logo
  const sectionKey = SECTION_TITLE_KEYS[location.pathname];
  const pageTitle =
    dynamicTitle ||
    (back && back.titleHintKey ? t(back.titleHintKey) : '') ||
    (sectionKey ? t(sectionKey) : '') ||
    '';

  return (
    <div className="layout">
      <div className="noise-overlay" />

      {/* Mobile top bar — contextual title (breadcrumb), back arrow, burger */}
      <header className={`mobile-header ${headerHidden ? 'mh-hidden' : ''}`}>
        <div className="mh-side mh-leading">
          {back && (
            <button className="btn-ghost mh-back-btn" onClick={goBack} aria-label={t('aria.back')}>
              <ArrowRight size={22} />
            </button>
          )}
        </div>
        {pageTitle ? (
          <div className="mobile-logo mh-title-wrap">
            <span className="mh-title">{pageTitle}</span>
          </div>
        ) : (
          <Link to="/" className="mobile-logo" onClick={() => haptics.tap()}>
            <span className="logo-icon">◆</span>
            <span>Estia</span>
          </Link>
        )}
        <div className="mh-side mh-trailing">
          {/* S21: mobile global search — opens the same CommandPalette
              the desktop ⌘K shortcut launches. Dispatched as a window
              event so this Layout component doesn't need to share state
              with App.jsx. Two-tap reach to any property/customer/owner
              from anywhere in the app. */}
          <button
            className="btn-ghost mh-search-btn"
            onClick={() => {
              haptics.tap();
              window.dispatchEvent(new Event('estia:open-palette'));
            }}
            aria-label={t('aria.search')}
            type="button"
          >
            <Search size={20} />
          </button>
          {/* Task 1 · chat launcher inside the mobile header. The
              standalone .chatw-btn (position:fixed top-right) used to
              sit on top of the profile pill — same corner — clipping
              the avatar visually and floating outside the header's
              flex row. Hidden on mobile via ChatWidget.css; this
              button dispatches the open event ChatWidget listens for.
              Hidden for admins (they use /admin/chats). */}
          {!ADMIN_EMAILS.has((user?.email || '').toLowerCase()) && (
            <button
              className="btn-ghost mh-chat-btn"
              onClick={() => {
                haptics.tap();
                window.dispatchEvent(new Event('estia:open-chat'));
              }}
              aria-label={t('aria.chat')}
              type="button"
            >
              <MessageCircle size={20} />
            </button>
          )}
          <button
            className="btn-ghost mh-profile-btn"
            onClick={() => { haptics.tap(); setMoreOpen(true); }}
            aria-label={t('aria.account')}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="mh-avatar" />
            ) : (
              <span className="mh-avatar placeholder">{(user?.displayName || 'E').charAt(0)}</span>
            )}
          </button>
        </div>
      </header>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <Link to="/" className="logo">
            <div className="logo-mark">
              <span>◆</span>
            </div>
            <div className="logo-text">
              <h1>Estia</h1>
              <p>{t('sidebar.subtitle')}</p>
            </div>
          </Link>
          <button
            className="sidebar-close btn-ghost"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <button
          className="sidebar-collapse-rail"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? t('aria.expandSidebar') : t('aria.collapseSidebar')}
          aria-label={collapsed ? t('aria.expandSidebar') : t('aria.collapseSidebar')}
        >
          {collapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
        </button>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <span className="nav-section-label">{t('sections.main')}</span>
            {navItems.map((item) => {
              const label = t(item.labelKey);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  data-label={label}
                  // data-tour targets used by the OnboardingTour (T10).
                  data-tour={
                    item.path === '/properties' ? 'sidebar-properties' :
                    item.path === '/owners'     ? 'sidebar-owners' :
                    item.path === '/customers'  ? 'sidebar-customers' :
                    item.path === '/templates'  ? 'sidebar-templates' :
                    item.path === '/transfers'  ? 'sidebar-transfers' :
                    undefined
                  }
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </div>

          {/* Sprint 4 (reports, activity, reminders) + Sprint 1 A2 (tags)
              + Sprint 7 A1 (office — OWNER only). Grouped so the main
              nav isn't swamped with admin-ish surfaces. */}
          <div className="nav-section">
            <span className="nav-section-label">{t('sections.management')}</span>
            {MANAGEMENT_ITEMS.map((item) => {
              const label = t(item.labelKey);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  data-label={label}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
            {isOwner && (
              <NavLink
                to="/office"
                data-label={t('menu.office')}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Building2 size={20} />
                <span>{t('menu.office')}</span>
              </NavLink>
            )}
          </div>

          {/* Sprint 7 B4 — sidebar favorites strip. Rendered only when
              there is something to show; max 5 items. Each row links to
              the favorited entity's detail page. */}
          {favorites.length > 0 && (
            <div className="nav-section nav-favorites">
              <span className="nav-section-label">
                <Heart size={12} style={{ marginInlineEnd: 4, verticalAlign: -1 }} />
                {t('sections.favorites')}
              </span>
              {favorites.map((f) => (
                <NavLink
                  key={f.key}
                  to={f.to}
                  className={({ isActive }) =>
                    `nav-item nav-favorite ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                  title={f.label}
                >
                  <Heart size={14} />
                  <span className="nav-favorite-label">{f.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          <div className="nav-section">
            <span className="nav-section-label">{t('sections.quickActions')}</span>
            {quickActions.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-item nav-action ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            ))}
            <button
              className="nav-item nav-action share-link-btn"
              onClick={handleShareCatalog}
              title={t('aria.shareCatalog')}
            >
              {copiedShare ? <Check size={18} /> : <Share2 size={18} />}
              <span>{copiedShare ? t('share.copied') : t('share.action')}</span>
            </button>
            {ADMIN_EMAILS.has((user?.email || '').toLowerCase()) && (
              <>
                <NavLink
                  to="/admin/chats"
                  className={({ isActive }) =>
                    `nav-item nav-action nav-item-admin ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                  title={t('aria.adminChats')}
                >
                  <Shield size={18} />
                  <span>{t('sidebar.adminChats')}</span>
                </NavLink>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `nav-item nav-action nav-item-admin ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                  title={t('aria.adminUsers')}
                >
                  <Shield size={18} />
                  <span>{t('sidebar.adminUsers')}</span>
                </NavLink>
              </>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === 'light' ? t('theme.dark') : t('theme.light')}</span>
          </button>
          <NavLink to="/profile" className="agent-card agent-card-link" onClick={() => setSidebarOpen(false)}>
            {user?.avatarUrl ? (
              <img className="agent-avatar" src={user.avatarUrl} alt={user.displayName || t('fallbacks.agent')} />
            ) : (
              <div className="agent-avatar">
                {(user?.displayName || 'E').charAt(0)}
              </div>
            )}
            <div className="agent-info">
              <span className="agent-name">{user?.displayName || t('fallbacks.agent')}</span>
              <span className="agent-agency">
                {user?.agentProfile?.agency || t('quick.addAgency')}
              </span>
            </div>
          </NavLink>
          {/* F-17.3 — Help / support link. mailto: opens the user's
              email client with a prefilled subject; consistent with the
              single-support-channel posture today. When we have a real
              support URL (ticket system), swap the href — aria-label
              + icon stay stable. */}
          <a
            className="sidebar-help"
            href={`mailto:support@estia.app?subject=${encodeURIComponent(t('help.subject'))}`}
            title={t('aria.supportContact')}
          >
            <HelpCircle size={16} />
            <span>{t('menu.help')}</span>
          </a>
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={16} />
            {t('menu.logout')}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* H2 — global floating quick-create FAB. Mounts for every authed
          route; hides itself on pages that already own a sticky CTA. */}
      <QuickCreateFab />
      {/* H3 — voice-to-lead mic FAB. Opposite corner so it never overlaps
          the quick-create button; hides itself on login/public portals. */}
      <VoiceCaptureFab />

      {/* Mobile chrome */}
      <MobileTabBar />
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpenPalette={() => {
          // Fire a global event for CommandPalette; simple and decoupled
          const ev = new CustomEvent('estia:open-palette');
          window.dispatchEvent(ev);
        }}
      />
    </div>
  );
}
