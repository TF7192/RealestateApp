// Sprint 10 — instant-feel navigation via preload-on-hover.
//
// Route chunks are lazy-loaded via React.lazy(() => import(...)) in
// App.jsx. When an agent clicks a nav link for the first time, the
// chunk downloads + parses before the page can even render its
// skeleton — that's the 300-800ms "thinking" delay users notice.
//
// Fix: start the dynamic import on pointer-enter / touchstart / focus
// of the link. By the time the agent clicks, the chunk is already
// hot in the module cache and the route commits instantly.
//
// This module exports a single map of route-path → loader function.
// Layout.jsx reads it and wires `onPointerEnter` / `onFocus` onto
// every sidebar + tab-bar link. Non-lazy routes (Dashboard, Customers,
// Properties, PropertyDetail, CustomerDetail, Login) are already
// bundled and don't need preloading — their entries are no-ops.

const PRELOADERS = {
  // Secondary authed pages — same set that App.jsx lazy()s.
  '/customers/new':    () => import('../pages/NewLead'),
  '/properties/new':   () => import('../pages/NewProperty'),
  '/owners':           () => import('../pages/Owners'),
  '/deals':            () => import('../pages/Deals'),
  '/calendar':         () => import('../pages/Calendar'),
  '/reminders':        () => import('../pages/Reminders'),
  '/reports':          () => import('../pages/Reports'),
  '/activity':         () => import('../pages/ActivityLog'),
  '/notifications':    () => import('../pages/Notifications'),
  '/documents':        () => import('../pages/Documents'),
  '/marketing':        () => import('../pages/Marketing'),
  '/public-matches':   () => import('../pages/PublicMatches'),
  '/transfers':        () => import('../pages/Transfers'),
  '/map':              () => import('../pages/Map'),
  '/office':           () => import('../pages/Office'),
  '/team':             () => import('../pages/Team'),
  '/search':           () => import('../pages/SearchResults'),
  '/profile':          () => import('../pages/Profile'),
  '/agent-card':       () => import('../pages/AgentCard'),
  '/settings':         () => import('../pages/Settings'),
  '/settings/tags':    () => import('../pages/TagSettings'),
  '/contracts':        () => import('../pages/Contracts'),
  '/ai':               () => import('../pages/Ai'),
  '/inbox':            () => import('../pages/Inbox'),
  '/help':             () => import('../pages/Help'),
  '/import':           () => import('../pages/ImportPicker'),
  '/voice-demo':       () => import('../pages/VoiceDemo'),
};

// Fire-once cache so a single hover doesn't repeatedly invoke import().
// Vite + modern bundlers will cache anyway, but this avoids the
// overhead of repeatedly resolving the promise.
const seen = new Set();

export function preloadRoute(path) {
  if (!path || seen.has(path)) return;
  const loader = PRELOADERS[path];
  if (!loader) return;
  seen.add(path);
  try {
    // Fire-and-forget. Failure is fine — the actual click will retry
    // and surface any network error through the real suspense path.
    loader().catch(() => {});
  } catch { /* noop */ }
}

// Convenience attach() — returns the three event props you can spread
// onto a Link or button: onPointerEnter, onFocus, onTouchStart. Keeps
// the call sites terse:
//
//   <Link to="/reminders" {...preloadOn('/reminders')}>…</Link>
export function preloadOn(path) {
  const fire = () => preloadRoute(path);
  return {
    onPointerEnter: fire,
    onFocus: fire,
    onTouchStart: fire,
  };
}
