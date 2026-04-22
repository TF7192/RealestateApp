// X-1 — one print helper for the whole app.
//
// Detail pages (property / customer / owner / prospect-agreement) used
// to inline `onClick={() => window.print()}`. That worked on some
// surfaces but printed blank pages on others — the root cause was a
// mix of internal scrollable containers and inherited `overflow:hidden`
// rules on `html` / `body` that cap the printable flow at one viewport.
//
// This helper:
//   1. Invokes `window.print()` in one place so we can evolve the
//      pre-print behavior (expand collapsed sections, wait on image
//      decode, attach temporary stylesheets) without editing every
//      caller.
//   2. Runs optional `before` / `after` hooks around the print call.
//      `after` runs even if `before` throws so page state is always
//      restored — the test suite pins this.
//
// Pair with `src/styles/print.css` — the CSS hides app chrome, forces
// black-on-white, and lifts the overflow caps on html/body so the whole
// document paginates instead of clipping at viewport height.

/**
 * Trigger the browser's print dialog.
 *
 * @param {object} [opts]
 * @param {() => void} [opts.before] Runs synchronously before window.print().
 *   Use for imperative prep like expanding collapsed accordions. If it
 *   throws, the error propagates AFTER `after` has run.
 * @param {() => void} [opts.after]  Runs synchronously after window.print()
 *   (and always runs, even if `before` throws or print throws).
 */
export function printPage(opts = {}) {
  const { before, after } = opts;
  let thrownFromBefore;
  try {
    if (before) before();
  } catch (err) {
    thrownFromBefore = err;
  }
  try {
    if (!thrownFromBefore) window.print();
  } finally {
    try { if (after) after(); } catch { /* swallow after-hook errors */ }
  }
  if (thrownFromBefore) throw thrownFromBefore;
}

export default printPage;
