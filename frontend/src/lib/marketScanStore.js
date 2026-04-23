// Market-context scan store — parallels yad2ScanStore for the
// nadlan.gov.il Playwright crawl behind PropertyDetail's MarketContext
// card.
//
// Why a store at all:
//   1. Cloudflare's 100s edge timeout kills long crawls mid-flight when
//      the client holds a single blocking fetch. The server now returns
//      a jobId and we poll; the store owns that polling so the card can
//      unmount (or the agent can navigate away) without losing the
//      outcome.
//   2. A single click should never spawn two crawls. We key in-flight
//      state by (propertyId, kind) and coalesce repeat starts client-side
//      *in addition to* the server-side coalescing, so clicking "משוך
//      נתונים" three times doesn't even hit the network three times.
//   3. On completion we fire `market-scan-complete` on window so any UI
//      surface (PropertyDetail card, a global banner, a toast) can react
//      without having to own the polling loop itself.
//
// M-1 — durable across reload + navigation (mirrors yad2 Y-1):
//   Running (propertyId, kind, jobId) tuples are persisted to
//   sessionStorage. On module init we re-attach the poll loop for each
//   tuple so an agent can click "משוך נתונים", navigate to customers,
//   reload the tab, and still get the completion toast when nadlan's
//   crawl finishes.

import { api } from './api';

/** @typedef {'idle'|'running'|'done'|'error'} ScanStatus */

/** @type {Record<string, {
 *    status: ScanStatus,
 *    propertyId: string,
 *    kind: 'buy'|'rent',
 *    startedAt: number|null,
 *    finishedAt: number|null,
 *    result: any,
 *    error: string|null,
 *  }>} */
let state = {};

const listeners = new Set();

// M-1: one sessionStorage slot holds a map of key → running-job
// descriptor `{ jobId, propertyId, kind, startedAt }`. Completed scans
// are NOT persisted — the backend's MarketContext table is the source
// of truth for results; the card reads it via marketContextGet on mount.
const RUNNING_KEY = 'estia-market-running-scans';

function keyFor(propertyId, kind) {
  return `${propertyId}:${kind}`;
}

