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
// Y-1/Y-2 — durable across reload:
//   We also persist the RUNNING jobId under dedicated sessionStorage
//   keys, one per job type (preview / import). On module init, if we
//   find a running entry we call /jobs/:id; the backend is the source
//   of truth. If still running → re-attach poll. If done/error → apply
//   and dispatch completion. If 404 (job GC'd) → drop the key, idle.
//
// Not Redux. Not Zustand. Just a pub-sub — the state model is
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
const STORAGE_KEY          = 'estia-yad2-last-scan';
// Y-1: persists { status:'running', jobId, url, startedAt } for an
// in-flight preview scan so a reload can re-attach its poll loop.
const RUNNING_SCAN_KEY     = 'estia-yad2-running-scan';
// Y-2: same shape for an in-flight IMPORT job (no `url` — we key by
// jobId alone since the agent already picked the listings).
const RUNNING_IMPORT_KEY   = 'estia-yad2-running-import';

// Rehydrate completed scans from sessionStorage on first import —
// reloading the page during a flight (or returning from a force-close)
// shows the most recent finished scan instead of nothing.
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

// Safe sessionStorage helpers — private browsing / disabled storage
// throws on every call, and we don't want a throw during module init
// to prevent the scan store from loading at all.
function writeRunning(key, payload) {
  try { sessionStorage.setItem(key, JSON.stringify(payload)); }
  catch { /* ignore */ }
}
function clearRunning(key) {
  try { sessionStorage.removeItem(key); }
  catch { /* ignore */ }
}
function readRunning(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
      // Y-1: persist the running jobId so a reload mid-flight can
      // re-attach to the same job instead of losing the notification.
      writeRunning(RUNNING_SCAN_KEY, {
        status: 'running',
        jobId,
        url,
        startedAt: state.startedAt || Date.now(),
      });
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
      // Terminal — the running key is only meaningful while the poll
      // loop is live. Cleared here regardless of success/failure.
      clearRunning(RUNNING_SCAN_KEY);
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
  try {
    const { jobId } = await api.yad2AgencyImportStart(listings);
    // Y-2: persist the import jobId so a reload during the image-rehost
    // phase can re-attach and fire the completion toast when it's done.
    writeRunning(RUNNING_IMPORT_KEY, {
      status: 'running',
      jobId,
      startedAt: Date.now(),
    });
    const res = await pollJob(jobId);
    if (myEpoch !== sessionEpoch) {
      // Session changed mid-import (logout/login). Drop the result so
      // a toast doesn't fire for a user who isn't the one who started.
      throw new Error('הפעולה בוטלה');
    }
    window.dispatchEvent(new CustomEvent('yad2-import-complete', {
      detail: { ok: true, created: res?.created?.length ?? 0, result: res },
    }));
    return res;
  } catch (e) {
    if (myEpoch === sessionEpoch) {
      window.dispatchEvent(new CustomEvent('yad2-import-complete', {
        detail: { ok: false, error: e?.message || 'הייבוא נכשל' },
      }));
    }
    throw e;
  } finally {
    clearRunning(RUNNING_IMPORT_KEY);
  }
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
 *   - `estia-yad2-last-scan`          — rehydrated completed-scan result.
 *   - `estia-yad2-banner-dismissed-at` — banner-dismiss timestamp.
 *   - `estia-yad2-running-scan`       — Y-1 in-flight preview jobId.
 *   - `estia-yad2-running-import`     — Y-2 in-flight import jobId.
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
    sessionStorage.removeItem(RUNNING_SCAN_KEY);
    sessionStorage.removeItem(RUNNING_IMPORT_KEY);
  } catch { /* ignore private-mode failures */ }
  emit();
}

// ----------------------------------------------------------------------------
// Y-1/Y-2 rehydration — on module init, if a previous tab left behind a
// running jobId, re-attach the poll loop. The backend is the source of
// truth: if it says done/error → apply + dispatch; still running → resume
// polling; 404 → drop the key and stay idle.
//
// Runs in a microtask so `setState` subscribers attached during module
// bootstrap (useEffect in the banner) can pick up the 'running' state as
// they would for any other poll cycle. Also runs AFTER the `state`
// initialization + completed-scan rehydration above so we don't clobber a
// valid completed scan with a stale running record.
// ----------------------------------------------------------------------------
function resumeScanJob(persisted) {
  const myEpoch = sessionEpoch;
  // Advertise running immediately so the banner reattaches during reload.
  setState({
    status: 'running',
    url: persisted.url || null,
    startedAt: persisted.startedAt || Date.now(),
    finishedAt: null,
    result: null,
    error: null,
  });
  inflight = (async () => {
    try {
      const res = await pollJob(persisted.jobId);
      if (myEpoch !== sessionEpoch) return res;
      setState({
        status: 'done',
        finishedAt: Date.now(),
        result: res,
        quota: res?.quota ?? state.quota,
      });
      window.dispatchEvent(new CustomEvent('yad2-scan-complete', {
        detail: { url: persisted.url || null, ok: true, listings: res?.listings?.length ?? 0 },
      }));
      return res;
    } catch (e) {
      if (myEpoch !== sessionEpoch) return null;
      // 404 → job was garbage-collected server-side. Not an error we
      // show to the agent; just drop back to idle and let them start
      // a new scan.
      if (e?.status === 404) {
        setState({
          status: 'idle',
          url: null,
          startedAt: null,
          finishedAt: null,
          result: null,
          error: null,
        });
        return null;
      }
      setState({
        status: 'error',
        finishedAt: Date.now(),
        error: e?.message || 'הטעינה נכשלה',
      });
      window.dispatchEvent(new CustomEvent('yad2-scan-complete', {
        detail: { url: persisted.url || null, ok: false, error: e?.message || 'הטעינה נכשלה' },
      }));
      // Don't rethrow — nothing awaits the rehydration promise, so a
      // rethrow just produces an "unhandled rejection" at the module
      // boundary. State + event are already dispatched.
      return null;
    } finally {
      inflight = null;
      clearRunning(RUNNING_SCAN_KEY);
    }
  })();
}

function resumeImportJob(persisted) {
  const myEpoch = sessionEpoch;
  (async () => {
    try {
      const res = await pollJob(persisted.jobId);
      if (myEpoch !== sessionEpoch) return;
      window.dispatchEvent(new CustomEvent('yad2-import-complete', {
        detail: { ok: true, created: res?.created?.length ?? 0, result: res },
      }));
    } catch (e) {
      if (myEpoch !== sessionEpoch) return;
      if (e?.status === 404) {
        // Import job GC'd — nothing to reattach; the agent can re-trigger.
        return;
      }
      window.dispatchEvent(new CustomEvent('yad2-import-complete', {
        detail: { ok: false, error: e?.message || 'הייבוא נכשל' },
      }));
    } finally {
      clearRunning(RUNNING_IMPORT_KEY);
    }
  })();
}

// Kick the two rehydration paths in a microtask. Don't block module
// import on them — if the network is slow, the consumer sees 'running'
// first and the poll updates state asynchronously.
Promise.resolve().then(() => {
  const persistedScan = readRunning(RUNNING_SCAN_KEY);
  if (persistedScan?.jobId && state.status !== 'running') {
    resumeScanJob(persistedScan);
  }
  const persistedImport = readRunning(RUNNING_IMPORT_KEY);
  if (persistedImport?.jobId) {
    resumeImportJob(persistedImport);
  }
});
