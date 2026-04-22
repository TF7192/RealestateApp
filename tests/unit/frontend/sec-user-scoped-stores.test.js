import { describe, it, expect, beforeEach, vi } from 'vitest';

// SEC-1 — "notification on the left hand side is persistent ACROSS
// USERS". The Yad2 scan banner is backed by a module-level store that
// rehydrates completed scans from sessionStorage. Without user-scoping,
// logging out User A and in as User B leaves B looking at A's
// finished-scan banner.
//
// The fix has to meet ALL of these invariants. Each one is a separate
// test so a regression of any one of them breaks build, not all three:
//   1. Logout must clear in-memory scan state.
//   2. Logout must clear sessionStorage scan artifacts.
//   3. A fresh import of the module (next page load as a different
//      user) must NOT rehydrate anything a previous user left behind.

// Convenience: re-import the store after mutating sessionStorage so
// the module-level rehydration logic re-runs with the new state.
async function freshStore() {
  // vi.resetModules() invalidates the cache so the next import runs
  // the module's top-level rehydration logic against whatever is
  // currently in sessionStorage.
  vi.resetModules();
  const mod = await import('../../../frontend/src/lib/yad2ScanStore.js');
  return mod;
}
async function freshMarketStore() {
  vi.resetModules();
  const mod = await import('../../../frontend/src/lib/marketScanStore.js');
  return mod;
}

describe('SEC-1 — yad2ScanStore user scoping', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('resetForLogout() wipes in-memory scan state', async () => {
    const { getScanState, startScan, resetForLogout } = await freshStore();
    // We can't actually run a scan in a unit test (no network). Instead
    // we use the store's internal setState surface by starting a scan
    // and letting it fail — the resulting error state is still state
    // that must be wiped. Easier: check that resetForLogout clears
    // whatever happens to be there.
    // Seed a fake completed scan directly into sessionStorage and
    // re-import so the module rehydrates it.
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'done',
      url: 'https://www.yad2.co.il/realestate/agency/fake',
      result: { listings: [{ sourceId: 'x', city: 'תל אביב' }] },
      startedAt: Date.now() - 10_000,
      finishedAt: Date.now() - 5_000,
    }));
    const { getScanState: getAfterRehydrate, resetForLogout: resetAfter } = await freshStore();
    expect(getAfterRehydrate().status).toBe('done');
    resetAfter();
    const snap = getAfterRehydrate();
    expect(snap.status).toBe('idle');
    expect(snap.result).toBeNull();
    expect(snap.url).toBeNull();
    // Satisfy unused-variable lint.
    void getScanState; void startScan; void resetForLogout;
  });

  it('resetForLogout() clears sessionStorage artifacts so next user sees nothing', async () => {
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({ status: 'done', result: {} }));
    sessionStorage.setItem('estia-yad2-banner-dismissed-at', '1700000000000');
    const { resetForLogout } = await freshStore();
    resetForLogout();
    expect(sessionStorage.getItem('estia-yad2-last-scan')).toBeNull();
    expect(sessionStorage.getItem('estia-yad2-banner-dismissed-at')).toBeNull();
  });

  it('fresh module load after resetForLogout sees idle state', async () => {
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'done',
      finishedAt: Date.now(),
      result: { listings: [] },
    }));
    const first = await freshStore();
    first.resetForLogout();
    // Simulate a new page load — re-import and verify nothing rehydrates.
    const second = await freshStore();
    const snap = second.getScanState();
    expect(snap.status).toBe('idle');
    expect(snap.finishedAt).toBeNull();
  });
});

describe('SEC-1 — session-epoch guard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it('late-resolving scan promise does NOT dispatch yad2-scan-complete after resetForLogout', async () => {
    // Mock the api. Both calls resolve synchronously so we don't have
    // to fight the 400ms/2500ms real-time sleeps inside pollJob — we
    // just make the poll return `done` immediately, and logout runs
    // BEFORE the poll-result microtasks drain by using vi.useFakeTimers.
    vi.useFakeTimers();
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn().mockResolvedValue({ jobId: 'abc' }),
        yad2JobStatus: vi.fn().mockResolvedValue({ status: 'done', result: { listings: [] } }),
      },
    }));
    const mod = await freshStore();
    let seenCompletion = false;
    const handler = () => { seenCompletion = true; };
    window.addEventListener('yad2-scan-complete', handler);

    // Start a scan as "user A" and immediately log out — the poll's
    // sleep(400) is still pending in fake-timer land.
    const scanPromise = mod.startScan('https://www.yad2.co.il/realestate/agency/1');
    mod.resetForLogout();

    // Advance past both sleeps so pollJob resolves. Under the epoch
    // guard, the settle-path must short-circuit without dispatching.
    await vi.advanceTimersByTimeAsync(5_000);
    await scanPromise.catch(() => {});

    expect(seenCompletion).toBe(false);
    expect(mod.getScanState().status).toBe('idle');
    window.removeEventListener('yad2-scan-complete', handler);
    vi.doUnmock('../../../frontend/src/lib/api.js');
    vi.useRealTimers();
  });
});

describe('SEC-1 — marketScanStore user scoping', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('resetForLogout() wipes all per-property scan entries', async () => {
    const mod = await freshMarketStore();
    // Seed state via the public API? There isn't a public setter, but
    // the store's `getState()` returns the internal map, and the
    // module has no persistence yet. We just check that after a
    // resetForLogout, the map is empty — the fix must add this export.
    expect(typeof mod.resetForLogout).toBe('function');
    mod.resetForLogout();
    expect(mod.getState()).toEqual({});
  });
});
