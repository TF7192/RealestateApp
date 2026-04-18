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
  Share2,
  Check,
  PanelRightClose,
  PanelRightOpen,
  ArrowRight,
  ArrowLeftRight,
  FileText,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import MobileTabBar from './MobileTabBar';
import MobileMoreSheet from './MobileMoreSheet';
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
];

const quickActions = [
  { path: '/properties/new', icon: Plus, label: 'נכס חדש' },
  { path: '/customers/new', icon: UserPlus, label: 'ליד חדש' },
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
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

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
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={16} />
            יציאה
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

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
