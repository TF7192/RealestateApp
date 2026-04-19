import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Users, Handshake, Plus, X, Home, UserPlus, Calculator } from 'lucide-react';
import haptics from '../lib/haptics';
import './MobileTabBar.css';

const TABS = [
  { to: '/', label: 'בית', icon: LayoutDashboard, end: true },
  { to: '/properties', label: 'נכסים', icon: Building2 },
  { to: '/customers', label: 'לקוחות', icon: Users },
  { to: '/deals', label: 'עסקאות', icon: Handshake },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const openAddSheet = () => {
    haptics.press();
    setAddOpen(true);
  };

  const addProperty = () => {
    haptics.tap();
    setAddOpen(false);
    navigate('/properties/new');
  };

  const addLead = () => {
    haptics.tap();
    setAddOpen(false);
    navigate('/customers/new');
  };

  const openCalculator = () => {
    haptics.tap();
    setAddOpen(false);
    navigate('/calculator');
  };

  return (
    <>
      <nav className="mtb" role="tablist" aria-label="ניווט ראשי">
        <div className="mtb-inner">
          {TABS.slice(0, 2).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              data-tour={t.to === '/properties' ? 'sidebar-properties' : undefined}
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
            aria-label="הוספה חדשה"
            type="button"
          >
            <span className="mtb-icon mtb-add-icon-pill"><Plus /></span>
            <span className="mtb-label">חדש</span>
          </button>

          {TABS.slice(2).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              data-tour={t.to === '/customers' ? 'sidebar-customers' : undefined}
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
            <h4>מה להוסיף?</h4>
            <button className="mtb-add-row" onClick={addProperty}>
              <span className="mtb-add-icon prop"><Home size={18} /></span>
              <span className="mtb-add-text">
                <strong>נכס חדש</strong>
                <small>קליטת נכס לשיווק</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>
            <button className="mtb-add-row" onClick={addLead}>
              <span className="mtb-add-icon lead"><UserPlus size={18} /></span>
              <span className="mtb-add-text">
                <strong>ליד חדש</strong>
                <small>הוספת לקוח פוטנציאלי</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>
            <button className="mtb-add-row" onClick={openCalculator}>
              <span className="mtb-add-icon calc"><Calculator size={18} /></span>
              <span className="mtb-add-text">
                <strong>מחשבון מוכר</strong>
                <small>חישוב מהיר של עמלות ונטו לבעלים</small>
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
