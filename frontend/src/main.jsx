import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './index.css';
import './styles/print.css';
// i18n must init before the first React render so useTranslation() has
// resources on the initial paint. The module is side-effecty — importing
// it calls i18n.init(). Default language is Hebrew; English stubs load
// alongside. See frontend/src/i18n/index.js for the resource map.
import './i18n';
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
// Design goal: the page MUST NOT jump when the user focuses / blurs an
// input. Previously we called `scrollIntoView({ block: 'center' })` on
// focus which repositioned the whole page, and iOS WKWebView's built-in
// scroll-assist doubled-down on it — blurring often landed at a
// different scroll than where the user tapped. Now:
//   1. Subscribe to Capacitor's Keyboard plugin (native app only) to get
//      the exact keyboard height and expose it as a CSS var (--kb-h) so
//      pages can add bottom padding while the keyboard is up.
//   2. Disable WKWebView's built-in scroll-assist (Keyboard.setScroll).
//      We handle scroll manually below.
//   3. On focusin, capture window.scrollY. After the keyboard is up, if
//      and only if the focused field is hidden behind the keyboard, we
//      scroll by the minimum delta needed (scrollBy, not scrollIntoView
//      block:center — that would drag the whole page).
//   4. On focusout, restore the captured scrollY UNLESS focus is moving
//      to another input — in which case we leave the page where it is so
//      the next input doesn't provoke a second hop.
if (typeof window !== 'undefined') {
  // Scroll restoration target: when the keyboard closes (or focus
  // leaves all inputs), we snap the document back here so the user
  // isn't left mid-form-scroll.
  let preFocusScrollY = null;

  // Actual iOS keyboard height, from the Capacitor Keyboard plugin.
  // Stays at 0 until the keyboard opens; updated on willShow/didShow
  // and cleared on hide. We DON'T expose this as --kb-h anymore —
  // nothing in CSS pushes elements up on keyboard-open (user feedback:
  // "I don't want anything to go up"). We only use the height below,
  // in the focusin handler, to decide whether the focused input is
  // actually covered and needs a minimum-possible document scroll.
  let kbHeight = 0;
  document.documentElement.style.setProperty('--kb-h', '0px');

  // Hook the Capacitor keyboard plugin when available (iPhone app).
  import('@capacitor/core').then(({ Capacitor }) => {
    if (!Capacitor?.isNativePlatform?.()) return;
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const nudgeActive = () => {
        // Re-run the cover check when the keyboard size actually
        // changes (e.g. suggestion bar expands, split-keyboard). If
        // the currently-focused input has just been covered, scroll.
        const el = document.activeElement;
        if (isTextInput(el)) nudgeIfCovered(el);
      };
      Keyboard.addListener('keyboardWillShow', (info) => {
        kbHeight = info?.keyboardHeight || 0;
      });
      Keyboard.addListener('keyboardDidShow', (info) => {
        kbHeight = info?.keyboardHeight || 0;
        nudgeActive();
      });
      Keyboard.addListener('keyboardWillHide', () => { kbHeight = 0; });
      Keyboard.addListener('keyboardDidHide', () => {
        kbHeight = 0;
        // Restore pre-focus scroll when the keyboard closes, so the
        // agent isn't left halfway down a form that re-expanded.
        if (preFocusScrollY != null) {
          window.scrollTo(0, preFocusScrollY);
          preFocusScrollY = null;
        }
      });
      // Hide the iOS "Previous / Next / Done" accessory bar; it takes
      // extra vertical space and causes cascading re-layouts on inputs.
      Keyboard.setAccessoryBarVisible?.({ isVisible: false }).catch(() => {});
    }).catch(() => {});
  }).catch(() => {});

  const isTextInput = (el) => {
    if (!el || el === document.body) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'select') return true;
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'datetime-local', 'time', 'month', 'week'].includes(t);
    }
    if (tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    return false;
  };

  // Only scroll the document when the focused input is ACTUALLY
  // covered by the keyboard — and scroll the minimum amount needed.
  // All other page chrome (FABs, headers, tab bars) stays put because
  // they're position:fixed relative to the viewport, which is
  // unchanged (Capacitor's Keyboard.resize is "none", so the WebView
  // itself doesn't resize when the keyboard opens).
  //
  // kbHeight is filled in by the Capacitor Keyboard plugin above.
  // On web (desktop Safari / Chrome / Firefox) we fall back to the
  // visualViewport API, which shrinks naturally when virtual keyboards
  // appear — the same math works both places.
  const nudgeIfCovered = (el) => {
    if (!el) return;
    const vv = window.visualViewport;
    const viewportH = vv?.height ?? window.innerHeight;
    // On native iOS the WebView stays full-height (resize:none), so
    // visualViewport.height equals window.innerHeight. We have to
    // subtract the real keyboard height from the plugin to find the
    // true visible area.
    const visibleBottom = viewportH - kbHeight;
    const rect = el.getBoundingClientRect();
    const buffer = 24;
    if (rect.bottom > visibleBottom - buffer) {
      const delta = Math.ceil(rect.bottom - (visibleBottom - buffer));
      // Instant scroll — smooth-scroll inside WKWebView is a software
      // animation that reads as input lag. One layout pass.
      window.scrollBy(0, delta);
    } else if (rect.top < buffer) {
      window.scrollBy(0, rect.top - buffer);
    }
    // If the input was already visible above the keyboard, we do
    // NOTHING — the screen stays exactly where it was, no jumps.
  };

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!isTextInput(t)) return;
    if (preFocusScrollY == null) preFocusScrollY = window.scrollY;
    // Run on the next frame so the browser has a chance to register
    // the focus (layout may shift) before we measure.
    requestAnimationFrame(() => nudgeIfCovered(t));
  });

  document.addEventListener('focusout', (e) => {
    if (!isTextInput(e.target)) return;
    // If focus is moving to another input (tab / next-field), skip —
    // the new focusin will handle positioning. Only restore when focus
    // really left all inputs.
    setTimeout(() => {
      const active = document.activeElement;
      if (isTextInput(active)) return;
      if (preFocusScrollY != null && kbHeight === 0) {
        // Only restore once the keyboard has actually closed; otherwise
        // we'd fight the cover-check above.
        window.scrollTo(0, preFocusScrollY);
        preFocusScrollY = null;
      }
    }, 50);
  });

  // Desktop Safari / mobile web: visualViewport shrinks when a virtual
  // keyboard opens. Coalesce via rAF so typing doesn't re-trigger the
  // nudge on every keystroke.
  let vvPending = false;
  window.visualViewport?.addEventListener('resize', () => {
    if (vvPending) return;
    vvPending = true;
    requestAnimationFrame(() => {
      vvPending = false;
      const el = document.activeElement;
      if (isTextInput(el)) nudgeIfCovered(el);
    });
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
