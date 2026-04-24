// Mobile bottom tab bar — 1:1 port of the bundle's TabBar
// (estia-new-project/project/src/mobile/primitives.jsx). Five tabs,
// gold on active, backdrop blur, cream translucent background. The
// design's "עוד" tab maps to /settings (closest in-app equivalent).

import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Users, Building2, CalendarDays, MoreHorizontal,
} from 'lucide-react';
import haptics from '../lib/haptics';

const T = {
  cream: '#f7f3ec',
  gold: '#b48b4c',
  muted: '#6b6356',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const TABS = [
  { to: '/dashboard',  label: 'בית',    Icon: Home },
  { to: '/customers',  label: 'לידים',   Icon: Users },
  { to: '/properties', label: 'נכסים',   Icon: Building2 },
  { to: '/reminders',  label: 'יומן',    Icon: CalendarDays },
  { to: '/settings',   label: 'עוד',     Icon: MoreHorizontal },
];

export default function MobileTabBar() {
  const location = useLocation();
  const isActive = (to) => {
    if (to === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <nav
      aria-label="ניווט ראשי"
      style={{
        ...FONT,
        position: 'fixed', insetInline: 0, bottom: 0, zIndex: 40,
        background: 'rgba(247,243,236,0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${T.border}`,
        padding: '8px 12px calc(4px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', justifyContent: 'space-around',
      }}
    >
      {TABS.map((tab) => {
        const on = isActive(tab.to);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            onClick={() => haptics.tap()}
            style={{
              ...FONT, border: 'none', background: 'transparent',
              textDecoration: 'none', cursor: 'pointer',
              padding: '6px 8px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
              color: on ? T.gold : T.muted, flex: 1,
            }}
          >
            <tab.Icon size={22} strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 500 }}>{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
