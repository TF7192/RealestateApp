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
// Polling cadence for the jobId → result flow. 2.5s is a sweet spot:
// fast enough that an ~75s scan finishes within one extra poll, slow
// enough that a 5-minute crawl only burns ~120 GET /jobs/:id hits.
const POLL_INTERVAL_MS = 2500;
// Hard ceiling on polling — if a job hasn't resolved in 15 minutes
// something's wrong; give up and surface a real error rather than
// polling forever.
const POLL_CEILING_MS = 15 * 60 * 1000;

let inflight = null;
// SEC-1 — monotonic epoch bumped by `resetForLogout()`. A scan started
// under epoch N that finishes after a logout+login (epoch N+1) MUST NOT
// apply its result or fire the completion event — that would leak
// User A's scan-done banner into User B's session. Every async path
// stamps the epoch at start and checks it before mutating state.
let sessionEpoch = 0;

export function startScan(url) {
  if (inflight) return inflight;
  const myEpoch = sessionEpoch;
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
      const { jobId } = await api.yad2AgencyPreviewStart(url);
      const res = await pollJob(jobId);
      if (myEpoch !== sessionEpoch) return res; // logged-out mid-flight; drop
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
      if (myEpoch !== sessionEpoch) throw e;
      const inlineQuota = e?.data?.error?.quota ?? e?.quota;
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

// Poll /jobs/:id until status leaves 'running'. On terminal states we
// either resolve with the result or throw a re-constructed error that
// preserves the backend's Hebrew message + any inline quota snapshot.
async function pollJob(jobId) {
  const deadline = Date.now() + POLL_CEILING_MS;
  // Small jittered first-poll delay so a lucky fast job can resolve
  // on the first check instead of idling the full interval.
  await sleep(400);
  while (true) {
    if (Date.now() > deadline) {
      throw new Error('הסריקה לוקחת זמן חריג — נסה/י שוב מאוחר יותר');
    }
    const snap = await api.yad2JobStatus(jobId);
    if (snap.status === 'done')  return snap.result;
    if (snap.status === 'error') {
      const env = snap.error || {};
      const err = new Error(env.message || 'הטעינה נכשלה');
      err.status = env.status;
      err.quota = env.quota;
      throw err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Async import — same job pattern as the scan. Kicks off the server-side
// image rehost + property create loop, polls for completion, resolves
// with the { created, skipped, failed } tally the UI shows on the "done"
// step. Kept separate from startScan() so the import page can drive its
// own busy/error state without touching the shared scan snapshot.
export async function startImport(listings) {
  const myEpoch = sessionEpoch;
  const { jobId } = await api.yad2AgencyImportStart(listings);
  const res = await pollJob(jobId);
  if (myEpoch !== sessionEpoch) {
    // Session changed mid-import (logout/login). Drop the result so
    // a toast doesn't fire for a user who isn't the one who started.
    throw new Error('הפעולה בוטלה');
  }
  return res;
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

/**
 * SEC-1 — reset all scan state for the current browser.
 *
 * Called from `AuthProvider.logout()` and from the 401 bounce handler
 * so residual scan data from User A can never leak into User B's
 * session on the same browser. This wipes BOTH the in-memory snapshot
 * AND every sessionStorage artifact the store owns:
 *
 *   - `estia-yad2-last-scan`   — rehydrated completed-scan result.
 *   - `estia-yad2-banner-dismissed-at` — banner-dismiss timestamp.
 *
 * We also null out the inflight promise so a poll still running at the
 * moment of logout resolves into a trashed state that nothing reads.
 */
export function resetForLogout() {
  inflight = null;
  sessionEpoch += 1;
  state = {
    status: 'idle',
    url: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    quota: null,
  };
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('estia-yad2-banner-dismissed-at');
  } catch { /* ignore private-mode failures */ }
  emit();
}
