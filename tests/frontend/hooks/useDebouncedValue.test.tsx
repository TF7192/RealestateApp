import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import { useDebouncedValue } from '@estia/frontend/lib/useDebouncedValue.js';

afterEach(() => { vi.useRealTimers(); });

describe('useDebouncedValue', () => {
  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('initial'));
    expect(result.current).toBe('initial');
  });

  it('defers value changes by the given delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    // Not yet — delay hasn't elapsed.
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('b');
  });

  it('coalesces rapid changes — only the last value wins', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 100),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ v: 'c' });
    act(() => { vi.advanceTimersByTime(50); });
    // 50+50 = 100 from 'c' setting; 'b' timer was cancelled.
    expect(result.current).toBe('a'); // c's timer hasn't fired yet
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('c');
  });

  it('clears the timer on unmount — no stale setState', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(
      ({ v }) => useDebouncedValue(v, 500),
      { initialProps: { v: 'a' } }
    );
    rerender({ v: 'b' });
    unmount();
    // Nothing crashes / no warnings when the timer would have fired.
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current).toBe('a'); // value never applied post-unmount
  });
});
