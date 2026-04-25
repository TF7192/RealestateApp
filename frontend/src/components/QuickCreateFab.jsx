import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Building2, UserPlus } from 'lucide-react';
import Portal from './Portal';
import useFocusTrap from '../hooks/useFocusTrap';
import haptics from '../lib/haptics';
import './QuickCreateFab.css';

// H2 — Quick-create FAB.
//
// Sits at bottom-inline-end of the authenticated layout. Click opens a
// small popover with three shortcuts (property / lead / deal). Keyboard
// navigable (↑↓ Enter Esc), ARIA-compliant menu semantics.
//
// The FAB is intentionally hidden on routes that already have their
// own sticky action bar (NewProperty, NewLead, etc) + on /login so it
// doesn't overlap or duplicate a primary CTA.

// Routes where the FAB must not render. These either already have a
// sticky action bar (StickyActionBar) or are destination pages for the
// FAB itself (re-opening the creation target is pointless there).
const HIDDEN_EXACT = new Set([
  '/login',
  '/properties/new',
  '/customers/new',
]);

const HIDDEN_PREFIXES = [
  // Detail pages already host their own StickyActionBar.
  { regex: /^\/properties\/[^/]+(\/.*)?$/ },
  { regex: /^\/owners\/[^/]+(\/.*)?$/ },
  // Public customer-facing pages — the agent never sees these authed.
  { regex: /^\/p\// },
  { regex: /^\/a\// },
  { regex: /^\/agents\// },
  { regex: /^\/public\// },
];

function shouldHideOn(pathname) {
  if (HIDDEN_EXACT.has(pathname)) return true;
  // The /properties list page itself also renders a sticky bulk-action
  // bar when items are selected; keep the FAB available there though —
  // selection only kicks the bar in on demand. Properties.jsx + related
  // list pages stay eligible for the FAB.
  return HIDDEN_PREFIXES.some((p) => p.regex.test(pathname));
}

// F-1 — "עסקה חדשה" shortcut removed from the FAB. Deal creation lives
// inside /deals and the flow needs a lead+property pre-selected; the raw
// shortcut landed on the list page and was misleading.
const MENU_ITEMS = [
  { key: 'property', icon: Building2, label: 'נכס חדש', to: '/properties/new' },
  { key: 'lead',     icon: UserPlus,  label: 'ליד חדש', to: '/customers/new' },
];

export default function QuickCreateFab() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  // Trap focus + wire Escape when the popover is open.
  useFocusTrap(open ? menuRef : { current: null }, {
    onEscape: () => setOpen(false),
  });

  // Reset focus index whenever the menu reopens so arrow navigation
  // always starts at the top item.
  useEffect(() => {
    if (open) setFocusIndex(0);
  }, [open]);

  // Move DOM focus when the highlighted index changes.
  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[focusIndex];
    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
    }
  }, [open, focusIndex]);

  // Close the menu when the route changes — any successful navigation
  // should dismiss the popover so it doesn't linger over the new page.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const go = useCallback((to) => {
    setOpen(false);
    navigate(to);
  }, [navigate]);

  const onMenuKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => (i + 1) % MENU_ITEMS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIndex(MENU_ITEMS.length - 1);
    }
  };

  if (shouldHideOn(location.pathname)) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="qcfab-trigger"
        aria-label="יצירה מהירה"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => { haptics.press(); setOpen((v) => !v); }}
      >
        <Plus size={26} aria-hidden="true" />
      </button>

      {open && (
        <Portal>
          {/* Transparent backdrop so clicking outside closes the menu
              without dimming the page — the FAB menu is small and
              shouldn't feel like a modal. */}
          <div
            className="qcfab-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            className="qcfab-menu"
            role="menu"
            aria-label="יצירה מהירה"
            onKeyDown={onMenuKeyDown}
          >
            {MENU_ITEMS.map((item, i) => (
              <button
                key={item.key}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                className="qcfab-menu-item"
                tabIndex={i === focusIndex ? 0 : -1}
                onClick={() => { haptics.tap(); go(item.to); }}
              >
                <item.icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}
