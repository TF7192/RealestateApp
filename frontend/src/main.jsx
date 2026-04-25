import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './index.css';
import './styles/print.css';
// i18n was removed (PERF-004): the app is Hebrew-only and the English
// locale JSON files were empty stubs. All Hebrew strings now live
// inline in the JSX, matching the convention from CLAUDE.md.
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

// Keyboard handling: NONE.
//
// User feedback, repeated: "when I click on to write, can you not do
// anything? I mean, keep it like iPhone and Apple intended?"
//
// So we deliberately ship ZERO focus/keyboard scroll behaviour. iOS is
// responsible for the whole keyboard experience. The previous passes
// (`nudgeIntoView`, visualViewport.resize handlers, scroll restore on
// blur, Keyboard.addListener hooks) all removed.
//
// Relevant Capacitor config already in place:
//   - Keyboard.resize: "none" — WebView doesn't resize on keyboard open
//   - StatusBar.overlaysWebView: false — no top-bar chrome shift
//
// The only remaining document-level listeners below are zoom guards
// (pinch / double-tap) which are a11y-neutral and don't touch scroll.
if (typeof window !== 'undefined') {
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

// Vite dispatches `vite:preloadError` when a dynamic-chunk preload
// (`<link rel=preload as=style|modulepreload>`) fails — classically
// during deploys, when the new build renames chunks and the old
// `index.html` in a user's browser points at files that just 404/503'd,
// or when the edge briefly flaps to 503 as the nginx container
// recreates. Without this listener the helper re-throws and React's
// RootErrorBoundary renders "משהו השתבש". A single reload picks up the
// fresh index.html and the current chunk names. Guarded by
// sessionStorage so we don't loop if the reload itself fails the same
// way (e.g. origin actually down).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    const RELOAD_KEY = 'estia-preload-reload-at';
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10_000) return; // already bounced once in last 10s
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  });
}

// F-2.1 — lazy import so the boundary itself doesn't regress first-paint.
// It's tiny (<1 kB) but we keep the main-chunk policy consistent.
import RootErrorBoundary from './components/RootErrorBoundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
