import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import haptics from '../lib/haptics';

// ────────────────────────────────────────────────────────────────
// useScrollRestore — remember scroll position per pathname.
// Restores when navigating back; fresh pages land at top.
// ────────────────────────────────────────────────────────────────
const scrollCache = new Map();

export function useScrollRestore() {
  const { pathname, key } = useLocation();
  // Save scroll BEFORE navigating away
  useEffect(() => {
    const save = () => scrollCache.set(pathname, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      window.removeEventListener('scroll', save);
    };
  }, [pathname]);

  // Restore when arriving. If coming back to a cached path, restore; else top.
  useEffect(() => {
    const y = scrollCache.get(pathname);
    if (typeof y === 'number') {
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ────────────────────────────────────────────────────────────────
// useCopyFeedback — copy + animated ✓ feedback + haptic
// ────────────────────────────────────────────────────────────────
export function useCopyFeedback(duration = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  const copy = useCallback(async (text) => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      haptics.success();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), duration);
      return true;
    } catch {
      return false;
    }
  }, [duration]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, copy };
}

// ────────────────────────────────────────────────────────────────
// useSwipeActions — swipe-left-to-reveal-actions pattern.
// Returns ref + state; consumer renders a trailing "actions tray".
// In RTL, the natural swipe is right-to-left; we reveal trailing.
// ────────────────────────────────────────────────────────────────
export function useSwipeActions({ threshold = 56, max = 120, disabled = false } = {}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const locked = useRef(null); // 'x' | 'y' | null

  const reset = useCallback(() => {
    setOffset(0);
    setOpen(false);
  }, []);

  const onTouchStart = useCallback((e) => {
    if (disabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    locked.current = null;
  }, [disabled]);

  const onTouchMove = useCallback((e) => {
    if (disabled) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (locked.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (locked.current !== 'x') return;
    // RTL reveal: trailing actions are on LEFT visually. User swipes LEFT
    // (negative dx in pointer coords) to reveal. Cap positive → clamp to 0.
    const delta = dx; // negative when swiping left
    // Only allow negative offset (reveal) plus a bit of positive for bounce
    const clamped = Math.max(-max, Math.min(24, delta + (open ? -threshold - 20 : 0)));
    setOffset(clamped);
  }, [disabled, max, open, threshold]);

  const onTouchEnd = useCallback(() => {
    if (disabled) return;
    if (locked.current !== 'x') {
      setOffset(0);
      return;
    }
    if (offset < -threshold) {
      setOpen(true);
      setOffset(-max + 20);
    } else {
      setOffset(0);
      setOpen(false);
    }
  }, [disabled, offset, max, threshold]);

  return { offset, open, reset, onTouchStart, onTouchMove, onTouchEnd };
}

// ────────────────────────────────────────────────────────────────
// usePullToRefresh — simple PTR that calls onRefresh when user pulls past
// threshold on a scroll-top container. Attach the returned ref to the
// scrollable area. Uses native touchstart/move/end.
// ────────────────────────────────────────────────────────────────
export function usePullToRefresh(onRefresh, { threshold = 72 } = {}) {
  const ref = useRef(null);
  const [pull, setPull] = useState(0); // px pulled
  const [state, setState] = useState('idle'); // idle | pulling | ready | refreshing
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    const el = ref.current || document.scrollingElement;
    if (!el) return undefined;
    const node = ref.current || document;

    const onStart = (e) => {
      if ((el.scrollTop || window.scrollY) > 2) return;
      const t = e.touches?.[0];
      if (!t) return;
      startY.current = t.clientY;
      tracking.current = true;
    };
    const onMove = (e) => {
      if (!tracking.current) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        setState('idle');
        return;
      }
      // Rubber-band scale so it feels resistive past threshold
      const p = Math.min(threshold * 1.8, dy * 0.55);
      setPull(p);
      setState(p >= threshold ? 'ready' : 'pulling');
    };
    const onEnd = async () => {
      if (!tracking.current) return;
      tracking.current = false;
      if (state === 'ready' && typeof onRefresh === 'function') {
        setState('refreshing');
        setPull(threshold);
        try { await onRefresh(); } catch { /* noop */ }
      }
      setPull(0);
      setState('idle');
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: true });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh, state, threshold]);

  return { ref, pull, state };
}

// ────────────────────────────────────────────────────────────────
// useDraftAutosave — persist a form's draft to sessionStorage on change,
// return saved draft + a clear() helper.
// ────────────────────────────────────────────────────────────────
export function useDraftAutosave(key, value, { debounce = 400 } = {}) {
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (value == null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(value));
      } catch { /* ignore storage errors */ }
    }, debounce);
    return () => clearTimeout(timer.current);
  }, [key, value, debounce]);
  const clear = useCallback(() => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }, [key]);
  return { clear };
}

export function readDraft(key) {
  try {
    const s = sessionStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ────────────────────────────────────────────────────────────────
// useVisibilityBump — bump lead.lastContact when user returns from a tel:/
// wa: link. Usage: call primeContactBump(leadId) just before window.open.
// Then the hook, mounted anywhere in the tree, will call `onReturn(leadId)`
// on next visibility change.
// ────────────────────────────────────────────────────────────────
const VBUMP_KEY = 'estia:pending-contact-bump';

export function primeContactBump(leadId) {
  try { sessionStorage.setItem(VBUMP_KEY, String(leadId)); } catch { /* ignore */ }
}

export function useVisibilityBump(onReturn) {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const id = sessionStorage.getItem(VBUMP_KEY);
        if (id) {
          sessionStorage.removeItem(VBUMP_KEY);
          onReturn?.(id);
        }
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [onReturn]);
}

// ────────────────────────────────────────────────────────────────
// useOnlineStatus — observes navigator.onLine
// ────────────────────────────────────────────────────────────────
export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// ────────────────────────────────────────────────────────────────
// useClipboardPhone — return a suggested Israeli phone found in clipboard,
// available only after a user gesture (tap) per browser perms. Call
// `peek()` from a touch handler to populate.
// ────────────────────────────────────────────────────────────────
const IL_PHONE_RE = /(?:\+?972[\s-]?|0)(5\d)[\s-]?(\d{3})[\s-]?(\d{4})/;

export function useClipboardPhone() {
  const [phone, setPhone] = useState(null);
  const peek = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const m = text?.match(IL_PHONE_RE);
      if (m) {
        const normalized = `0${m[1]}-${m[2]}${m[3]}`;
        setPhone(normalized);
        return normalized;
      }
    } catch { /* denied or no API */ }
    setPhone(null);
    return null;
  }, []);
  const clear = () => setPhone(null);
  return { phone, peek, clear };
}

// ────────────────────────────────────────────────────────────────
// useViewportMobile — <=820px
// ────────────────────────────────────────────────────────────────
export function useViewportMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

// ────────────────────────────────────────────────────────────────
// useViewportDesktop — >=breakpoint (default 1100px)
// ────────────────────────────────────────────────────────────────
export function useViewportDesktop(breakpoint = 1100) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(min-width: ${breakpoint}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpoint]);
  return isDesktop;
}
