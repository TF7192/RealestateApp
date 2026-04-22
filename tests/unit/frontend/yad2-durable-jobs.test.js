import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Y-1 / Y-2 — durable Yad2 scan + import notifications.
//
// The scan store already persists completed scans so a reload restores
// the finished banner. What was missing: a reload WHILE a scan or import
// is still running lost the jobId, so the banner went silent and the
// agent never knew the backend eventually finished. The fix persists
// running job metadata under two sessionStorage keys and re-attaches a
// polling loop on module init.
//
// These tests drive the contract. Each test resets modules + sessionStorage
// so the store's top-level rehydration logic re-evaluates under known
// conditions, the same pattern as sec-user-scoped-stores.test.js.

const PREVIEW_RUNNING_KEY = 'estia-yad2-running-scan';
const IMPORT_RUNNING_KEY  = 'estia-yad2-running-import';

async function freshStore() {
  vi.resetModules();
  return import('../../../frontend/src/lib/yad2ScanStore.js');
}

describe('Y-1 — Yad2 scan rehydration by jobId', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../../frontend/src/lib/api.js');
    vi.useRealTimers();
  });

  it('startScan persists the running jobId under estia-yad2-running-scan', async () => {
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn().mockResolvedValue({ jobId: 'JOB-A' }),
        yad2JobStatus: vi.fn().mockResolvedValue({ status: 'done', result: { listings: [] } }),
      },
    }));
    const mod = await freshStore();
    const p = mod.startScan('https://www.yad2.co.il/realestate/agency/1');
    // Drain microtasks so the jobId write lands, but we don't wait for
    // the full poll loop (which has a real-time sleep).
    await Promise.resolve();
    await Promise.resolve();
    const raw = sessionStorage.getItem(PREVIEW_RUNNING_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed.jobId).toBe('JOB-A');
    expect(parsed.url).toBe('https://www.yad2.co.il/realestate/agency/1');
    expect(parsed.status).toBe('running');
    await p.catch(() => {});
    // After completion the key must be removed.
    expect(sessionStorage.getItem(PREVIEW_RUNNING_KEY)).toBeNull();
  });

  it('on module init with a running-scan entry, re-attaches polling', async () => {
    // Seed a running-scan sessionStorage entry from a previous tab.
    sessionStorage.setItem(PREVIEW_RUNNING_KEY, JSON.stringify({
      status: 'running',
      jobId: 'JOB-RESUME',
      url: 'https://www.yad2.co.il/realestate/agency/42',
      startedAt: Date.now() - 10_000,
    }));
    const statusFn = vi.fn().mockResolvedValue({
      status: 'done',
      result: { listings: [{ sourceId: 'a' }] },
    });
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn(),
        yad2JobStatus: statusFn,
      },
    }));
    const mod = await freshStore();
    // Immediately after import, status should be 'running' because the
    // store re-attached to the existing job.
    expect(mod.getScanState().status).toBe('running');
    // And the module must have called /jobs/:id with the persisted jobId.
    // Poll is scheduled on a microtask, so flush the queue once.
    await vi.waitFor(() => expect(statusFn).toHaveBeenCalledWith('JOB-RESUME'));
    // After the job resolves, the running key is cleared and state is 'done'.
    await vi.waitFor(() => expect(mod.getScanState().status).toBe('done'));
    expect(sessionStorage.getItem(PREVIEW_RUNNING_KEY)).toBeNull();
  });

  it('on module init, if backend says the jobId is already done, applies result and clears key', async () => {
    sessionStorage.setItem(PREVIEW_RUNNING_KEY, JSON.stringify({
      status: 'running',
      jobId: 'JOB-DONE',
      url: 'https://www.yad2.co.il/realestate/agency/7',
      startedAt: Date.now() - 30_000,
    }));
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn(),
        yad2JobStatus: vi.fn().mockResolvedValue({
          status: 'done',
          result: { listings: [{ sourceId: 'x' }] },
        }),
      },
    }));
    const mod = await freshStore();
    await vi.waitFor(() => expect(mod.getScanState().status).toBe('done'));
    expect(sessionStorage.getItem(PREVIEW_RUNNING_KEY)).toBeNull();
  });

  it('on module init, a 404 jobId drops the key and sets state idle', async () => {
    sessionStorage.setItem(PREVIEW_RUNNING_KEY, JSON.stringify({
      status: 'running',
      jobId: 'JOB-MISSING',
      url: 'https://www.yad2.co.il/realestate/agency/9',
      startedAt: Date.now() - 300_000,
    }));
    const err = Object.assign(new Error('not found'), { status: 404 });
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn(),
        yad2JobStatus: vi.fn().mockRejectedValue(err),
      },
    }));
    const mod = await freshStore();
    await vi.waitFor(() => {
      expect(sessionStorage.getItem(PREVIEW_RUNNING_KEY)).toBeNull();
    });
    expect(mod.getScanState().status).toBe('idle');
  });

  it('resetForLogout also wipes the running-scan key (SEC-1 invariant)', async () => {
    sessionStorage.setItem(PREVIEW_RUNNING_KEY, JSON.stringify({
      status: 'running', jobId: 'J', url: 'u', startedAt: Date.now(),
    }));
    sessionStorage.setItem(IMPORT_RUNNING_KEY, JSON.stringify({
      status: 'running', jobId: 'J2', startedAt: Date.now(),
    }));
    // Avoid kicking the auto-resume polling loop during this test.
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyPreviewStart: vi.fn(),
        yad2JobStatus: vi.fn().mockRejectedValue(Object.assign(new Error('404'), { status: 404 })),
      },
    }));
    const mod = await freshStore();
    mod.resetForLogout();
    expect(sessionStorage.getItem(PREVIEW_RUNNING_KEY)).toBeNull();
    expect(sessionStorage.getItem(IMPORT_RUNNING_KEY)).toBeNull();
  });
});

