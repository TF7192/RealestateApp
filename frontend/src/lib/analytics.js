// PostHog analytics helper — one place the rest of the app imports from.
//
// Init is opt-in via env. In dev / when the token isn't set, every call here
// is a no-op so we don't spam a real PostHog project from localhost.
//
// Required env (set at build time via Vite):
//   VITE_POSTHOG_KEY       — phc_... project token
//   VITE_POSTHOG_HOST      — https://us.i.posthog.com  (or https://eu.i.posthog.com)
//   VITE_POSTHOG_ENABLED   — 'true' to enable outside of production

import posthog from 'posthog-js';

const KEY     = import.meta.env.VITE_POSTHOG_KEY || '';
const HOST    = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const ENABLED = (import.meta.env.VITE_POSTHOG_ENABLED === 'true') ||
                (import.meta.env.PROD && !!KEY);

let ready = false;

export function initAnalytics() {
  if (ready || !ENABLED || !KEY) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      // Route tracking is manual (we fire page_view on React Router changes
      // via usePageviewTracking). Disable PostHog's default so we don't
      // double-count SPA history pushes.
      capture_pageview: false,
      capture_pageleave: true,
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
      disable_session_recording: false,
      persistence: 'localStorage+cookie',
      loaded: (p) => {
        if (import.meta.env.DEV) p.debug(false);
      },
    });
    ready = true;
  } catch (e) {
    // Never crash the app if PostHog fails to init
    // eslint-disable-next-line no-console
    console.warn('PostHog init failed:', e);
  }
}

export function identify(user) {
  if (!ready || !user?.id) return;
  try {
    posthog.identify(user.id, {
      email: user.email,
      role: user.role,
      display_name: user.displayName,
      // Intentionally omit phone — keep PII minimal
    });
  } catch { /* no-op */ }
}

export function resetIdentity() {
  if (!ready) return;
  try { posthog.reset(); } catch { /* no-op */ }
}

export function track(event, props = {}) {
  if (!ready) return;
  try { posthog.capture(event, props); } catch { /* no-op */ }
}

export function page(path, extra = {}) {
  if (!ready) return;
  try {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      path,
      ...extra,
    });
  } catch { /* no-op */ }
}
