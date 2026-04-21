import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import { useFieldTouched } from '@estia/frontend/hooks/useFieldTouched.js';

describe('useFieldTouched', () => {
  it('starts with an empty touched map', () => {
    const { result } = renderHook(() => useFieldTouched());
    expect(result.current.touched).toEqual({});
  });

  it('touch(key) flips the flag', () => {
    const { result } = renderHook(() => useFieldTouched());
    act(() => result.current.touch('email'));
    expect(result.current.touched.email).toBe(true);
    expect(result.current.touched.phone).toBeUndefined();
  });

  it('touch is a no-op when the key is already touched (keeps the same object)', () => {
    const { result } = renderHook(() => useFieldTouched());
    act(() => result.current.touch('email'));
    const snap = result.current.touched;
    act(() => result.current.touch('email'));
    expect(result.current.touched).toBe(snap); // same reference — no re-render
  });

  it('touchAll marks every given key true in one update', () => {
    const { result } = renderHook(() => useFieldTouched());
    act(() => result.current.touchAll(['name', 'email', 'phone']));
    expect(result.current.touched).toEqual({ name: true, email: true, phone: true });
  });

  it('reset clears every touched flag', () => {
    const { result } = renderHook(() => useFieldTouched());
    act(() => result.current.touchAll(['a', 'b']));
    act(() => result.current.reset());
    expect(result.current.touched).toEqual({});
  });
});
