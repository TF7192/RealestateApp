// Mobile bottom tab bar — 4 quick-access tabs + an "עוד" tab that
// opens a full-screen sheet with the complete nav tree. The sheet
// replaces the previous hamburger drawer so mobile users only have
// one entry point into navigation (the bottom bar).

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Users, Building2, MoreHorizontal,
  X, Sparkles, LogOut,
} from 'lucide-react';
import haptics from '../lib/haptics';

const T = {
  cream: '#f7f3ec', cream2: '#efe9df',
  white: '#ffffff', ink: '#1e1a14',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  muted: '#6b6356',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Matches the claude-design bundle's mobile TabBar: dashboard · leads ·
// properties · ai · more. Sparkles marks the AI tab as premium so the
// gold hue pulls the eye to the sprint-5 feature surface.
const QUICK_TABS = [
  { to: '/dashboard',  label: 'בית',     Icon: Home },
  { to: '/customers',  label: 'לידים',    Icon: Users },
  { to: '/properties', label: 'נכסים',    Icon: Building2 },
  { to: '/ai',         label: 'Estia AI', Icon: Sparkles },
];

export default function MobileTabBar({
  primary = [], tools = [], favorites = [],
  onLogout, agentName, agentInitial, agentSub,
}) {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => { setSheetOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const isActive = (to) => {
    if (to === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <>
      <nav
        aria-label="ניווט ראשי"
        style={{
          ...FONT,
          position: 'fixed', insetInline: 0, bottom: 0, zIndex: 40,
          /* Solid cream background — was rgba+backdropFilter:blur(12px),
             which forced WKWebView to recomposite the bar on every
             scroll frame (the blurred content under it changes every
             frame). The ongoing recompositing also captured pointer
             events, blocking taps during momentum scroll. Solid bg
             promotes the bar to a static GPU layer that never repaints. */
          background: T.cream,
          borderTop: `1px solid ${T.border}`,
          padding: '8px 8px calc(4px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', justifyContent: 'space-around',
          /* Force this element onto its own GPU layer so scroll under it
             never marks it as "needs repaint" — taps register
             instantly even during momentum scroll. */
          transform: 'translateZ(0)',
          willChange: 'transform',
          /* Explicit touch-action: manipulation kills any inherited
             touch-action from the scrolling parent that would
             otherwise delay taps until the scroll settles. */
          touchAction: 'manipulation',
        }}
      >
        {QUICK_TABS.map((tab) => {
          const on = isActive(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              onPointerUp={() => haptics.tap()}
              style={{
                ...FONT, textDecoration: 'none',
                padding: '6px 8px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 2,
                color: on ? T.gold : T.muted, flex: 1,
                touchAction: 'manipulation',
                /* iOS click is canceled when its preceding touchstart
                   was followed by a touchmove (= scroll). Using
                   pointer events above + this CSS makes the tab bar
                   feel like a native iOS tab bar — taps at any time. */
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <tab.Icon size={22} strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
              <span style={{ fontSize: 10, fontWeight: on ? 700 : 500 }}>{tab.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onPointerUp={() => { haptics.press(); setSheetOpen(true); }}
          aria-label="עוד"
          style={{
            ...FONT, border: 'none', background: 'transparent', cursor: 'pointer',
            padding: '6px 8px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2, color: T.muted, flex: 1,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
          <span style={{ fontSize: 10, fontWeight: 500 }}>עוד</span>
        </button>
      </nav>

      {sheetOpen && (
        <MoreSheet
          primary={primary} tools={tools} favorites={favorites}
          isActive={isActive}
          agentName={agentName} agentInitial={agentInitial} agentSub={agentSub}
          onLogout={onLogout}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

function MoreSheet({ primary, tools, favorites, isActive, agentName, agentInitial, agentSub, onLogout, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ניווט מלא"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(20,17,13,0.45)', backdropFilter: 'blur(2px)',
        animation: 'estia-sheet-fade 160ms ease-out',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          ...FONT,
          position: 'fixed', insetInline: 0, bottom: 0, zIndex: 91,
          background: T.cream, color: T.ink,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -20px 50px rgba(20,17,13,0.22)',
          animation: 'estia-sheet-slide 240ms ease-out',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'center',
          padding: '10px 0 2px',
        }}>
          <div style={{ width: 44, height: 4, borderRadius: 99, background: 'rgba(30,26,20,0.18)' }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 14px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 99, background: T.gold, color: T.ink,
              display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15,
            }}>{agentInitial || 'א'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentName}</div>
              <div style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentSub}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: T.white, border: `1px solid ${T.border}`,
              width: 34, height: 34, borderRadius: 99, cursor: 'pointer',
              color: T.ink, display: 'grid', placeItems: 'center',
            }}
          ><X size={16} /></button>
        </div>

        <SheetSection label="עבודה יומיומית" items={primary} isActive={isActive} />
        <SheetSection label="כלים" items={tools} isActive={isActive} />
        {favorites.length > 0 && (
          <SheetSection
            label="המועדפים"
            items={favorites.map((f) => ({ to: f.to, label: f.label, Icon: Sparkles, k: f.key }))}
            isActive={isActive}
          />
        )}

        <div style={{
          padding: '12px 20px 4px', borderTop: `1px solid ${T.border}`,
          marginTop: 12,
        }}>
          <button
            type="button"
            onClick={onLogout}
            style={{
              ...FONT, width: '100%',
              background: T.white, border: `1px solid ${T.border}`,
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              color: T.ink, display: 'inline-flex', gap: 10, alignItems: 'center',
              justifyContent: 'center', fontSize: 14, fontWeight: 700,
            }}
          >
            <LogOut size={16} /> התנתקות
          </button>
        </div>
      </aside>
      <style>{`
        @keyframes estia-sheet-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes estia-sheet-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important; }
          [role="dialog"] > aside { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function SheetSection({ label, items, isActive }) {
  if (!items?.length) return null;
  return (
    <div style={{ padding: '6px 12px 12px' }}>
      <div style={{
        fontSize: 10, color: T.muted, fontWeight: 800, letterSpacing: 1.2,
        textTransform: 'uppercase', padding: '8px 10px 6px',
      }}>{label}</div>
      <div style={{
        background: T.white, border: `1px solid ${T.border}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {items.map((item, i) => {
          const on = isActive(item.to);
          const Icon = item.Icon;
          return (
            <NavLink
              key={item.k || item.to}
              to={item.to}
              onClick={() => haptics.tap()}
              style={{
                ...FONT, textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 16px',
                borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                color: on ? T.goldDark : T.ink,
                background: on ? T.goldSoft : T.white,
                fontSize: 15, fontWeight: on ? 700 : 500,
              }}
            >
              {Icon && (
                <span style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: on ? 'rgba(180,139,76,0.2)' : T.cream2,
                  color: on ? T.gold : T.muted,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon size={17} />
                </span>
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.premium && <Sparkles size={14} style={{ color: T.gold }} />}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
