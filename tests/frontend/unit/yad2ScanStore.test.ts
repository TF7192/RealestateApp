import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Re-import the module per test so its module-scoped state resets.
async function freshModule() {
  vi.resetModules();
  return import('@estia/frontend/lib/yad2ScanStore.js');
}

// Shim api.yad2AgencyPreview so the store's startScan() doesn't touch
// real fetch/MSW. Each test can override the mock's behaviour.
let apiMock: { yad2AgencyPreview: ReturnType<typeof vi.fn> };
vi.mock('@estia/frontend/lib/api.js', () => ({
  api: new Proxy({}, {
    get: () => apiMock.yad2AgencyPreview,
  }),
}));

beforeEach(() => {
  sessionStorage.clear();
  apiMock = { yad2AgencyPreview: vi.fn() };
});
afterEach(() => { vi.clearAllMocks(); });

describe('yad2ScanStore — initial state', () => {
  it('fresh import starts idle', async () => {
    const { getScanState } = await freshModule();
    expect(getScanState()).toMatchObject({ status: 'idle', result: null, error: null });
  });

  it('rehydrates a prior "done" snapshot from sessionStorage', async () => {
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'done',
      result: { listings: [{ id: 1 }] },
      finishedAt: 123,
    }));
    const { getScanState } = await freshModule();
    expect(getScanState().status).toBe('done');
    expect(getScanState().result).toEqual({ listings: [{ id: 1 }] });
  });

  it('does NOT rehydrate a "running" snapshot (would deadlock the UI)', async () => {
    sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify({
      status: 'running',
      url: 'x',
    }));
    const { getScanState } = await freshModule();
    expect(getScanState().status).toBe('idle');
  });
});

describe('subscribe + startScan (happy path)', () => {
  it('notifies subscribers on status transitions', async () => {
    const { subscribeScan, startScan } = await freshModule();
    apiMock.yad2AgencyPreview.mockResolvedValue({ listings: [], quota: { remaining: 2 } });
    const seen: string[] = [];
    subscribeScan((s) => seen.push(s.status));
    await startScan('https://www.yad2.co.il/realestate/agency/1');
    expect(seen).toContain('running');
    expect(seen).toContain('done');
  });

  it('emits a "yad2-scan-complete" window event on success', async () => {
    const { startScan } = await freshModule();
    apiMock.yad2AgencyPreview.mockResolvedValue({ listings: [{ id: 1 }, { id: 2 }], quota: {} });
    const handler = vi.fn();
    window.addEventListener('yad2-scan-complete', handler);
    await startScan('u');
    expect(handler).toHaveBeenCalled();
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toMatchObject({ ok: true, listings: 2 });
    window.removeEventListener('yad2-scan-complete', handler);
  });

  it('persists the done-state to sessionStorage', async () => {
    const { startScan } = await freshModule();
    apiMock.yad2AgencyPreview.mockResolvedValue({ listings: [] });
    await startScan('u');
    const raw = sessionStorage.getItem('estia-yad2-last-scan');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).status).toBe('done');
  });
});

describe('startScan — error + dedupe', () => {
  it('sets status=error and records the message', async () => {
    const { startScan, getScanState } = await freshModule();
    apiMock.yad2AgencyPreview.mockRejectedValue(new Error('WAF said no'));
    await expect(startScan('u')).rejects.toThrow('WAF said no');
    expect(getScanState().status).toBe('error');
    expect(getScanState().error).toBe('WAF said no');
  });

  it('dedupes concurrent startScan() calls into a single in-flight promise', async () => {
    const { startScan } = await freshModule();
    apiMock.yad2AgencyPreview.mockImplementation(() =>
      new Promise((r) => setTimeout(() => r({ listings: [] }), 20))
    );
    const p1 = startScan('u');
    const p2 = startScan('u');
    await Promise.all([p1, p2]);
    expect(apiMock.yad2AgencyPreview).toHaveBeenCalledTimes(1);
  });
});

describe('clearScan + setScanQuota', () => {
  it('clearScan wipes state + sessionStorage', async () => {
    const { startScan, clearScan, getScanState } = await freshModule();
    apiMock.yad2AgencyPreview.mockResolvedValue({ listings: [] });
    await startScan('u');
    clearScan();
    expect(getScanState().status).toBe('idle');
    expect(sessionStorage.getItem('estia-yad2-last-scan')).toBeNull();
  });

  it('setScanQuota updates just the quota slice', async () => {
    const { setScanQuota, getScanState } = await freshModule();
    setScanQuota({ remaining: 1, limit: 3 });
    expect(getScanState().quota).toEqual({ remaining: 1, limit: 3 });
    expect(getScanState().status).toBe('idle'); // unchanged
  });
});
