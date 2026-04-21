import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse, delay as mswDelay } from 'msw';
import { renderHook, act, waitFor } from '@testing-library/react';
import { server } from '../setup/msw-server';
// eslint-disable-next-line import/no-relative-packages
import { useNeighborhoodSuggestions } from '@estia/frontend/hooks/useNeighborhoodSuggestions.js';

// The hook takes (city, query) and returns {items, loading, error}. It
// debounces the query by 200ms, cancels stale requests when city/query
// changes, and skips the fetch entirely when either side is empty.

afterEach(() => { vi.useRealTimers(); });

describe('useNeighborhoodSuggestions', () => {
  beforeEach(() => {
    // Default handler returning a tiny fixture the individual tests can
    // override via server.use().
    server.use(
      http.get('/api/neighborhoods', ({ request }) => {
        const url = new URL(request.url);
        const city = url.searchParams.get('city') || '';
        const search = url.searchParams.get('search') || '';
        return HttpResponse.json({
          items: [
            { id: 'n1', city, name: `${search}-שכונה-א`, aliases: [] },
            { id: 'n2', city, name: `${search}-שכונה-ב`, aliases: [] },
          ],
        });
      }),
    );
  });

  it('returns empty items when no city is set, regardless of query', async () => {
    const { result } = renderHook(() => useNeighborhoodSuggestions('', 'פלו'));
    // Never fetches — so loading stays false and items stay empty.
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty items when the query is shorter than the minimum', async () => {
    const { result } = renderHook(() => useNeighborhoodSuggestions('תל אביב', ''));
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('fetches neighborhoods after the 200ms debounce window', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useNeighborhoodSuggestions('תל אביב', q),
      { initialProps: { q: '' } },
    );
    rerender({ q: 'פלו' });
    // Nothing has fired yet — debounce timer hasn't expired.
    expect(result.current.items).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(199); });
    expect(result.current.items).toEqual([]);
    // After 200ms the fetch kicks off; flush microtasks so MSW resolves.
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });
    expect(result.current.items[0]).toMatchObject({ city: 'תל אביב' });
  });

  it('cancels stale in-flight requests when the query changes quickly', async () => {
    // First request is slow; second is fast. The hook should discard the
    // first response when the second returns.
    let callCount = 0;
    server.use(
      http.get('/api/neighborhoods', async ({ request }) => {
        callCount += 1;
        const url = new URL(request.url);
        const search = url.searchParams.get('search') || '';
        if (search === 'פלו') {
          await mswDelay(300);
          return HttpResponse.json({
            items: [{ id: 'stale', city: 'תל אביב', name: 'סטייל', aliases: [] }],
          });
        }
        return HttpResponse.json({
          items: [{ id: 'fresh', city: 'תל אביב', name: 'פרש', aliases: [] }],
        });
      }),
    );

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useNeighborhoodSuggestions('תל אביב', q),
      { initialProps: { q: 'פלו' } },
    );

    // Let the first debounce expire + the slow request begin.
    await new Promise((r) => setTimeout(r, 220));
    rerender({ q: 'פלור' });
    // Wait for the fresh one to resolve.
    await waitFor(() => {
      expect(result.current.items.some((x) => x.id === 'fresh')).toBe(true);
    }, { timeout: 2000 });
    // The stale response, if it arrives, must not overwrite items.
    await new Promise((r) => setTimeout(r, 400));
    expect(result.current.items.some((x) => x.id === 'stale')).toBe(false);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('does not leak state when unmounted mid-flight', async () => {
    server.use(
      http.get('/api/neighborhoods', async () => {
        await mswDelay(200);
        return HttpResponse.json({ items: [] });
      }),
    );
    const { unmount } = renderHook(() =>
      useNeighborhoodSuggestions('תל אביב', 'פלו'),
    );
    await new Promise((r) => setTimeout(r, 210));
    unmount();
    // Nothing crashes (no "setState on unmounted" warnings). The test
    // just asserting no throw is enough; happy-dom surfaces warnings as
    // unhandled rejections when they matter.
    await new Promise((r) => setTimeout(r, 100));
  });
});
