import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// R-1 — Reports page uses the app design system rather than raw HTML.
// Layout wrapper is provided by App.jsx routing; this file just checks
// the page itself:
//   * h1 + subtitle, semantic sections
//   * card-based sections keyed off design-system CSS variables
//   * RTL-first (dir="rtl"), no inline color literals
//   * DateRangePicker lives inside a filters card (SmartFields pattern)
//   * CSV export uses `.btn btn-secondary` (canonical button)

const here = path.dirname(fileURLToPath(import.meta.url));
const jsxPath = path.join(here, '../../../frontend/src/pages/Reports.jsx');
const cssPath = path.join(here, '../../../frontend/src/pages/Reports.css');
const src = readFileSync(jsxPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');

describe('R-1 — Reports page rebuild with the design system', () => {
  it('renders an <h1> inside an h1-level header, not raw HTML', () => {
    expect(src).toMatch(/<h1[^>]*>\s*דוחות\s*<\/h1>/);
  });

  it('declares dir="rtl" on the page root', () => {
    expect(src).toMatch(/dir=["']rtl["']/);
  });

  it('has a subtitle paragraph describing the page purpose', () => {
    expect(src).toMatch(/reports-subtitle/);
  });

  it('filters + tiles + export render as semantic <section> elements', () => {
    const sections = src.match(/<section[^>]*className=/g) || [];
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('CSV export uses canonical .btn btn-secondary', () => {
    expect(src).toMatch(/btn btn-secondary/);
  });

  it('CSS uses design-system custom properties (no hardcoded greys)', () => {
    expect(css).toMatch(/var\(--bg-card\)/);
    expect(css).toMatch(/var\(--text-primary\)/);
    expect(css).toMatch(/var\(--text-secondary\)/);
    expect(css).toMatch(/var\(--border\)/);
  });

  it('card CSS uses logical properties (margin-block / margin-inline)', () => {
    expect(css).toMatch(/margin-block-start/);
  });

  it('exports an aria-busy hook on the tiles section for loading state', () => {
    expect(src).toMatch(/aria-busy=/);
  });
});
