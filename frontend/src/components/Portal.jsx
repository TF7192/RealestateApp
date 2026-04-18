import { createPortal } from 'react-dom';

/**
 * <Portal>{...}</Portal> — append children to document.body so the modal
 * always overlays the full viewport, regardless of any ancestor that might
 * create a containing block for fixed-positioned descendants (transform,
 * filter, will-change: transform, contain, etc.).
 *
 * SSR-safe: returns null until the document exists.
 */
export default function Portal({ children, target }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, target || document.body);
}
