import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// E-1 — "צור עסקה" button + creation dialog on the /deals page.
//
// Source-text assertions in the style of delete-account.test.js —
// the real DOM render lives in tests/frontend/pages/Deals.test.*.
// We assert the load-bearing plumbing here.

const here = path.dirname(fileURLToPath(import.meta.url));
const dealsPath = path.join(here, '../../../frontend/src/pages/Deals.jsx');
const apiPath = path.join(here, '../../../frontend/src/lib/api.js');
const src = readFileSync(dealsPath, 'utf8');
const apiSrc = readFileSync(apiPath, 'utf8');

describe('E-1 — create deal UI + API wiring', () => {
  it('Deals page exposes a "צור עסקה" primary button', () => {
    expect(src).toMatch(/צור עסקה/);
    expect(src).toMatch(/btn-primary/);
  });

  it('opens a creation dialog with role="dialog" + aria-modal="true"', () => {
    expect(src).toMatch(/role=["']dialog["']/);
    expect(src).toMatch(/aria-modal=["']true["']/);
  });

  it('creation form captures buyer, seller, property, commission, status', () => {
    // buyer is a Lead FK; seller an Owner FK; property a Property FK.
    expect(src).toMatch(/buyerId/);
    expect(src).toMatch(/sellerId/);
    expect(src).toMatch(/propertyId/);
    expect(src).toMatch(/commission/);
    // Status enum includes the new Discovery values alongside legacy ones.
    expect(src).toMatch(/NEGOTIATING/);
    expect(src).toMatch(/SIGNED/);
    expect(src).toMatch(/CLOSED/);
    expect(src).toMatch(/CANCELLED/);
  });

  it('save path uses runMutation from lib/mutations', () => {
    expect(src).toMatch(/from\s+['"][^'"]*lib\/mutations['"]/);
    expect(src).toMatch(/runMutation\(/);
  });

  it('creation flow calls api.createDeal', () => {
    expect(src).toMatch(/api\.createDeal\(/);
  });

  it('api.js already exposes createDeal', () => {
    expect(apiSrc).toMatch(/createDeal:\s*\(body\)\s*=>\s*request\(['"`]\/deals['"`]/);
  });
});

describe('E-2 — chip label order is "0 פעילות" / "0 נחתמו" (count first)', () => {
  // The label order fix renders the count first, then the word. Before
  // the fix the JSX was `{t.label}<span>{t.count}</span>`; after, it's
  // `<span>{t.count}</span>{t.label}`.
  it('renders the count element before the label text', () => {
    expect(src).toMatch(/filter-count[^>]*>\{t\.count\}<\/span>\s*\{t\.label\}/);
    expect(src).not.toMatch(/\{t\.label\}\s*<span className="filter-count"/);
  });
});

describe('E-3 — Deals table view via ViewToggle + DataTable', () => {
  it('imports ViewToggle and DataTable from components', () => {
    expect(src).toMatch(/from\s+['"][^'"]*components\/ViewToggle['"]/);
    expect(src).toMatch(/from\s+['"][^'"]*components\/DataTable['"]/);
  });

  it('uses the useViewMode persistence hook keyed on "deals"', () => {
    expect(src).toMatch(/useViewMode\(\s*['"]deals['"]/);
  });

  it('renders a DataTable with at least address, status, and commission columns', () => {
    // We don't assert the exact column set — just that a DataTable is
    // conditionally rendered in table mode and pulls these core fields.
    expect(src).toMatch(/<DataTable/);
    expect(src).toMatch(/propertyStreet/);
    expect(src).toMatch(/commission/);
  });
});
