import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { LayoutDashboard, Building2, Handshake, Users, Plus, Bell, Search } from 'lucide-react';
import { agentProfile } from '../data/mockData';
import QuickActionSheet from './components/QuickActionSheet';
import { haptics, initStatusBar } from '../native';
import './mobile.css';

const TABS = [
  { path: '/', icon: LayoutDashboard, label: 'הבית', end: true },
  { path: '/properties', icon: Building2, label: 'נכסים' },
  { path: '__FAB__' },
  { path: '/leads', icon: Users, label: 'לידים' },
  { path: '/deals', icon: Handshake, label: 'עסקאות' },
];

export default function MobileLayout({ onLogout }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('mobile-shell');
    initStatusBar();
    return () => document.body.classList.remove('mobile-shell');
  }, []);

  // Hide tabbar on deep flows like new lead / new property forms
  const hideChrome = /\/(new|\d+)(\/)?$/.test(location.pathname) && !location.pathname.startsWith('/properties/?');
  const isDetail = /^\/properties\/\d+$/.test(location.pathname);
  const isForm = location.pathname.endsWith('/new');

  // Section title based on route
  const section =
    location.pathname === '/' ? { title: 'שלום, ' + agentProfile.name.split(' ')[0], eyebrow: dateGreeting() }
    : location.pathname.startsWith('/properties') ? { title: 'הנכסים שלי', eyebrow: 'תיק נדל״ן' }
    : location.pathname.startsWith('/leads') ? { title: 'לידים', eyebrow: 'פייפליין' }
    : location.pathname.startsWith('/deals') ? { title: 'עסקאות', eyebrow: 'צנרת' }
    : location.pathname.startsWith('/buyers') ? { title: 'קונים ושוכרים', eyebrow: 'לקוחות' }
    : { title: 'Estia', eyebrow: 'ניהול' };

  return (
    <div className="m-shell">
      {!isDetail && !isForm && (
        <header className="m-header">
          <div className="m-header-left">
            <Link to="/settings" onClick={() => haptics.tap()} className="m-avatar" aria-label="פרופיל">
              {agentProfile.name.charAt(0)}
            </Link>
            <div>
              <div className="m-header-sub">{section.eyebrow}</div>
              <div className="m-header-title">{section.title}</div>
            </div>
          </div>
          <div className="m-header-right">
            <button
              className="m-icon-btn"
              onClick={() => { haptics.tap(); navigate('/properties'); }}
              aria-label="חיפוש"
            >
              <Search size={18} />
            </button>
            <button
              className="m-icon-btn"
              onClick={() => { haptics.tap(); navigate('/leads?filter=hot'); }}
              aria-label="התראות"
            >
              <Bell size={18} />
            </button>
          </div>
        </header>
      )}

      <main className="m-main">
        <Outlet context={{ onLogout }} />
      </main>

      {!hideChrome && (
        <>
          <button
            className={`m-fab ${sheetOpen ? 'open' : ''}`}
            onClick={() => { haptics.press(); setSheetOpen((s) => !s); }}
            aria-label="פעולות מהירות"
          >
            <Plus size={26} strokeWidth={2.4} />
          </button>

          <nav className="m-tabbar-wrap" aria-label="ניווט ראשי">
            <div className="m-tabbar">
              {TABS.map((t) => {
                if (t.path === '__FAB__') {
                  return <span key="fab" className="m-tab is-fab-slot" />;
                }
                const Icon = t.icon;
                return (
                  <NavLink
                    key={t.path}
                    to={t.path}
                    end={t.end}
                    onClick={() => haptics.select()}
                    className={({ isActive }) => `m-tab ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={22} strokeWidth={isActiveForPath(location.pathname, t.path, t.end) ? 2.2 : 1.8} />
                    <span>{t.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <QuickActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </>
      )}
    </div>
  );
}

function isActiveForPath(pathname, target, end) {
  if (end) return pathname === target;
  return pathname.startsWith(target);
}

function dateGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}
