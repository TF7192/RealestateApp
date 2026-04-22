import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// LP-1 — the two pricing cards on the landing page must line up their
// "התחלה חינם" CTAs at the same baseline even when one card's body
// copy runs longer than the other.
//
// The tier card is already `display: flex; flex-direction: column`, so
// the structural fix is just giving the CTA `margin-block-start: auto`
// — the button collapses any vertical space mismatch into the gap
// above it and both CTAs align across columns.

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, '../../../frontend/src/pages/landing/Landing.css');
const css = readFileSync(cssPath, 'utf8');

describe('LP-1 — pricing-tier CTA alignment', () => {
  it('tier card is a column flex container so children stack vertically', () => {
    // Locate the .lp-tier block (not .lp-tier.is-recommended, not
    // .lp-tier-name etc.) and assert flex-direction: column.
    const block = css.match(/\.lp-tier\s*\{[^}]*\}/);
    expect(block, '.lp-tier rule exists').not.toBeNull();
    expect(block[0]).toMatch(/display:\s*flex/);
    expect(block[0]).toMatch(/flex-direction:\s*column/);
  });

  it('tier CTA has margin-block-start: auto so it sticks to the bottom', () => {
    // The rule `.lp-tier .lp-btn` is the canonical CTA hook — it must
    // push to the bottom via logical margin so RTL stays consistent.
    const block = css.match(/\.lp-tier\s+\.lp-btn\s*\{[^}]*\}/);
    expect(block, '.lp-tier .lp-btn rule exists').not.toBeNull();
    expect(block[0]).toMatch(/margin-block-start:\s*auto/);
  });
});
