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
// Tiny pub-sub — no Redux, no Zustand. Mirrors the shape of
// yad2ScanStore on purpose so the pattern is recognizable.

import { api } from './api';

/** @typedef {'idle'|'running'|'done'|'error'} ScanStatus */

/** Per (propertyId, kind) state. `byKey` holds the map so the card can
 *  render "this property is still scanning" without polluting the
 *  scan history of another open property tab. */
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

function keyFor(propertyId, kind) {
  return `${propertyId}:${kind}`;
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
// fine — the backend's own coalescing catches the "same page, two
// fetches" race.
const inflight = new Map();

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
      const result = await pollJob(jobId);
      setScan(key, { status: 'done', finishedAt: Date.now(), result });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId, kind, ok: true, result },
      }));
      return result;
    } catch (e) {
      const msg = e?.message || 'שליפת נתוני השוק נכשלה';
      setScan(key, { status: 'error', finishedAt: Date.now(), error: msg });
      window.dispatchEvent(new CustomEvent('market-scan-complete', {
        detail: { propertyId, kind, ok: false, error: msg },
      }));
      throw e;
    } finally {
      inflight.delete(key);
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
      throw new Error(snap.error?.message || 'שליפת נתוני השוק נכשלה');
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Clear a completed entry — the card calls this when the agent
 *  dismisses the banner or starts a fresh scan. */
export function clearScanFor(propertyId, kind) {
  const key = keyFor(propertyId, kind);
  if (!state[key]) return;
  const next = { ...state };
  delete next[key];
  state = next;
  emit();
}
