import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────
// useDocumentTitle — sets <title> per route. Pages can override via
// window.dispatchEvent(new CustomEvent('estia:doctitle', { detail: '…' }))
// ─────────────────────────────────────────────────────────────────
const ROUTE_TITLES = {
  '/':           'דשבורד',
  '/properties': 'נכסים',
  '/customers':  'לקוחות',
  '/deals':      'עסקאות',
  '/transfers':  'העברות',
  '/templates':  'תבניות',
  '/profile':    'פרופיל',
  '/properties/new': 'נכס חדש',
  '/customers/new':  'ליד חדש',
};

function pickTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (/^\/properties\/[^/]+$/.test(pathname)) return 'נכס';
  if (/^\/customers\/[^/]+$/.test(pathname))  return 'לקוח';
  return null;
}

export function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const base = pickTitle(pathname);
    document.title = base ? `Estia · ${base}` : 'Estia';
  }, [pathname]);
  // Pages can override on the fly
  useEffect(() => {
    const onTitle = (e) => {
      const t = e.detail || '';
      document.title = t ? `Estia · ${t}` : 'Estia';
    };
    window.addEventListener('estia:doctitle', onTitle);
    return () => window.removeEventListener('estia:doctitle', onTitle);
  }, []);
}

// ─────────────────────────────────────────────────────────────────
// useGlobalShortcuts — keyboard shortcuts for desktop power-users
//   N → new property
//   L → new lead
//   /  → focus the page's primary search input ([data-search])
//   ?  → open the cheatsheet overlay
//   G then P/C/D/H → go to Properties / Customers / Deals / Home
//   Esc → already handled per-component (modals close themselves)
//
// Skipped when focus is in an input/textarea/contenteditable — no false
// triggers while the agent types.
// ─────────────────────────────────────────────────────────────────
export function useGlobalShortcuts({ onOpenPalette, onOpenHelp }) {
  const navigate = useNavigate();
  const [waitingG, setWaitingG] = useState(false);

  const inEditable = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }, []);

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K → palette (works even from inputs)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette?.();
        return;
      }

      // The rest only fires when the user is NOT typing
      if (inEditable()) {
        if (waitingG) setWaitingG(false);
        return;
      }
      if (mod || e.altKey) return; // ignore other modifier combos

      // Two-key Vim-style "g" prefix
      if (waitingG) {
        const k = e.key.toLowerCase();
        e.preventDefault();
        setWaitingG(false);
        if (k === 'p') navigate('/properties');
        else if (k === 'c') navigate('/customers');
        else if (k === 'd') navigate('/deals');
        else if (k === 'h') navigate('/');
        else if (k === 't') navigate('/templates');
        return;
      }

      switch (e.key) {
        case 'n':
        case 'N': {
          e.preventDefault();
          navigate('/properties/new');
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          navigate('/customers/new');
          break;
        }
        case '/': {
          e.preventDefault();
          const search = document.querySelector('[data-search]');
          if (search && typeof search.focus === 'function') search.focus();
          break;
        }
        case '?': {
          e.preventDefault();
          onOpenHelp?.();
          break;
        }
        case 'g':
        case 'G': {
          e.preventDefault();
          setWaitingG(true);
          // auto-clear after 1.4s
          setTimeout(() => setWaitingG(false), 1400);
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inEditable, navigate, onOpenPalette, onOpenHelp, waitingG]);

  return { waitingG };
}
