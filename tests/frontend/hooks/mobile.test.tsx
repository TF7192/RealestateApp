import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import {
  useCopyFeedback,
  useDelayedFlag,
  useViewportMobile,
  useOnlineStatus,
  useClipboardPhone,
  primeContactBump,
  useVisibilityBump,
  useRefreshOnRefocus,
} from '@estia/frontend/hooks/mobile.js';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('useCopyFeedback', () => {
  it('copied=false initially', () => {
    const { result } = renderHook(() => useCopyFeedback());
    expect(result.current.copied).toBe(false);
  });

  it('copy(text) writes to clipboard and flips copied=true, then back after duration', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyFeedback(500));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.copy('hello'); });
    expect(ok).toBe(true);
    expect(await navigator.clipboard.readText()).toBe('hello');
    expect(result.current.copied).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.copied).toBe(false);
  });

  it('copy(falsy) is a no-op', async () => {
    const { result } = renderHook(() => useCopyFeedback());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.copy(''); });
    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
  });
});

describe('useDelayedFlag', () => {
  it('returns false immediately', () => {
    const { result } = renderHook(() => useDelayedFlag(true, 220));
    expect(result.current).toBe(false);
  });

  it('flips true after the delay if active stays true', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDelayedFlag(true, 220));
    act(() => { vi.advanceTimersByTime(220); });
    expect(result.current).toBe(true);
  });

  it('stays false if active flips off before the delay elapses (debounced skeleton)', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 220),
      { initialProps: { active: true } }
    );
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(false);
  });
});

describe('useViewportMobile', () => {
  beforeEach(() => {
    // Stable matchMedia stub that lets us flip the "matches" flag.
    let current = false;
    const listeners = new Set<(e: any) => void>();
    (window as any).matchMedia = (_query: string) => ({
      get matches() { return current; },
      media: _query,
      onchange: null,
      addEventListener: (_t: string, fn: any) => listeners.add(fn),
      removeEventListener: (_t: string, fn: any) => listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    (window as any).__setMq = (v: boolean) => {
      current = v;
      listeners.forEach((fn) => fn({ matches: v }));
    };
  });

  it('reads matchMedia synchronously on mount', () => {
    (window as any).__setMq(true);
    const { result } = renderHook(() => useViewportMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the media query flips', () => {
    (window as any).__setMq(false);
    const { result } = renderHook(() => useViewportMobile());
    expect(result.current).toBe(false);
    act(() => { (window as any).__setMq(true); });
    expect(result.current).toBe(true);
  });
});

describe('useOnlineStatus', () => {
  it('reflects navigator.onLine on mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('flips on online/offline events', () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
  });

  it('removes listeners on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    const kinds = spy.mock.calls.map((c) => c[0]);
    expect(kinds).toContain('online');
    expect(kinds).toContain('offline');
  });
});

describe('useClipboardPhone', () => {
  it('extracts a normalized Israeli phone from clipboard', async () => {
    await navigator.clipboard.writeText('Call me on 050-123-4567 later');
    const { result } = renderHook(() => useClipboardPhone());
    let got: string | null = null;
    await act(async () => { got = await result.current.peek(); });
    expect(got).toBe('050-1234567');
    expect(result.current.phone).toBe('050-1234567');
  });

  it('returns null when the clipboard has no phone number', async () => {
    await navigator.clipboard.writeText('just text');
    const { result } = renderHook(() => useClipboardPhone());
    let got: string | null = null;
    await act(async () => { got = await result.current.peek(); });
    expect(got).toBeNull();
  });

  it('clear() resets phone to null', async () => {
    await navigator.clipboard.writeText('050-1234567');
    const { result } = renderHook(() => useClipboardPhone());
    await act(async () => { await result.current.peek(); });
    expect(result.current.phone).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.phone).toBeNull();
  });
});

describe('useVisibilityBump + primeContactBump', () => {
  it('fires onReturn with the primed id when the tab becomes visible', () => {
    let called: string | null = null;
    renderHook(() => useVisibilityBump((id: string) => { called = id; }));
    primeContactBump('lead-42');
    // Simulate returning to the tab.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(called).toBe('lead-42');
  });

  it('is a no-op when there is no primed id', () => {
    let called: string | null = null;
    renderHook(() => useVisibilityBump((id: string) => { called = id; }));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(called).toBeNull();
  });
});

describe('useRefreshOnRefocus', () => {
  it('calls the cb on refocus after the stale window', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    renderHook(() => useRefreshOnRefocus(cb, { staleAfterMs: 1000 }));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does NOT call the cb if the tab is still hidden', () => {
    const cb = vi.fn();
    renderHook(() => useRefreshOnRefocus(cb, { staleAfterMs: 0 }));
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(cb).not.toHaveBeenCalled();
  });
});
