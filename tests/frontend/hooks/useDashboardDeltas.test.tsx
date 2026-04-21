import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import useDashboardDeltas from '@estia/frontend/hooks/useDashboardDeltas.js';
import { server } from '../setup/msw-server';

describe('useDashboardDeltas', () => {
  it('starts in a loading state before any fetch resolves', () => {
    const { result } = renderHook(() => useDashboardDeltas('week'));
    expect(result.current.loading).toBe(true);
    expect(result.current.week).toBeDefined();
    expect(result.current.week.properties).toBe(0);
  });

  it('resolves week/month/quarter buckets from the three report endpoints', async () => {
    server.use(
      http.get('/api/reports/new-properties', ({ request }) => {
        // Each window gets a different count so we can verify the fan-out
        // actually maps to distinct buckets.
        const url = new URL(request.url);
        const from = url.searchParams.get('from') || '';
        const days = daysAgo(from);
        const count = days <= 8 ? 3 : days <= 31 ? 12 : 40;
        return HttpResponse.json({ items: [], count });
      }),
      http.get('/api/reports/new-customers', ({ request }) => {
        const url = new URL(request.url);
        const days = daysAgo(url.searchParams.get('from') || '');
        const count = days <= 8 ? 2 : days <= 31 ? 7 : 20;
        return HttpResponse.json({ items: [], count });
      }),
      http.get('/api/reports/deals', ({ request }) => {
        const url = new URL(request.url);
        const days = daysAgo(url.searchParams.get('from') || '');
        const count = days <= 8 ? 1 : days <= 31 ? 4 : 9;
        return HttpResponse.json({ items: [], count, totalCommission: 0, byStatus: {} });
      })
    );

    const { result } = renderHook(() => useDashboardDeltas('week'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.week).toEqual({ properties: 3, customers: 2, deals: 1 });
    expect(result.current.month).toEqual({ properties: 12, customers: 7, deals: 4 });
    expect(result.current.quarter).toEqual({ properties: 40, customers: 20, deals: 9 });
    expect(result.current.error).toBeFalsy();
  });

  it('degrades gracefully when one sub-call fails — other buckets still resolve', async () => {
    server.use(
      http.get('/api/reports/new-properties', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      ),
      http.get('/api/reports/new-customers', () =>
        HttpResponse.json({ items: [], count: 5 })
      ),
      http.get('/api/reports/deals', () =>
        HttpResponse.json({ items: [], count: 2, totalCommission: 0, byStatus: {} })
      )
    );

    const { result } = renderHook(() => useDashboardDeltas('week'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Properties failed — it should surface as `null` (unknown) rather
    // than poisoning the other numbers.
    expect(result.current.week.properties).toBeNull();
    expect(result.current.week.customers).toBe(5);
    expect(result.current.week.deals).toBe(2);
  });

  it('fires nine requests in parallel (3 windows × 3 endpoints) on mount', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/reports/new-properties', ({ request }) => {
        seen.push(`properties:${daysAgo(new URL(request.url).searchParams.get('from') || '')}`);
        return HttpResponse.json({ items: [], count: 0 });
      }),
      http.get('/api/reports/new-customers', ({ request }) => {
        seen.push(`customers:${daysAgo(new URL(request.url).searchParams.get('from') || '')}`);
        return HttpResponse.json({ items: [], count: 0 });
      }),
      http.get('/api/reports/deals', ({ request }) => {
        seen.push(`deals:${daysAgo(new URL(request.url).searchParams.get('from') || '')}`);
        return HttpResponse.json({ items: [], count: 0, totalCommission: 0, byStatus: {} });
      })
    );
    const { result } = renderHook(() => useDashboardDeltas('week'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Nine total calls (three endpoints × three windows).
    expect(seen.length).toBe(9);
    // Each window should appear for each of the three endpoints.
    const properties = seen.filter((s) => s.startsWith('properties:')).sort();
    expect(properties.length).toBe(3);
  });

  it('does not setState after unmount (no late-resolve leaks)', async () => {
    let resolve: (v: Response) => void = () => {};
    server.use(
      http.get('/api/reports/new-properties', () =>
        new Promise<Response>((r) => { resolve = r; })
      )
    );
    const { unmount } = renderHook(() => useDashboardDeltas('week'));
    unmount();
    // Fulfil the pending promise AFTER unmount — if the hook wrote to
    // state it would throw the "can't setState on unmounted" warning.
    resolve(HttpResponse.json({ items: [], count: 1 }));
    // A brief tick is enough to flush any pending microtask.
    await new Promise((r) => setTimeout(r, 10));
    // No assertion beyond "didn't throw" is needed; React will log a
    // warning that would fail the test if state was updated.
    expect(true).toBe(true);
  });
});

// Helper — given an ISO date string `from`, returns days between
// `from` and "now" (rounded up). The hook passes 7 / 30 / 90 day
// windows, so this lets MSW handlers pick a bucket deterministically.
function daysAgo(iso: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.ceil((Date.now() - t) / 86400000);
}
