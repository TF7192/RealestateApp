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
  let kbHeight = 0;
  let preFocusScrollY = null;
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
      // Note: we used to call `Keyboard.setScroll({ isDisabled: true })`
      // here, intending to suppress the Keyboard plugin's auto-scroll-to-
      // focused-input assist. But in practice it appears to also gate
      // user-initiated document scroll in the WKWebView on some iOS
      // versions — every scroll attempt rubber-banded without actually
      // moving the page. Removed so iOS handles scroll natively; our
      // focusin handler already does a more conservative input-into-view
      // nudge that doesn't need the plugin's help.
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
      // `button`/`checkbox`/`submit`/etc. don't open the keyboard — skip.
      return ['text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'datetime-local', 'time', 'month', 'week'].includes(t);
    }
    if (tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    return false;
  };

  // Scroll just enough to bring the focused input above the keyboard —
  // NOT centered. Critical for the "feels like a native iPhone app"
  // metric: use INSTANT scroll, not smooth. WKWebView's smooth-scroll
  // animation is software-rendered and burns CPU — on every character
  // the user types we were scheduling a 300ms animated scroll that
  // read as input lag. Instant scroll is one layout pass, a few ms,
  // and indistinguishable from native iOS keyboard behaviour.
  const nudgeIntoView = (el) => {
    if (!el) return;
    const vv = window.visualViewport;
    const viewportH = vv?.height ?? window.innerHeight;
    const rect = el.getBoundingClientRect();
    const buffer = 24;
    if (rect.bottom > viewportH - buffer) {
      const delta = Math.ceil(rect.bottom - (viewportH - buffer));
      window.scrollBy(0, delta);            // instant
    } else if (rect.top < buffer) {
      window.scrollBy(0, rect.top - buffer); // instant
    }
  };

  // User feedback: "I want the screen to stay in the same place when
  // I click on an input." iOS WKWebView already scrolls the content
  // natively when a focused input would be covered by the keyboard —
  // our JS nudge was doing its own scroll on top of that, which read
  // as the page "jumping" on tap. Drop the manual focus-scroll
  // entirely on native iOS. On web keep a very light rAF nudge so
  // desktop Safari (which doesn't auto-scroll) still works.
  const isNativeIOS = (() => {
    try {
      // Capacitor adds `ios` as the platform and sets navigator.userAgent
      // with "EstiaApp/..." (per capacitor.config.json). Either check is
      // fine; prefer the UA check so we don't import Capacitor eagerly.
      return /EstiaApp\//.test(navigator.userAgent || '');
    } catch { return false; }
  })();
  if (!isNativeIOS) {
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!isTextInput(t)) return;
      if (preFocusScrollY == null) preFocusScrollY = window.scrollY;
      requestAnimationFrame(() => nudgeIntoView(t));
    });

    document.addEventListener('focusout', (e) => {
      if (!isTextInput(e.target)) return;
      setTimeout(() => {
        const active = document.activeElement;
        if (isTextInput(active)) return;
        if (preFocusScrollY != null) {
          window.scrollTo(0, preFocusScrollY);
          preFocusScrollY = null;
        }
      }, 50);
    });

    let vvPending = false;
    window.visualViewport?.addEventListener('resize', () => {
      if (vvPending) return;
      vvPending = true;
      requestAnimationFrame(() => {
        vvPending = false;
        const el = document.activeElement;
        if (isTextInput(el)) nudgeIntoView(el);
      });
    });
  }

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
