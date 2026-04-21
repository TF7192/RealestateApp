import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
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

// Mirrors backend ADMIN_EMAILS default — anyone in this list sees the
// admin chat link in the sidebar and the admin page loads for them.
const ADMIN_EMAILS = new Set(['talfuks1234@gmail.com']);
import haptics from '../lib/haptics';
import './Layout.css';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'לוח בקרה' },
  { path: '/properties', icon: Building2, label: 'נכסים' },
  { path: '/owners', icon: UserCircle, label: 'בעלי נכסים' },
  { path: '/customers', icon: Users, label: 'לקוחות' },
  { path: '/deals', icon: Handshake, label: 'עסקאות' },
  { path: '/transfers', icon: ArrowLeftRight, label: 'העברות' },
  { path: '/templates', icon: FileText, label: 'תבניות הודעה' },
  { path: '/calculator', icon: Calculator, label: 'מחשבון מוכר' },
  { path: '/integrations/yad2', icon: DownloadIcon, label: 'ייבוא מ-Yad2' },
];

const quickActions = [
  { path: '/properties/new', icon: Plus, label: 'נכס חדש' },
  { path: '/customers/new', icon: UserPlus, label: 'ליד חדש' },
];

// Sprint 4 reporting surfaces + Sprint 1 A2 tag-settings entry point.
// Collected in a "כלי ניהול" group so the main nav isn't cluttered; Office
// (Sprint 7 A1) is gated to role === 'OWNER' — rendered conditionally below.
const MANAGEMENT_ITEMS = [
  { path: '/reports',       icon: BarChart2,   label: 'דוחות' },
  { path: '/activity',      icon: ActivityIcon, label: 'פעילות' },
  { path: '/reminders',     icon: Bell,         label: 'תזכורות' },
  { path: '/settings/tags', icon: Tag,          label: 'ניהול תגיות' },
];

// Pages that should show a back arrow + contextual title instead of the logo.
// `titleHint` is a fallback title; dynamic titles come via the `estia:title`
// custom event (set per-page: window.dispatchEvent(new CustomEvent('estia:title', { detail: '...' }))).
const BACK_TARGETS = [
  { match: /^\/properties\/new$/,  titleHint: 'נכס חדש',   back: '/properties' },
  { match: /^\/properties\/[^/]+$/, titleHint: 'פרטי נכס', back: '/properties' },
  { match: /^\/customers\/new$/,    titleHint: 'ליד חדש',  back: '/customers' },
  { match: /^\/owners\/[^/]+$/,     titleHint: 'בעל נכס',  back: '/owners' },
  { match: /^\/profile$/,           titleHint: 'הפרופיל שלי', back: -1 },
];

// Top-level section titles for the breadcrumb (P1-M1)
const SECTION_TITLES = {
  '/': 'לוח בקרה',
  '/properties': 'נכסים',
  '/owners': 'בעלי נכסים',
  '/customers': 'לקוחות',
  '/deals': 'עסקאות',
  '/transfers': 'העברות',
  '/templates': 'תבניות הודעה',
  '/profile': 'הפרופיל',
};

function pickBack(pathname) {
  for (const t of BACK_TARGETS) if (t.match.test(pathname)) return t;
  return null;
}

