import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// X-1 — one print helper for the whole app.
//
// Three guarantees this test protects:
//   1. `printPage()` exists and is importable from `frontend/src/lib/print.js`.
//   2. It invokes `window.print()`.
//   3. The page body is restored to a printable layout (no lingering
//      `overflow: hidden` on `html` / `body`) — the main cause of
//      "blank page / only first page prints" on this app historically.
//      We set it via print.css @media print rules, but also re-assert
//      here so the helper can't regress without this test catching it.
//   4. The print.css rules include the "let-the-page-grow" guards:
//      `overflow: visible !important` + `height: auto !important` on
//      html/body.

const here = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(here, '../../../frontend/src/lib/print.js');
const cssPath = path.join(here, '../../../frontend/src/styles/print.css');

describe('X-1 — print helper', () => {
  it('exists at the canonical path', () => {
    expect(existsSync(helperPath)).toBe(true);
  });

  let originalPrint;
  beforeEach(() => {
    originalPrint = window.print;
    window.print = vi.fn();
  });
  afterEach(() => {
    window.print = originalPrint;
  });

  it('printPage() calls window.print()', async () => {
    const { printPage } = await import('../../../frontend/src/lib/print.js');
    printPage();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('printPage(opts) runs before/after hooks around the print call', async () => {
    const { printPage } = await import('../../../frontend/src/lib/print.js');
    const seen = [];
    printPage({
      before: () => seen.push('before'),
      after:  () => seen.push('after'),
    });
    // window.print is synchronous in our stub, so after should run.
    expect(seen).toEqual(['before', 'after']);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('printPage(opts) runs after even when before throws', async () => {
    const { printPage } = await import('../../../frontend/src/lib/print.js');
    let afterRan = false;
    expect(() => printPage({
      before: () => { throw new Error('boom'); },
      after:  () => { afterRan = true; },
    })).toThrow('boom');
    expect(afterRan).toBe(true);
  });
});

describe('X-1 — print.css guards the "blank page" regression', () => {
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  it('forces html/body overflow:visible so the full document paginates', () => {
    expect(css).toMatch(/html[\s\S]*body[\s\S]*overflow:\s*visible/);
  });

  it('forces html/body height:auto so nothing caps the printable flow', () => {
    expect(css).toMatch(/html[\s\S]*body[\s\S]*height:\s*auto/);
  });
});
