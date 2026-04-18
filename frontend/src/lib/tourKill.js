// Global tour kill-switch.
//
// One tap on Skip/Done anywhere flips a single in-memory flag AND the
// durable localStorage key. Every mounted tour component (OnboardingTour
// + PageTour on every page) subscribes to the same store and re-renders
// the instant the flag goes true. Because we don't rely on Joyride's own
// callback chain, there's no race condition — the kill happens SYNC
// before any navigation can occur.
//
// Persistence layers (most to least durable):
//   1. Server: POST /api/me/tutorial/complete via keepalive fetch.
//      Browser guarantees this request even if the tab closes.
//   2. localStorage 'estia-tour-killed'=1. Survives navigation, reloads,
//      and logout on the same device.
//   3. In-memory `killed` bool + subscriber notification. The only
//      path fast enough to stop a follow-up tour that's already been
//      scheduled by a setTimeout on another page.

const STORAGE_KEY = 'estia-tour-killed';
const LEGACY_DISMISS = 'estia-tour-dismissed';

let killed = (() => {
  try {
    return !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_DISMISS));
  } catch { return false; }
})();

const listeners = new Set();

export function areToursKilled() {
  return killed;
}

export function subscribeTourKill(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Synchronous kill — called on the Skip/Done click. Returns
// immediately; server write runs in the background with keepalive so
// it completes even if the tab unloads.
export function killAllTours() {
  if (killed) return;
  killed = true;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
    localStorage.setItem(LEGACY_DISMISS, '1');
  } catch { /* storage disabled */ }

  // Visual escape hatch — hide any Joyride DOM still in the tree.
  try { document.body.classList.add('tour-dead'); } catch { /* ignore */ }

  // Notify every subscribed tour component. They'll re-render null
  // on the very next tick.
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  // Server write — belt-and-braces: fire BOTH sendBeacon (guaranteed
  // to survive page unload, same-origin so cookies are sent) AND a
  // keepalive fetch. Either one lands → server flag flips to true.
  try {
    if (navigator.sendBeacon) {
      // Empty blob is the trick to force a POST without content-type
      // issues on older Safari.
      navigator.sendBeacon('/api/me/tutorial/complete', new Blob([], { type: 'application/json' }));
    }
  } catch { /* ignore */ }
  try {
    fetch('/api/me/tutorial/complete', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Accept': 'application/json' },
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Called when the user logs out so a new sign-in starts fresh. Does
// NOT clear localStorage — that's per-account and the server flag is
// the source of truth. But it does reset the in-memory bool so the
// login flow can read fresh server state.
export function resetTourKill() {
  killed = (() => {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  })();
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}