describe('Y-2 — Yad2 import rehydration by jobId', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../../frontend/src/lib/api.js');
    vi.useRealTimers();
  });

  it('startImport persists its running jobId under estia-yad2-running-import', async () => {
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyImportStart: vi.fn().mockResolvedValue({ jobId: 'IMP-A' }),
        yad2JobStatus: vi.fn().mockResolvedValue({
          status: 'done',
          result: { created: [], skipped: [], failed: [] },
        }),
      },
    }));
    const mod = await freshStore();
    const p = mod.startImport([{ sourceId: 'x' }]);
    await Promise.resolve();
    await Promise.resolve();
    const raw = sessionStorage.getItem(IMPORT_RUNNING_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw).jobId).toBe('IMP-A');
    await p.catch(() => {});
    expect(sessionStorage.getItem(IMPORT_RUNNING_KEY)).toBeNull();
  });

  it('on module init with a running-import entry, re-attaches polling and fires yad2-import-complete on done', async () => {
    sessionStorage.setItem(IMPORT_RUNNING_KEY, JSON.stringify({
      status: 'running', jobId: 'IMP-RESUME', startedAt: Date.now() - 5000,
    }));
    vi.doMock('../../../frontend/src/lib/api.js', () => ({
      api: {
        yad2AgencyImportStart: vi.fn(),
        yad2JobStatus: vi.fn().mockResolvedValue({
          status: 'done',
          result: { created: [{ id: 'p1' }], skipped: [], failed: [] },
        }),
      },
    }));
    let fired = false;
    let detail = null;
    const handler = (e) => { fired = true; detail = e.detail; };
    window.addEventListener('yad2-import-complete', handler);
    try {
      await freshStore();
      await vi.waitFor(() => expect(fired).toBe(true));
      expect(detail?.ok).toBe(true);
      expect(detail?.created).toBe(1);
      expect(sessionStorage.getItem(IMPORT_RUNNING_KEY)).toBeNull();
    } finally {
      window.removeEventListener('yad2-import-complete', handler);
    }
  });
});
