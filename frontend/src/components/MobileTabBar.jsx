import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  { to: '/properties', labelKey: 'mobileTabs.properties', icon: Building2, tour: 'sidebar-properties' },
  { to: '/customers',  labelKey: 'mobileTabs.customers',  icon: Users,     tour: 'sidebar-customers' },
];
const TABS_AFTER = [
  { to: '/owners',     labelKey: 'mobileTabs.owners',     icon: UserCircle },
  { to: '/calculator', labelKey: 'mobileTabs.calculator', icon: Calculator },
];

export default function MobileTabBar() {
  const { t } = useTranslation('nav');
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
      {/* The bar is navigation, not a tablist — tabs imply tab-panel
          pairs which this doesn't have. role="tablist" without
          role="tab" children fails axe's aria-required-children rule. */}
      <nav className="mtb" aria-label={t('mobileTabs.navAria')}>
        <div className="mtb-inner">
          {TABS_BEFORE.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-tour={tab.tour}
              className={({ isActive }) => `mtb-item ${isActive ? 'active' : ''}`}
              onClick={() => haptics.tap()}
            >
              <span className="mtb-icon"><tab.icon /></span>
              <span className="mtb-label">{t(tab.labelKey)}</span>
            </NavLink>
          ))}

          <button
            className="mtb-item mtb-add"
            onClick={openAddSheet}
            aria-label={t('mobileTabs.addMenuAria')}
            type="button"
          >
            <span className="mtb-icon mtb-add-icon-pill"><Plus /></span>
            <span className="mtb-label">{t('mobileTabs.more')}</span>
          </button>

          {TABS_AFTER.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `mtb-item ${isActive ? 'active' : ''}`}
              onClick={() => haptics.tap()}
            >
              <span className="mtb-icon"><tab.icon /></span>
              <span className="mtb-label">{t(tab.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {addOpen && (
        <div className="mtb-add-backdrop" onClick={() => setAddOpen(false)}>
          <div className="mtb-add-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mtb-add-grabber" />
            <h4>{t('mobileAddSheet.title')}</h4>

            <button className="mtb-add-row" onClick={go('/properties/new')}>
              <span className="mtb-add-icon prop"><Home size={18} /></span>
              <span className="mtb-add-text">
                <strong>{t('mobileAddSheet.newProperty')}</strong>
                <small>{t('mobileAddSheet.newPropertySub')}</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/customers/new')}>
              <span className="mtb-add-icon lead"><UserPlus size={18} /></span>
              <span className="mtb-add-text">
                <strong>{t('mobileAddSheet.newLead')}</strong>
                <small>{t('mobileAddSheet.newLeadSub')}</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/deals')}>
              <span className="mtb-add-icon deal"><Handshake size={18} /></span>
              <span className="mtb-add-text">
                <strong>{t('mobileAddSheet.deals')}</strong>
                <small>{t('mobileAddSheet.dealsSub')}</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-row" onClick={go('/')}>
              <span className="mtb-add-icon dash"><LayoutDashboard size={18} /></span>
              <span className="mtb-add-text">
                <strong>{t('mobileAddSheet.dashboard')}</strong>
                <small>{t('mobileAddSheet.dashboardSub')}</small>
              </span>
              <span className="mtb-add-arrow">›</span>
            </button>

            <button className="mtb-add-cancel" onClick={() => setAddOpen(false)}>
              <X size={14} />
              {t('mobileAddSheet.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
