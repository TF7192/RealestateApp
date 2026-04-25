// PostHog analytics helper — one place the rest of the app imports from.
//
// Init is opt-in via env. In dev / when the token isn't set, every call here
// is a no-op so we don't spam a real PostHog project from localhost.
//
// Required env (set at build time via Vite):
//   VITE_POSTHOG_KEY       — phc_... project token
//   VITE_POSTHOG_HOST      — https://us.i.posthog.com  (or https://eu.i.posthog.com)
//   VITE_POSTHOG_ENABLED   — 'true' to enable outside of production
//
// Perf (2026-04-22): posthog-js is dynamically imported inside
// initAnalytics() so the ~80 KB bundle stays out of the initial page
// load. main.jsx already wraps initAnalytics in requestIdleCallback;
// combined with the dynamic import, PostHog now lands on the wire AFTER
// the first meaningful paint + the agent's /me + /dashboard calls.

const KEY     = import.meta.env.VITE_POSTHOG_KEY || '';
const HOST    = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const ENABLED = (import.meta.env.VITE_POSTHOG_ENABLED === 'true') ||
                (import.meta.env.PROD && !!KEY);

// `posthog` is populated by the dynamic import once initAnalytics runs.
// Callers must never depend on ready state — helpers queue everything
// until init finishes so nothing is silently dropped.
let posthog = null;
let ready = false;

// Pre-init call queue. Anything our wrappers receive before
// initAnalytics() finishes (identify, track, page, resetIdentity) is
// parked here and replayed against the real posthog instance once init
// resolves. Before: the wrappers bailed early with `if (!ready) return`
// and every event fired between page load and the idle-callback init
// was silently dropped — including the post-login identify, which left
// all frontend events attached to anonymous Persons with no way to
// correlate them to agents. After: the queue is replayed in order on
// init success, so an identify that happens during init is applied
// BEFORE later captures, and every subsequent event carries the
// identity super-properties.
const preInitQueue = [];
const PRE_INIT_MAX = 200;   // safety cap so a broken init can't OOM
const enqueue = (fn) => {
  if (preInitQueue.length < PRE_INIT_MAX) preInitQueue.push(fn);
};

export async function initAnalytics() {
  if (ready || !ENABLED || !KEY) return;
  try {
    // Dynamic import keeps posthog-js out of the critical-path bundle.
    // Vite hoists this into its own chunk (posthog-js-<hash>.js) and
    // the browser fetches it only when the idle callback fires.
    const mod = await import('posthog-js');
    posthog = mod.default || mod;
    posthog.init(KEY, {
      api_host: HOST,
      // Route tracking is manual (we fire page_view on React Router changes
      // via usePageviewTracking). Disable PostHog's default so we don't
      // double-count SPA history pushes.
      capture_pageview: false,
      capture_pageleave: true,
      // Attach every event to a Person — even the ones that fire before the
      // agent has been identified (initial pageview, autocapture clicks that
      // happen while /me is still in flight). posthog-js's default changed
      // to 'identified_only' in late 1.x, which silently dropped those early
      // events off the Persons screen. 'always' restores the old behaviour:
      // anonymous events create an anon Person, then identify() aliases it
      // onto the real one so nothing is orphaned.
      person_profiles: 'always',
      // Session replay with privacy defaults: mask every input by default
      // (addresses, prices, phone numbers are private), mask text in
      // elements tagged with .ph-mask (forms), block password fields.
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true },
        maskTextSelector: '.ph-mask',
      },
      // Autocapture clicks + form submits — noisy but useful for early funnels
      autocapture: true,
      // Frontend exception autocapture (errors + promise rejections)
      capture_exceptions: true,
      // PERF-022 — RUM web-vitals. PostHog auto-collects LCP / CLS /
      // INP / FCP via the web-vitals JS package; without this flag the
      // SDK ignores those metrics. Enabling it gives us real-user LCP /
      // INP percentiles per route, which are otherwise invisible
      // outside synthetic Lighthouse runs.
      capture_performance: true,
      disable_session_recording: false,
      persistence: 'localStorage+cookie',
      loaded: (p) => {
        if (import.meta.env.DEV) p.debug(false);
      },
    });
    ready = true;
    // Replay anything that was queued while we were booting. Identify
    // calls in the queue get applied first (by virtue of being older),
    // so subsequent captures carry the identity super-properties.
    while (preInitQueue.length) {
      const fn = preInitQueue.shift();
      try { fn(); } catch { /* no-op */ }
    }
  } catch (e) {
    // Never crash the app if PostHog fails to init
     
    console.warn('PostHog init failed:', e);
  }
}

export function identify(user) {
  if (!user?.id) return;
  if (!ready || !posthog) {
    enqueue(() => identify(user));
    return;
  }
  try {
    posthog.identify(user.id, {
      email: user.email,
      role: user.role,
      display_name: user.displayName,
      // Intentionally omit phone — keep PII minimal
    });
    // Register user props as *super-properties* so every subsequent capture
    // (including autocapture, $pageview, session-replay chunks) carries the
    // identity even if the call site forgot to pass it. Without this, events
    // fired from places that don't re-read user context (e.g. error handlers
    // in setTimeout callbacks) could still slip through person-less.
    posthog.register({
      user_id: user.id,
      user_role: user.role,
    });
  } catch { /* no-op */ }
}

export function resetIdentity() {
  if (!ready || !posthog) { enqueue(() => resetIdentity()); return; }
  try {
    // Drop super-properties BEFORE reset so a lingering user_id from the
    // previous session can't ride along on the next anonymous session's
    // events. (posthog.reset() already clears the distinct_id, but registered
    // properties survive across resets unless explicitly unregistered.)
    posthog.unregister('user_id');
    posthog.unregister('user_role');
    posthog.reset();
  } catch { /* no-op */ }
}

export function track(event, props = {}) {
  if (!ready || !posthog) { enqueue(() => track(event, props)); return; }
  try { posthog.capture(event, props); } catch { /* no-op */ }
}

export function getDistinctId() {
  if (!ready || !posthog) return null;
  try {
    const id = posthog.get_distinct_id?.();
    return typeof id === 'string' ? id : null;
  } catch { return null; }
}

export function page(path, extra = {}) {
  if (!ready || !posthog) {
    enqueue(() => page(path, extra));
    return;
  }
  try {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      path,
      ...extra,
    });
  } catch { /* no-op */ }
}
