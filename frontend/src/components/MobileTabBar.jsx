import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  UserCircle,
  Calculator,
  Plus,
  X,
  Home,
  UserPlus,
  Handshake,
  LayoutDashboard,
} from 'lucide-react';
import haptics from '../lib/haptics';
import './MobileTabBar.css';

// Bottom nav for the iPhone app.
//
// Layout (5 slots): נכסים · לקוחות · [+] · בעלים · מחשבון.
// Home & Deals still exist as routes but moved into the "+" sheet /
// drawer — Owners and Calculator are used far more often and the user
// explicitly asked for them to be first-class bottom tabs.
//
// The center "+" slot opens a sheet with shortcuts to create (new
// property / new lead / new deal) plus a "home" shortcut for agents
// who want the dashboard.

const TABS_BEFORE = [
  { to: '/properties', label: 'נכסים', icon: Building2, tour: 'sidebar-properties' },
  { to: '/customers',  label: 'לקוחות', icon: Users,    tour: 'sidebar-customers' },
];
const TABS_AFTER = [
  { to: '/owners',     label: 'בעלים',  icon: UserCircle },
  { to: '/calculator', label: 'מחשבון', icon: Calculator },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const openAddSheet = () => {
    haptics.press();
    setAddOpen(true);
  };
  const go = (path) => () => {
    haptics.tap();
    setAddOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav className="mtb" role="tablist" aria-label="ניווט ראשי">
        <div className="mtb-inner">
          {TABS_BEFORE.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              data-tour={t.tour}
              className={({ isActive }) => `mtb-item ${isActive ? 'active' : ''}`}
              onClick={() => haptics.tap()}
            >
              <span className="mtb-icon"><t.icon /></span>
              <span className="mtb-label">{t.label}</span>
            </NavLink>
          ))}

          <button
            className="mtb-item mtb-add"
            onClick={openAddSheet}
            aria-label="תפריט הוספה / קיצורים"
            type="button"
          >
            <span className="mtb-icon mtb-add-icon-pill"><Plus /></span>
            <span className="mtb-label">עוד</span>
          </button>

          {TABS_AFTER.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => `mtb-item ${isActive ? 'active' : ''}`}
              onClick={() => haptics.tap()}
            >
              <span className="mtb-icon"><t.icon /></span>
              <span className="mtb-label">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {addOpen && (
        <div className="mtb-add-backdrop" onClick={() => setAddOpen(false)}>
          <div className="mtb-add-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mtb-add-grabber" />
            <h4>מה לעשות?</h4>

            <button className="mtb-add-row" onClick={go('/properties/new')}>
              <span className="mtb-add-icon prop"><Home size={18} /></span>
              <span className="mtb-add-text">
                <strong>נכס חדש</strong>
                <small>קליטת נכס לשיווק</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/customers/new')}>
              <span className="mtb-add-icon lead"><UserPlus size={18} /></span>
              <span className="mtb-add-text">
                <strong>ליד חדש</strong>
                <small>הוספת לקוח פוטנציאלי</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/deals')}>
              <span className="mtb-add-icon deal"><Handshake size={18} /></span>
              <span className="mtb-add-text">
                <strong>עסקאות</strong>
                <small>כל העסקאות הפתוחות והסגורות</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/')}>
              <span className="mtb-add-icon dash"><LayoutDashboard size={18} /></span>
              <span className="mtb-add-text">
                <strong>דשבורד</strong>
                <small>מבט-על על היום והשבוע</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-cancel" onClick={() => setAddOpen(false)}>
              <X size={14} />
              ביטול
            </button>
          </div>
        </div>
      )}
    </>
  );
}
