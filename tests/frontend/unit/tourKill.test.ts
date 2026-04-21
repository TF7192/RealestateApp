import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// tourKill uses module-level state. Re-import fresh per test so the
// `killed` bool is reset to reflect the current localStorage.
async function freshModule() {
  vi.resetModules();
  return import('@estia/frontend/lib/tourKill.js');
}

beforeEach(() => {
  localStorage.clear();
  // Remove any lingering tour-dead class from a previous test.
  document.body.classList.remove('tour-dead');
  // Stub sendBeacon so the test doesn't try to hit the network.
  if (!('sendBeacon' in navigator)) {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true, value: vi.fn(() => true),
    });
  } else {
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
  }
  // Stub fetch.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('tourKill — initial state', () => {
  it('not killed on a fresh session', async () => {
    const { areToursKilled } = await freshModule();
    expect(areToursKilled()).toBe(false);
  });

  it('reads a prior localStorage flag on boot', async () => {
    localStorage.setItem('estia-tour-killed', '1');
    const { areToursKilled } = await freshModule();
    expect(areToursKilled()).toBe(true);
  });

  it('legacy key also bootstraps killed state', async () => {
    localStorage.setItem('estia-tour-dismissed', '1');
    const { areToursKilled } = await freshModule();
    expect(areToursKilled()).toBe(true);
  });
});

describe('killAllTours', () => {
  it('flips the flag, writes localStorage, and adds body.tour-dead', async () => {
    const { killAllTours, areToursKilled } = await freshModule();
    killAllTours();
    expect(areToursKilled()).toBe(true);
    expect(localStorage.getItem('estia-tour-killed')).toBe('1');
    expect(document.body.classList.contains('tour-dead')).toBe(true);
  });

  it('notifies subscribers synchronously', async () => {
    const { killAllTours, subscribeTourKill } = await freshModule();
    const fn = vi.fn();
    subscribeTourKill(fn);
    killAllTours();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires sendBeacon and a keepalive fetch to the tutorial-complete endpoint', async () => {
    const { killAllTours } = await freshModule();
    killAllTours();
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      '/api/me/tutorial/complete',
      expect.any(Blob),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/me/tutorial/complete',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
  });

  it('idempotent — a second call still works and doesn\'t crash', async () => {
    const { killAllTours, areToursKilled } = await freshModule();
    killAllTours();
    killAllTours();
    expect(areToursKilled()).toBe(true);
  });

  it('removes Joyride DOM nodes if any were present', async () => {
    const portal = document.createElement('div');
    portal.id = 'react-joyride-portal';
    document.body.appendChild(portal);
    const { killAllTours } = await freshModule();
    killAllTours();
    expect(document.getElementById('react-joyride-portal')).toBeNull();
  });
});

describe('resetTourKill', () => {
  it('restores the in-memory flag from localStorage (logout path)', async () => {
    // Simulate "was killed but now a different user logs in and the
    // previous device's storage still has the flag".
    localStorage.setItem('estia-tour-killed', '1');
    const { resetTourKill, areToursKilled } = await freshModule();
    expect(areToursKilled()).toBe(true);
    localStorage.removeItem('estia-tour-killed');
    resetTourKill();
    expect(areToursKilled()).toBe(false);
  });
});
