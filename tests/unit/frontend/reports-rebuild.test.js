import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// R-1 — Reports page, refined layout (Sprint 8.x, claude-design
// bundle 2026-04-24). The page was ported from the CSS-variable
// design-system to the cream & gold DT palette with inline styles,
// mirroring Team.jsx / Dashboard.jsx. This test pins the new
// contract:
//   * h1 + subtitle, semantic sections
//   * dir="rtl" on root
//   * DT palette declared (cream / gold / ink / muted)
//   * KPI tiles render in a grid-template-columns container
//   * DateRangePicker renders inside a filters section
//   * CSV export uses canonical .btn btn-secondary anchors
//   * aria-busy on the tiles section for loading state

const here = path.dirname(fileURLToPath(import.meta.url));
const jsxPath = path.join(here, '../../../frontend/src/pages/Reports.jsx');
const src = readFileSync(jsxPath, 'utf8');

describe('R-1 — Reports page refined layout (DT palette)', () => {
  it('renders <h1>דוחות</h1>', () => {
    expect(src).toMatch(/<h1[^>]*>\s*דוחות\s*<\/h1>/);
  });

  it('declares dir="rtl" on the page root', () => {
    expect(src).toMatch(/dir=["']rtl["']/);
  });

  it('has a subtitle paragraph describing the page purpose', () => {
    expect(src).toMatch(/reports-subtitle/);
  });

  it('filters + tiles + export render as semantic <section> elements', () => {
    const sections = src.match(/<section[^>]*/g) || [];
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('declares the DT cream + gold + ink + muted tokens verbatim', () => {
    expect(src).toMatch(/cream:\s*'#f7f3ec'/);
    expect(src).toMatch(/gold:\s*'#b48b4c'/);
    expect(src).toMatch(/ink:\s*'#1e1a14'/);
    expect(src).toMatch(/muted:\s*'#6b6356'/);
  });

  it('CSV export uses canonical .btn btn-secondary', () => {
    expect(src).toMatch(/btn btn-secondary/);
  });

  it('exports an aria-busy hook on the tiles section for loading state', () => {
    expect(src).toMatch(/aria-busy=/);
  });

  it('KPI tiles render inside a grid-template-columns container', () => {
    expect(src).toMatch(/gridTemplateColumns/);
  });

  it('uses Assistant / Heebo Hebrew font stack', () => {
    expect(src).toMatch(/Assistant,\s*Heebo/);
  });

  it('includes DateRangePicker inside the filters section', () => {
    expect(src).toMatch(/<DateRangePicker/);
  });
});
