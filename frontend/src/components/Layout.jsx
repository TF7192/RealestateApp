import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  Target,
  Handshake,
  Plus,
  UserPlus,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { agentProfile } from '../data/mockData';
import './Layout.css';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'לוח בקרה' },
  { path: '/properties', icon: Building2, label: 'נכסים' },
  { path: '/leads', icon: Target, label: 'לידים' },
  { path: '/buyers', icon: Users, label: 'קונים' },
  { path: '/deals', icon: Handshake, label: 'עסקאות' },
];

const quickActions = [
  { path: '/properties/new', icon: Plus, label: 'נכס חדש' },
  { path: '/leads/new', icon: UserPlus, label: 'ליד חדש' },
];

export default function Layout({ onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isCustomerPage = location.pathname.startsWith('/p/');
  if (isCustomerPage) return <Outlet />;

  return (
    <div className="layout">
      <div className="noise-overlay" />

      {/* Mobile header */}
      <header className="mobile-header">
        <button className="btn-ghost" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="mobile-logo">
          <span className="logo-icon">◆</span>
          <span>Estia</span>
        </div>
        <div style={{ width: 40 }} />
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-mark">
              <span>◆</span>
            </div>
            <div className="logo-text">
              <h1>Estia</h1>
              <p>ניהול נכסים ולידים</p>
            </div>
          </div>
          <button
            className="sidebar-close btn-ghost"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <span className="nav-section-label">ניווט ראשי</span>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
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
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="agent-card">
            <div className="agent-avatar">
              {agentProfile.name.charAt(0)}
            </div>
            <div className="agent-info">
              <span className="agent-name">{agentProfile.name}</span>
              <span className="agent-agency">{agentProfile.agency}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={16} />
            יציאה
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
