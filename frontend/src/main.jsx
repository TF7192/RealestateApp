import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './index.css';
import App from './App.jsx';
import { initAnalytics } from './lib/analytics.js';

// One-shot client-side reset: bump this string whenever we need every
// existing browser session to drop its per-page-tour markers (and any
// other device-only UX flags). We stash the last-seen version in
// localStorage under `estia-client-ver`; when it doesn't match, we wipe
// the keys below once, then write the new version. Safe to run on every
// page-load thanks to the equality guard.
const ESTIA_CLIENT_VER = '2026-04-18-tour-reset-2';
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem('estia-client-ver') !== ESTIA_CLIENT_VER) {
      Object.keys(localStorage).forEach((k) => {
        if (
          k.startsWith('estia-page-tour:') ||
          k.startsWith('estia-draft:') ||
          k.startsWith('react-joyride')
        ) {
          localStorage.removeItem(k);
        }
      });
      localStorage.setItem('estia-client-ver', ESTIA_CLIENT_VER);
    }
  } catch { /* storage disabled — no-op */ }
}

// PostHog bootstrap — no-op when VITE_POSTHOG_KEY is unset (dev).
//
// Lighthouse (2026-04-18) flagged PostHog's /e endpoint sitting in the
// critical render path for 3.3s, dominating LCP. Deferring init to
// requestIdleCallback (with a 2s fallback) lets the first paint and the
// initial /me + /dashboard calls win the network without fighting
// PostHog's analytics payload for bandwidth. Session replay still starts
// automatically once init runs — we just don't kick it off before the
// first meaningful paint.
if (typeof window !== 'undefined') {
  const boot = () => { try { initAnalytics(); } catch { /* never crash */ } };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(boot, { timeout: 2000 });
  } else {
    setTimeout(boot, 1500);
  }
}

// iOS keyboard handling + zoom guards.
//
// When a text input gains focus iOS raises the keyboard, which usually hides
// the field. We:
//   1. Subscribe to Capacitor's Keyboard plugin (native app only) to get the
//      exact keyboard height and expose it as a CSS var (--kb-h) so pages can
//      add bottom padding while the keyboard is up.
//   2. In both native and web, always scroll the focused element into view
//      after a frame so nothing is hidden.
if (typeof window !== 'undefined') {
  let kbHeight = 0;
  const setKb = (h) => {
    kbHeight = h || 0;
    document.documentElement.style.setProperty('--kb-h', `${kbHeight}px`);
    document.body.classList.toggle('kb-open', kbHeight > 0);
  };
  setKb(0);

  // Hook the Capacitor keyboard plugin when available (iPhone app).
  import('@capacitor/core').then(({ Capacitor }) => {
    if (!Capacitor?.isNativePlatform?.()) return;
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', (info) => setKb(info.keyboardHeight));
      Keyboard.addListener('keyboardDidShow',  (info) => setKb(info.keyboardHeight));
      Keyboard.addListener('keyboardWillHide', () => setKb(0));
      Keyboard.addListener('keyboardDidHide',  () => setKb(0));
    }).catch(() => {});
  }).catch(() => {});

  // Scroll focused input into view — on both native and web. Uses the
  // VisualViewport when available (mobile Safari) to measure the actual
  // visible area after the keyboard opens.
  const bringIntoView = (el) => {
    if (!el) return;
    const vv = window.visualViewport;
    const rect = el.getBoundingClientRect();
    const margin = 24; // small buffer so the field isn't flush with the keyboard
    const viewportH = vv?.height ?? window.innerHeight;
    if (rect.bottom > viewportH - margin || rect.top < margin) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* ignore */ }
    }
  };
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t) return;
    const tag = (t.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    // Wait for the keyboard animation to finish before measuring
    setTimeout(() => bringIntoView(t), 320);
    setTimeout(() => bringIntoView(t), 650);
  });
  // Re-run on visualViewport resize (keyboard opens/closes)
  window.visualViewport?.addEventListener('resize', () => {
    const el = document.activeElement;
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') bringIntoView(el);
  });

  // Belt-and-suspenders: block multi-touch pinch-zoom + double-tap zoom.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
