// Polyfill the browser APIs jsdom doesn't ship but the app uses.
//
// Rule: every polyfill is minimal — just enough so the component mounts
// without throwing. Tests that actually depend on one of these APIs
// configure it per-test (e.g. override matchMedia to return a mobile
// match, or dispatch an IntersectionObserver callback manually).

export function installBrowserApiMocks() {
  // ── matchMedia ─────────────────────────────────────────────────
  // `useViewportMobile` + `prefers-reduced-motion` probes call this on mount.
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},   // deprecated but still used in some libs
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  // ── IntersectionObserver ──────────────────────────────────────
  // Used by lazy image loaders + sticky shadow effects.
  if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
    class IO implements IntersectionObserver {
      root: Element | Document | null = null;
      rootMargin = '';
      thresholds: ReadonlyArray<number> = [];
      takeRecords(): IntersectionObserverEntry[] { return []; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as any).IntersectionObserver = IO;
  }

  // ── ResizeObserver ────────────────────────────────────────────
  // Used by the Yad2 scan banner + chat auto-scroll logic.
  if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    class RO implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as any).ResizeObserver = RO;
  }

  // ── Element.scrollTo / scrollBy ───────────────────────────────
  // jsdom's Element doesn't implement these; useScrollRestore calls them.
  if (typeof Element !== 'undefined') {
    if (!Element.prototype.scrollTo)  Element.prototype.scrollTo  = () => {};
    if (!Element.prototype.scrollBy)  Element.prototype.scrollBy  = () => {};
  }
  if (typeof window !== 'undefined') {
    if (!window.scrollTo) window.scrollTo = (() => {}) as any;
    if (!window.scrollBy) window.scrollBy = (() => {}) as any;
  }

  // ── Element.scrollIntoView ────────────────────────────────────
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  // ── navigator.clipboard ───────────────────────────────────────
  if (typeof navigator !== 'undefined' && !navigator.clipboard) {
    let _board = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: async (text: string) => { _board = text; },
        readText:  async () => _board,
      },
    });
  }

  // ── matchMedia + CSS.supports shims some libs expect ─────────
  if (typeof CSS === 'undefined' || !CSS.supports) {
    (globalThis as any).CSS = { supports: () => false };
  }
}
