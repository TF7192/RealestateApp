// Yad2 scan store — module-level state that survives navigation so an
// agent can start a 60-second scrape on /integrations/yad2, walk over
// to /customers, and come back to either (a) the live progress or
// (b) the completed results still sitting on the page.
//
// Two use cases this unblocks:
//   1. "Persist results across navigations" — when the agent navigates
//      away and back we re-mount Yad2Import; the old in-memory state
//      was lost every time. Now the store keeps the last successful
//      scan until the agent starts a new one.
//   2. "Background scan with notification" — starting a scan doesn't
//      pin the agent to the page. The promise lives here; a thin
//      subscribe() API feeds it back into any component that cares.
//      When the scan finishes while the agent is on another page a
//      toast fires so they can jump back to review.
//
// Not Redux. Not Zustand. Just a 70-line pub-sub — the state model is
// trivially simple (one object) and we don't need the overhead.

import { api } from './api';

/** @typedef {'idle'|'running'|'done'|'error'} ScanStatus */

/** @typedef {object} ScanSnapshot
 *  @property {ScanStatus} status
 *  @property {string|null} url
 *  @property {number|null} startedAt
 *  @property {number|null} finishedAt
 *  @property {object|null} result         // full preview response
 *  @property {string|null} error
 *  @property {object|null} quota          // last-known quota snapshot
 */

/** @type {ScanSnapshot} */
let state = {
  status: 'idle',
  url: null,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  quota: null,
};

const listeners = new Set();
const STORAGE_KEY = 'estia-yad2-last-scan';

// Rehydrate from sessionStorage on first import — reloading the page
// during a flight (or returning from a force-close) shows the most
// recent finished scan instead of nothing. Running scans don't rehydrate
// because the fetch promise didn't survive the reload.
try {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    // Only restore finished scans — a "running" snapshot from an old
    // tab would otherwise deadlock the UI in a spinner.
    if (parsed?.status === 'done' || parsed?.status === 'error') {
      state = { ...state, ...parsed };
    }
  }
} catch { /* ignore — corrupt storage, start fresh */ }

function persist() {
  try {
    if (state.status === 'done' || state.status === 'error') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch { /* quota / disabled — ignore */ }
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch { /* ignore listener errors */ }
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  persist();
  emit();
}

/** Read the current snapshot (for initial render). */
export function getScanState() {
  return state;
}

/**
 * Subscribe to changes. Returns an unsubscribe fn.
 * @param {(s: ScanSnapshot) => void} fn
 */
export function subscribeScan(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Start a scan. Returns the same promise every time for the same URL
 * if one is already in flight — calling startScan twice doesn't
 * duplicate the crawl.
 *
 * On completion we fire a `yad2-scan-complete` CustomEvent on the
 * window so UI outside the Yad2Import page can raise a toast without
 * having to subscribe.
 *
 * @param {string} url
 * @returns {Promise<object>}
 */
let inflight = null;
export function startScan(url) {
  if (inflight) return inflight;
  setState({
    status: 'running',
    url,
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    error: null,
  });
  inflight = (async () => {
    try {
      const res = await api.yad2AgencyPreview(url);
      setState({
        status: 'done',
        finishedAt: Date.now(),
        result: res,
        quota: res?.quota ?? state.quota,
      });
      window.dispatchEvent(new CustomEvent('yad2-scan-complete', {
        detail: { url, ok: true, listings: res?.listings?.length ?? 0 },
      }));
      return res;
    } catch (e) {
      const inlineQuota = e?.data?.error?.quota;
      setState({
        status: 'error',
        finishedAt: Date.now(),
        error: e?.message || 'הטעינה נכשלה',
        quota: inlineQuota ?? state.quota,
      });
      window.dispatchEvent(new CustomEvent('yad2-scan-complete', {
        detail: { url, ok: false, error: e?.message || 'הטעינה נכשלה' },
      }));
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Wipe the cached scan — called when the agent starts fresh. */
export function clearScan() {
  inflight = null;
  setState({
    status: 'idle',
    url: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  });
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Update only the quota (e.g. after /quota GET). */
export function setScanQuota(quota) {
  setState({ quota });
}
