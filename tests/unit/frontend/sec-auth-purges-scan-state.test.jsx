import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';

// SEC-1 — auth-level regression test.
//
// Scenario: User A runs a Yad2 scan, leaves a finished-scan snapshot
// in the store AND in sessionStorage. User B signs in on the same
// browser. The banner MUST NOT render, and the store MUST report
// `status === 'idle'`.
//
// This covers both code paths the fix touched:
//   - A hard login (explicit `login()` call) purges residual state.
//   - A logout followed by a login purges residual state.
//
// We stub `api` so neither test talks to a real backend.

vi.mock('../../../frontend/src/lib/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({ user: null }),
    login: vi.fn().mockResolvedValue({ user: { id: 'user-b', email: 'b@example.com' } }),
    logout: vi.fn().mockResolvedValue({}),
    signup: vi.fn().mockResolvedValue({ user: { id: 'user-b', email: 'b@example.com' } }),
    googleMock: vi.fn().mockResolvedValue({ user: { id: 'user-b', email: 'b@example.com' } }),
  },
}));

// Each test needs a fresh evaluation of auth.jsx + yad2ScanStore.js so
// the module-level rehydration runs with freshly seeded sessionStorage.
// vi.resetModules() + dynamic import() achieves that cleanly; the
// query-string cache-bust approach breaks esbuild's .jsx loader match.
async function importAuth() {
  return await import('../../../frontend/src/lib/auth.jsx');
}
async function importScanStore() {
  return await import('../../../frontend/src/lib/yad2ScanStore.js');
}

describe('SEC-1 — AuthProvider purges cross-user scan state on login', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it('login() clears the yad2 scan banner state left by a previous user', async () => {
    // Seed "User A finished a scan" into both layers.
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'done',
      url: 'https://www.yad2.co.il/realestate/agency/fake',
      result: { listings: [{ sourceId: 'A1', city: 'חולון' }] },
      finishedAt: Date.now() - 1000,
    }));

    // Force the scan store to rehydrate from the seeded storage.
    const store = await importScanStore();
    expect(store.getScanState().status).toBe('done');

    // Boot the auth provider (a fresh tab for User B).
    const { AuthProvider, useAuth } = await importAuth();
    let authHandle;
    function Probe() {
      authHandle = useAuth();
      return null;
    }
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    // User B logs in.
    await act(async () => {
      await authHandle.login({ email: 'b@example.com', password: 'x' });
    });

    // Regression guarantee: User A's scan is GONE from both layers.
    // Re-import the store to simulate what a later render would see.
    const afterStore = await importScanStore();
    expect(afterStore.getScanState().status).toBe('idle');
    expect(afterStore.getScanState().result).toBeNull();
    expect(sessionStorage.getItem('estia-yad2-last-scan')).toBeNull();
  });

  it('logout() clears scan state before the next user signs in', async () => {
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'error',
      error: 'crawl failed',
      finishedAt: Date.now(),
    }));

    const { AuthProvider, useAuth } = await importAuth();
    let authHandle;
    function Probe() {
      authHandle = useAuth();
      return null;
    }
    await act(async () => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await authHandle.logout();
    });

    const afterStore = await importScanStore();
    expect(afterStore.getScanState().status).toBe('idle');
    expect(afterStore.getScanState().error).toBeNull();
    expect(sessionStorage.getItem('estia-yad2-last-scan')).toBeNull();
    // Keep screen in scope so lint doesn't whine about unused imports.
    void screen;
  });
});
