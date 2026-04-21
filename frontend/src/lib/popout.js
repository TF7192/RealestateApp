// popout.js — open the current route in a standalone browser window
// with app chrome hidden (B7).
//
// Usage (from a detail-page header):
//   <button onClick={popoutCurrentRoute}>פתח בחלון חדש</button>
//
// The helper:
//   1. Appends `?popout=1` to the current URL (preserving any existing
//      query params / hash) so the new window can render in "chromeless"
//      mode. Layout.jsx reads this flag and renders just <Outlet/>; the
//      new window looks like the page, not the app.
//   2. Opens with `noopener` — the popped window must not be able to
//      navigate the parent.
//   3. Sizes at 900x700 — wide enough for a two-column detail layout
//      on a 1024-wide laptop, short enough that the OS doesn't force it
//      to the edge of the screen.

/**
 * Build a URL for the current location with ?popout=1 added (or left
 * alone if it's already present). Exported for unit-testing; the main
 * entry point is `popoutCurrentRoute()` below.
 *
 * @param {string} href - an absolute URL (typically window.location.href)
 * @returns {string} the same URL with popout=1 in the query string
 */
export function buildPopoutUrl(href) {
  try {
    const url = new URL(href);
    url.searchParams.set('popout', '1');
    return url.toString();
  } catch {
    // Defensive: if URL parsing ever fails (e.g. jsdom quirks), fall
    // back to a naive string-concat. Rare; worth the safety net.
    const sep = href.includes('?') ? '&' : '?';
    return `${href}${sep}popout=1`;
  }
}

/**
 * Returns true when the page is currently running as a popout — i.e.
 * the URL carries `?popout=1`. Layout.jsx uses this to skip rendering
 * app chrome; detail pages can use it to hide their own toolbars too.
 *
 * @returns {boolean}
 */
export function isPopoutWindow() {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(window.location.href).searchParams.get('popout') === '1';
  } catch {
    return false;
  }
}

/**
 * Open the current route in a new browser window with ?popout=1 set.
 * Intended to be wired to the detail-page "פתח בחלון חדש" button.
 *
 * @returns {Window | null} the opened window handle, or null if the
 *   browser blocked the popup.
 */
export function popoutCurrentRoute() {
  if (typeof window === 'undefined') return null;
  const target = buildPopoutUrl(window.location.href);
  return window.open(target, '_blank', 'width=900,height=700,noopener');
}
