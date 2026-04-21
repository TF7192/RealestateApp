import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import { useBeforeUnload } from '@estia/frontend/hooks/useBeforeUnload.js';

afterEach(() => { vi.restoreAllMocks(); });

// jsdom's BeforeUnloadEvent doesn't persist `returnValue` across
// dispatch, so we grab the handler the hook registered and invoke it
// with a plain object. This is the exact same code path the browser
// runs, minus the jsdom peculiarity.
function latestBeforeUnloadHandler(spy: ReturnType<typeof vi.spyOn>) {
  for (let i = spy.mock.calls.length - 1; i >= 0; i--) {
    const [name, fn] = spy.mock.calls[i] as [string, (e: any) => unknown];
    if (name === 'beforeunload') return fn;
  }
  return null;
}

describe('useBeforeUnload', () => {
  it('adds no listener when isDirty=false', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBeforeUnload(false));
    expect(latestBeforeUnloadHandler(spy)).toBeNull();
  });

  it('registered handler sets returnValue to the default Hebrew message', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBeforeUnload(true));
    const handler = latestBeforeUnloadHandler(spy)!;
    expect(handler).toBeTruthy();

    const fakeEvt: any = { preventDefault: vi.fn() };
    const ret = handler(fakeEvt);
    expect(fakeEvt.preventDefault).toHaveBeenCalled();
    expect(fakeEvt.returnValue).toBe('יש שינויים שלא נשמרו');
    expect(ret).toBe('יש שינויים שלא נשמרו');
  });

  it('honours a custom message', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useBeforeUnload(true, 'wait!'));
    const handler = latestBeforeUnloadHandler(spy)!;
    const fakeEvt: any = { preventDefault: vi.fn() };
    handler(fakeEvt);
    expect(fakeEvt.returnValue).toBe('wait!');
  });

  it('removes the listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useBeforeUnload(true));
    unmount();
    expect(removeSpy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
  });

  it('removes the listener when isDirty flips false', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(
      ({ dirty }) => useBeforeUnload(dirty),
      { initialProps: { dirty: true } }
    );
    rerender({ dirty: false });
    expect(removeSpy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
  });
});
