import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  Handshake,
  Plus,
  UserPlus,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  Share2,
  Check,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import './Layout.css';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'לוח בקרה' },
  { path: '/properties', icon: Building2, label: 'נכסים' },
  { path: '/customers', icon: Users, label: 'לקוחות' },
  { path: '/deals', icon: Handshake, label: 'עסקאות' },
];

const quickActions = [
  { path: '/properties/new', icon: Plus, label: 'נכס חדש' },
  { path: '/customers/new', icon: UserPlus, label: 'ליד חדש' },
];

export default function Layout({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('estia-sidebar-collapsed') === '1'; }
    catch { return false; }
  });
  const [copiedShare, setCopiedShare] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    try { localStorage.setItem('estia-sidebar-collapsed', collapsed ? '1' : '0'); }
    catch { /* ignore */ }
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
  }, [collapsed]);

  const isCustomerPage = location.pathname.startsWith('/p/');
  if (isCustomerPage) return <Outlet />;

  const handleShareCatalog = () => {
    if (!user?.id) return;
    const url = `${window.location.origin}/a/${user.id}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  return (
    <div className="layout">
      <div className="noise-overlay" />

      <header className="mobile-header">
        <button className="btn-ghost" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <Link to="/" className="mobile-logo">
          <span className="logo-icon">◆</span>
          <span>Estia</span>
        </Link>
        <button className="btn-ghost" onClick={toggleTheme} title="מעבר בין מצב בהיר/כהה">
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
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
    </div>
  );
}
