// H3 — useMediaRecorder hook.
//
// We stub MediaRecorder + navigator.mediaDevices.getUserMedia on the
// window so the hook can exercise its real state machine. The stub
// emits `dataavailable` synchronously on stop() so the test sees a
// final Blob without timing out waiting for the browser.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
// eslint-disable-next-line import/no-relative-packages
import useMediaRecorder from '@estia/frontend/hooks/useMediaRecorder.js';

interface MockTrack { stop: () => void }
interface MockStream { getTracks: () => MockTrack[] }

let getUserMediaImpl: (constraints: any) => Promise<any>;
let lastRecorder: any;

class MockMediaRecorder {
  static isTypeSupported = (_m: string) => true;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  stream: any;
  mimeType: string;
  constructor(stream: any, opts?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = opts?.mimeType || 'audio/webm';
    lastRecorder = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    // Deliver a non-zero chunk before firing onstop — matches real browsers.
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  const track: MockTrack = { stop: vi.fn() };
  const stream: MockStream = { getTracks: () => [track] };
  getUserMediaImpl = vi.fn(async () => stream);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: (c: any) => getUserMediaImpl(c) },
  });
  (globalThis as any).MediaRecorder = MockMediaRecorder;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).MediaRecorder;
  // @ts-expect-error — resetting is enough
  delete globalThis.navigator.mediaDevices;
});

describe('useMediaRecorder', () => {
  it('starts in idle state with no blob', () => {
    const { result } = renderHook(() => useMediaRecorder());
    expect(result.current.state).toBe('idle');
    expect(result.current.blob).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to recording after start()', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('recording');
    expect(result.current.permission).toBe('granted');
  });

  it('produces a Blob when stop() is called', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    await waitFor(() => {
      expect(result.current.state).toBe('idle');
      expect(result.current.blob).toBeInstanceOf(Blob);
    });
    expect((result.current.blob as Blob).size).toBeGreaterThan(0);
  });

  it('surfaces permission-denied errors as a structured code', async () => {
    getUserMediaImpl = vi.fn(async () => {
      const e: any = new Error('nope');
      e.name = 'NotAllowedError';
      throw e;
    });
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.permission).toBe('denied');
    expect(result.current.error?.code).toBe('PERMISSION_DENIED');
  });

  it('marks unsupported browsers when MediaRecorder is absent', async () => {
    delete (globalThis as any).MediaRecorder;
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.permission).toBe('unsupported');
    expect(result.current.error?.code).toBe('UNSUPPORTED');
  });

  it('reset() clears the blob and returns to idle', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    await waitFor(() => expect(result.current.blob).toBeInstanceOf(Blob));
    act(() => { result.current.reset(); });
    expect(result.current.blob).toBeNull();
    expect(result.current.state).toBe('idle');
  });

  it('auto-stops when the 3-minute cap elapses', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useMediaRecorder({ maxDurationMs: 1000 }));
      await act(async () => { await result.current.start(); });
      expect(result.current.state).toBe('recording');
      await act(async () => { vi.advanceTimersByTime(1000); });
      // lastRecorder.stop fires synchronously in the mock
      expect(lastRecorder.state).toBe('inactive');
    } finally {
      vi.useRealTimers();
    }
  });
});