export default function Layout({ onLogout }) {
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
            const label = [street || entity.address || 'נכס', entity.city].filter(Boolean).join(', ');
            return { key: `P-${fav.entityId}`, label, to: `/properties/${fav.entityId}` };
          }
          if (fav.entityType === 'LEAD') {
            return { key: `L-${fav.entityId}`, label: entity.name || 'ליד', to: `/customers?selected=${fav.entityId}` };
          }
          if (fav.entityType === 'OWNER') {
            return { key: `O-${fav.entityId}`, label: entity.name || 'בעל נכס', to: `/owners/${fav.entityId}` };
          }
          return null;
        })
        .filter(Boolean);
      setFavorites(hydrated);
    } catch {
      // Fail silently — favorites are a nice-to-have; 401 will bounce
      // via the api client already.
    }
  }, [user?.id]);

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
  const pageTitle =
    dynamicTitle ||
    (back && back.titleHint) ||
    SECTION_TITLES[location.pathname] ||
    '';

  return (
    <div className="layout">
      <div className="noise-overlay" />

      {/* Mobile top bar — contextual title (breadcrumb), back arrow, burger */}
      <header className={`mobile-header ${headerHidden ? 'mh-hidden' : ''}`}>
        <div className="mh-side mh-leading">
          {back && (
            <button className="btn-ghost mh-back-btn" onClick={goBack} aria-label="חזרה">
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
            aria-label="חיפוש"
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
              aria-label="צ׳אט עם המפתחים"
              type="button"
            >
              <MessageCircle size={20} />
            </button>
          )}
          <button
            className="btn-ghost mh-profile-btn"
            onClick={() => { haptics.tap(); setMoreOpen(true); }}
            aria-label="חשבון"
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
              <p>ניהול נכסים ולידים</p>
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
          title={collapsed ? 'הרחב סרגל' : 'כווץ סרגל'}
          aria-label={collapsed ? 'הרחב סרגל' : 'כווץ סרגל'}
        >
          {collapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
        </button>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <span className="nav-section-label">ניווט ראשי</span>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                data-label={item.label}
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
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Sprint 4 (reports, activity, reminders) + Sprint 1 A2 (tags)
              + Sprint 7 A1 (office — OWNER only). Grouped so the main
              nav isn't swamped with admin-ish surfaces. */}
          <div className="nav-section">
            <span className="nav-section-label">כלי ניהול</span>
            {MANAGEMENT_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                data-label={item.label}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            {isOwner && (
              <NavLink
                to="/office"
                data-label="משרד"
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Building2 size={20} />
                <span>משרד</span>
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
                המועדפים
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
            <span className="nav-section-label">פעולות מהירות</span>
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
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button
              className="nav-item nav-action share-link-btn"
              onClick={handleShareCatalog}
              title="העתק קישור שיתוף לקטלוג האישי"
            >
              {copiedShare ? <Check size={18} /> : <Share2 size={18} />}
              <span>{copiedShare ? 'הקישור הועתק' : 'שיתוף הקטלוג שלי'}</span>
            </button>
            {ADMIN_EMAILS.has((user?.email || '').toLowerCase()) && (
              <>
                <NavLink
                  to="/admin/chats"
                  className={({ isActive }) =>
                    `nav-item nav-action nav-item-admin ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                  title="מרכז שיחות אדמין"
                >
                  <Shield size={18} />
                  <span>מרכז שיחות</span>
                </NavLink>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    `nav-item nav-action nav-item-admin ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                  title="משתמשים — לוח אדמין"
                >
                  <Shield size={18} />
                  <span>משתמשים</span>
                </NavLink>
              </>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === 'light' ? 'מצב כהה' : 'מצב בהיר'}</span>
          </button>
          <NavLink to="/profile" className="agent-card agent-card-link" onClick={() => setSidebarOpen(false)}>
            {user?.avatarUrl ? (
              <img className="agent-avatar" src={user.avatarUrl} alt={user.displayName || 'סוכן'} />
            ) : (
              <div className="agent-avatar">
                {(user?.displayName || 'E').charAt(0)}
              </div>
            )}
            <div className="agent-info">
              <span className="agent-name">{user?.displayName || 'סוכן'}</span>
              <span className="agent-agency">
                {user?.agentProfile?.agency || 'ערוך את הפרופיל שלך'}
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
            href="mailto:support@estia.app?subject=עזרה%20ב-Estia"
            title="צור קשר עם התמיכה"
          >
            <HelpCircle size={16} />
            <span>עזרה</span>
          </a>
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={16} />
            יציאה
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* H2 — global floating quick-create FAB. Mounts for every authed
          route; hides itself on pages that already own a sticky CTA. */}
      <QuickCreateFab />

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
