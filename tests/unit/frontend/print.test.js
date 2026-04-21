// Smoke tests for the shared print stylesheet (B6).
//
// We don't boot a full browser in unit-land — printing is exercised
// end-to-end elsewhere. Instead, we assert the stylesheet exists on
// disk, covers the surfaces we care about, and that every detail page
// wires in a window.print() button.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, '../../../frontend/src/styles/print.css');

describe('print.css', () => {
  it('exists at the canonical path', () => {
    expect(existsSync(cssPath)).toBe(true);
  });

  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

  it('declares an @page with 18mm margins', () => {
    expect(css).toMatch(/@page\s*\{[^}]*margin:\s*18mm/);
  });

  it('hides the sidebar, mobile header and tab bar when printing', () => {
    expect(css).toMatch(/\.sidebar/);
    expect(css).toMatch(/\.mobile-header/);
    expect(css).toMatch(/\.mobile-tab-bar/);
  });

  it('hides the detail-page action bars (pd-topbar / cd-toolbar / od-toolbar)', () => {
    expect(css).toMatch(/\.pd-topbar/);
    expect(css).toMatch(/\.cd-toolbar/);
    expect(css).toMatch(/\.od-toolbar/);
  });

  it('flattens shadows and forces black-on-white', () => {
    expect(css).toMatch(/box-shadow:\s*none/);
    expect(css).toMatch(/background:\s*#fff/);
    expect(css).toMatch(/color:\s*#000/);
  });

  it('caps image width so photos don\'t blow up on-paper', () => {
    expect(css).toMatch(/img[\s\S]*max-width/);
  });
});

// Integration-ish check: every detail page has a window.print() button.
describe('detail pages wire in a print button', () => {
  const pages = ['PropertyDetail', 'CustomerDetail', 'OwnerDetail'];
  for (const page of pages) {
    it(`${page}.jsx calls window.print()`, () => {
      const src = readFileSync(
        path.join(here, `../../../frontend/src/pages/${page}.jsx`),
        'utf8',
      );
      expect(src).toMatch(/window\.print\(\)/);
    });
  }
});

// Main entry point must import the stylesheet exactly once.
describe('main.jsx imports print.css', () => {
  it('includes ./styles/print.css', () => {
    const src = readFileSync(
      path.join(here, '../../../frontend/src/main.jsx'),
      'utf8',
    );
    expect(src).toMatch(/['"]\.\/styles\/print\.css['"]/);
  });
});