function readRunningMap() {
  try {
    const raw = sessionStorage.getItem(RUNNING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeRunning(key, payload) {
  try {
    const map = readRunningMap();
    map[key] = payload;
    sessionStorage.setItem(RUNNING_KEY, JSON.stringify(map));
  } catch { /* ignore private-mode */ }
}

function clearRunning(key) {
  try {
    const map = readRunningMap();
    if (key in map) {
      delete map[key];
      sessionStorage.setItem(RUNNING_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch { /* ignore listener errors */ }
  }
}

function setScan(key, patch) {
  state = { ...state, [key]: { ...(state[key] || {}), ...patch } };
  emit();
}

/** Full state snapshot — callers typically pick out the (propertyId, kind)
 *  they care about via getScanFor(). */
export function getState() {
  return state;
}

/** Get the scan entry for a specific property+kind, or null if none. */
export function getScanFor(propertyId, kind) {
  return state[keyFor(propertyId, kind)] || null;
}

/** Subscribe to ALL state changes. The callback gets the whole map; the
 *  component filters for the (propertyId, kind) it cares about. */
export function subscribeMarketScan(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// In-memory inflight map so two simultaneous startRefresh() calls for
// the same key share the same Promise. Dies on page reload, which is
// fine — the M-1 rehydration path below picks up the running jobId
// from sessionStorage and re-attaches a new poll loop.
const inflight = new Map();
// SEC-1 — bumped by resetForLogout so late poll results from the
// previous session can't apply state or fire the completion event
// under a new user's session.
let sessionEpoch = 0;

const POLL_INTERVAL_MS = 2500;
const POLL_CEILING_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Kick off (or join) a refresh for (propertyId, kind). Resolves with the
 * finished payload, or throws an Error with the Hebrew server message.
 *
 * Fires two events on `window`:
 *   - `market-scan-start`    — when this call actually spawned a job
 *   - `market-scan-complete` — on either success or failure
 * Each event's detail includes { propertyId, kind, ok?, error? } so a
 * global banner can react without importing the store directly.
 */
export function startRefresh(propertyId, kind = 'buy') {
  const key = keyFor(propertyId, kind);
  if (inflight.has(key)) return inflight.get(key);
  const myEpoch = sessionEpoch;

  setScan(key, {
    status: 'running',
    propertyId, kind,
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    error: null,
  });
  window.dispatchEvent(new CustomEvent('market-scan-start', {
    detail: { propertyId, kind },
  }));

  const promise = (async () => {
    try {
      const { jobId } = await api.marketContextRefreshStart(propertyId, kind);
      // M-1 — persist the running jobId so a reload/nav-away can
      // re-attach the poll instead of losing the completion event.
      writeRunning(key, {
        jobId,
        propertyId,
        kind,
        startedAt: state[key]?.startedAt || Date.now(),
      });
      const result = await pollJob(jobId);
      if (myEpoch !== sessionEpoch) return result; // session changed
      setScan(key, { status: 'done', finishedAt: Date.now(), result });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId, kind, ok: true, result },
      }));
      return result;
    } catch (e) {
      if (myEpoch !== sessionEpoch) throw e;
      const msg = e?.message || 'שליפת נתוני השוק נכשלה';
      setScan(key, { status: 'error', finishedAt: Date.now(), error: msg });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId, kind, ok: false, error: msg },
      }));
      throw e;
    } finally {
      inflight.delete(key);
      clearRunning(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

async function pollJob(jobId) {
  const deadline = Date.now() + POLL_CEILING_MS;
  await sleep(400);
  while (true) {
    if (Date.now() > deadline) {
      throw new Error('השליפה לוקחת זמן חריג — נסה/י שוב מאוחר יותר');
    }
    const snap = await api.marketJobStatus(jobId);
    if (snap.status === 'done')  return snap.result;
    if (snap.status === 'error') {
      const env = snap.error || {};
      const err = new Error(env.message || 'שליפת נתוני השוק נכשלה');
      err.status = env.status;
      throw err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Clear a completed entry — the card calls this when the agent
 *  dismisses the banner or starts a fresh scan. */
export function clearScanFor(propertyId, kind) {
  const key = keyFor(propertyId, kind);
  clearRunning(key);
  if (!state[key]) return;
  const next = { ...state };
  delete next[key];
  state = next;
  emit();
}

/**
 * SEC-1 — reset all market-scan state for the current browser.
 *
 * Called from `AuthProvider.logout()` and from the 401 bounce handler
 * so residual scan data from User A can never leak into User B's
 * session on the same browser.
 */
export function resetForLogout() {
  inflight.clear();
  sessionEpoch += 1;
  state = {};
  try { sessionStorage.removeItem(RUNNING_KEY); } catch { /* ignore */ }
  emit();
}

// ────────────────────────────────────────────────────────────────
// M-1 rehydration — on module init, re-attach poll loops for any
// (propertyId, kind) jobs that were in flight when the previous page
// unloaded (tab close, reload, or a navigation that unmounted the
// card). The backend is the source of truth: if it says done/error →
// apply + dispatch; still running → resume polling; 404 → drop the
// key and stay idle.
// ────────────────────────────────────────────────────────────────
function resumeJob(persisted) {
  const key = keyFor(persisted.propertyId, persisted.kind);
  const myEpoch = sessionEpoch;
  if (state[key]?.status === 'running') return; // already tracked
  setScan(key, {
    status: 'running',
    propertyId: persisted.propertyId,
    kind: persisted.kind,
    startedAt: persisted.startedAt || Date.now(),
    finishedAt: null,
    result: null,
    error: null,
  });
  const promise = (async () => {
    try {
      const result = await pollJob(persisted.jobId);
      if (myEpoch !== sessionEpoch) return result;
      setScan(key, { status: 'done', finishedAt: Date.now(), result });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId: persisted.propertyId, kind: persisted.kind, ok: true, result },
      }));
      return result;
    } catch (e) {
      if (myEpoch !== sessionEpoch) return null;
      // 404 — job was GC'd server-side. Silent drop back to idle.
      if (e?.status === 404) {
        clearScanFor(persisted.propertyId, persisted.kind);
        return null;
      }
      const msg = e?.message || 'שליפת נתוני השוק נכשלה';
      setScan(key, { status: 'error', finishedAt: Date.now(), error: msg });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId: persisted.propertyId, kind: persisted.kind, ok: false, error: msg },
      }));
      return null;
    } finally {
      inflight.delete(key);
      clearRunning(key);
    }
  })();
  inflight.set(key, promise);
}

// Microtask so subscribers attached during module bootstrap (useEffect
// in MarketScanBanner) can pick up the 'running' state transition.
Promise.resolve().then(() => {
  const map = readRunningMap();
  for (const [, persisted] of Object.entries(map)) {
    if (persisted?.jobId && persisted?.propertyId && persisted?.kind) {
      resumeJob(persisted);
    }
  }
});
