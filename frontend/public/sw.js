// Estia service worker.
//
// Strategy: network-first (no offline support). The SW exists because
// the PWA manifest expects one and because we use it to invalidate
// stale Capacitor / browser caches when we ship CSS that the JS depends
// on (otherwise users see "new layout, old styles" — header buttons
// clipping off the screen because the cached CSS still has the old
// grid template).
//
// CACHE_NAME bump: increment this when shipping CSS that breaks
// layout if old. On activate we wipe every other cache name AND tell
// every controlled tab to do a hard reload — that's the only reliable
// way to dodge iOS Safari's HTML cache without asking the user to
// force-quit the app.
const CACHE_NAME = 'estia-v3-2026-04-20';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete every cache that isn't the current one.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Hard-refresh every tab the SW now controls so they pick up the
    // new HTML + matching CSS together. Without this, users with a
    // stale bundle see new JS rendering against old CSS until they
    // manually force-quit the app.
    const all = await self.clients.matchAll({ type: 'window' });
    for (const c of all) {
      try { c.navigate(c.url); } catch { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  // Network-first for everything. Cache fallback only on full network
  // failure so offline still shows the last-seen page.
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
  } else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
