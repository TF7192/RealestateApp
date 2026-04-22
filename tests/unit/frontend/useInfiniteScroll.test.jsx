import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import useInfiniteScroll from '../../../frontend/src/lib/useInfiniteScroll.js';

// Test harness — actually renders a DOM node for the sentinel ref so
// the hook's IntersectionObserver.observe() call receives a real node.
// Plain `renderHook` sets `.current` but never mounts a node, which
// left the observer un-attached in earlier iterations.
function Harness({ total, opts = {}, expose }) {
  const hook = useInfiniteScroll(total, opts);
  expose(hook);
  return hook.hasMore ? <div ref={hook.sentinelRef} data-testid="sentinel" /> : null;
}

// Card-view pagination: reveal pageSize rows at a time as the user
// scrolls. We can't simulate real scroll in happy-dom, so we stub the
// IntersectionObserver and manually drive intersection events.

let triggerIntersect;
let observed;
let disconnected;

class StubObserver {
  constructor(cb) { this.cb = cb; }
  observe(node) {
    observed = node;
    triggerIntersect = (isIntersecting) =>
      this.cb([{ isIntersecting, target: node }]);
  }
  disconnect() { disconnected = true; }
}

beforeEach(() => {
  observed = null;
  disconnected = false;
  triggerIntersect = null;
  globalThis.IntersectionObserver = StubObserver;
});
afterEach(() => {
  delete globalThis.IntersectionObserver;
});

describe('useInfiniteScroll', () => {
  it('starts with `initial` visible and flags hasMore when total > initial', () => {
    let hook;
    render(<Harness total={20} opts={{ pageSize: 8, initial: 8 }} expose={(h) => { hook = h; }} />);
    expect(hook.visible).toBe(8);
    expect(hook.hasMore).toBe(true);
  });

  it('does not attach the observer when everything already fits', () => {
    render(<Harness total={5} opts={{ pageSize: 8 }} expose={() => {}} />);
    expect(observed).toBeNull();
  });

  it('reveals another batch on intersection', () => {
    let hook;
    render(<Harness total={20} opts={{ pageSize: 8, initial: 8 }} expose={(h) => { hook = h; }} />);
    expect(observed).toBeTruthy();
    act(() => triggerIntersect(true));
    expect(hook.visible).toBe(16);
    act(() => triggerIntersect(true));
    expect(hook.visible).toBe(20);
  });

  it('clamps to total when the page size would overshoot', () => {
    let hook;
    render(<Harness total={10} opts={{ pageSize: 8, initial: 8 }} expose={(h) => { hook = h; }} />);
    act(() => triggerIntersect(true));
    expect(hook.visible).toBe(10);
  });

  it('slice() returns the window of the caller-provided array', () => {
    let hook;
    render(<Harness total={20} opts={{ pageSize: 8 }} expose={(h) => { hook = h; }} />);
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(hook.slice(items)).toHaveLength(8);
    expect(hook.slice(items)[7]).toBe(7);
  });

  it('falls back to showing everything when IntersectionObserver is absent', () => {
    // Simulate an environment without the API (some older mobile WebViews).
    delete globalThis.IntersectionObserver;
    let hook;
    render(<Harness total={20} opts={{ pageSize: 8 }} expose={(h) => { hook = h; }} />);
    expect(hook.visible).toBe(20);
    expect(hook.hasMore).toBe(false);
    // Restore for the after-each cleanup.
    globalThis.IntersectionObserver = StubObserver;
  });
});
