// useDashboardDeltas — fan-out fetch of "new-properties / new-customers
// / deals" over three rolling windows (7 / 30 / 90 days) so the
// Dashboard can render a DeltaBadge next to each KPI tile.
//
// Contract:
//   const { week, month, quarter, loading, error } = useDashboardDeltas(period);
//
//   period is the *visible* window selection ('week' | 'month' |
//   'quarter'), used by callers that only want the active bucket. All
//   three buckets are always fetched on mount so switching between
//   periods doesn't re-hit the network — the Dashboard expects a
//   single fan-out per mount, not one fetch per segmented-control tap.
//
//   Each bucket is shape: { properties, customers, deals } with counts.
//   If a sub-call fails the corresponding slot is `null` (unknown) — the
//   surrounding KPI tile still renders its total; only the pill goes
//   blank. That matches the "degrade gracefully" requirement in the
//   ticket: one broken endpoint must not blank the whole dashboard.
//
// Notes on cleanup:
//   We guard every setState behind an `alive` ref so an unmount during
//   flight doesn't write to a dead component. We don't need an
//   AbortController here — the requests are cheap GETs and letting the
//   network settle is simpler than plumbing signals through api.js.

import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

const EMPTY_BUCKET = { properties: 0, customers: 0, deals: 0 };

function toIso(ms) {
  return new Date(ms).toISOString();
}

function windowRange(days) {
  const now = Date.now();
  return {
    from: toIso(now - days * 86400000),
    to: toIso(now),
  };
}

// Resolve a report promise into a plain count; if the call rejects,
// return `null` so the caller can render "unknown" without throwing.
async function safeCount(promise) {
  try {
    const r = await promise;
    const n = Number(r?.count);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function fetchBucket({ from, to }) {
  const [properties, customers, deals] = await Promise.all([
    safeCount(api.reportNewProperties({ from, to })),
    safeCount(api.reportNewCustomers({ from, to })),
    safeCount(api.reportDeals({ from, to })),
  ]);
  return { properties, customers, deals };
}

export default function useDashboardDeltas(_period = 'week') {
  // `_period` is accepted for API ergonomics (so the Dashboard can
  // pass the segmented-control value straight in) but the hook
  // currently fetches all three windows on mount anyway. Keeping the
  // arg in the signature means we can tighten this later without
  // breaking callers.
  const [state, setState] = useState({
    week: EMPTY_BUCKET,
    month: EMPTY_BUCKET,
    quarter: EMPTY_BUCKET,
    loading: true,
    error: null,
  });

  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const [week, month, quarter] = await Promise.all([
          fetchBucket(windowRange(7)),
          fetchBucket(windowRange(30)),
          fetchBucket(windowRange(90)),
        ]);
        if (cancelled || !aliveRef.current) return;
        setState({ week, month, quarter, loading: false, error: null });
      } catch (err) {
        // fetchBucket() already swallows per-call errors; reaching here
        // means Promise.all itself rejected (shouldn't happen) — still
        // surface a non-fatal error so the caller can show a toast.
        if (cancelled || !aliveRef.current) return;
        setState((prev) => ({ ...prev, loading: false, error: err }));
      }
    })();

    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, []);

  return state;
}
