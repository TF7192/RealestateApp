import { useEffect } from 'react';

// F-6.4 — focus trap for modals. Keeps Tab / Shift+Tab inside the
// dialog, closes on Escape, restores focus to the element that had it
// before the dialog opened. Use together with aria-modal="true" on
// the panel + a backdrop click handler.
//
// Usage:
//   const ref = useRef(null);
//   useFocusTrap(ref, { onEscape: onClose });
//   return <div ref={ref} role="dialog" aria-modal="true">…</div>;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

export function useFocusTrap(ref, { onEscape } = {}) {
  useEffect(() => {
    const panel = ref?.current;
    if (!panel) return undefined;

    const prevActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first focusable element on open; fall back to the
    // panel itself so Tab still starts from inside.
    const focusFirst = () => {
      const nodes = panel.querySelectorAll(FOCUSABLE);
      const target = nodes[0] || panel;
      if (target && target instanceof HTMLElement) {
        if (target === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    };
    // Let the panel render first, then claim focus.
    const raf = requestAnimationFrame(focusFirst);

    const handleKey = (e) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter((n) => n instanceof HTMLElement && !n.hasAttribute('aria-hidden'));
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKey);
      // Restore focus to the trigger; important for screen reader context.
      try { prevActive?.focus({ preventScroll: true }); } catch { /* ignore */ }
    };
  }, [ref, onEscape]);
}

export default useFocusTrap;
