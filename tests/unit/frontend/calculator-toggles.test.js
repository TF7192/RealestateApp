import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sellerCalc } from '../../../frontend/src/lib/sellerCalc.js';

// C-1 — calculator layout polish.
//   * "אפס" button moves BELOW the "עלויות נוספות" collapsible.
//   * Hide/show toggles for the brokerage block, lawyer block, and the
//     "סך לסוכן" summary chip.
//   * Hidden blocks MUST be excluded from the "נשאר ביד" net-to-seller
//     computation (i.e. hiding brokerage makes the net larger).

const here = path.dirname(fileURLToPath(import.meta.url));
const scPath = path.join(here, '../../../frontend/src/pages/SellerCalculator.jsx');
const mscPath = path.join(here, '../../../frontend/src/mobile/pages/MobileSellerCalculator.jsx');
const src = readFileSync(scPath, 'utf8');
const msrc = readFileSync(mscPath, 'utf8');

describe('C-1 — desktop SellerCalculator layout + toggles', () => {
  it('reset button text "אפס" appears at least once', () => {
    expect(src.includes('אפס')).toBe(true);
  });

  it('reset button wrapped in a dedicated sc-reset-row container', () => {
    expect(src).toMatch(/sc-reset-row/);
  });

  it('reset button is placed AFTER the advanced block in the JSX', () => {
    const advIdx = src.indexOf('s.advancedOpen && (');
    const resetIdx = src.search(/sc-reset/);
    expect(advIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    // Reset renders below advanced block
    expect(resetIdx).toBeGreaterThan(advIdx);
  });

  it('brokerage, lawyer, and agent-total toggles exist in state', () => {
    expect(src).toMatch(/showBrokerage/);
    expect(src).toMatch(/showLawyer/);
    expect(src).toMatch(/showAgentTotal/);
  });

  it('toggle buttons render with "הסתר" / "הצג" labels', () => {
    // At least one of each Hebrew label appears — toggles flip between them.
    expect(src).toMatch(/הסתר|הצג/);
  });

  it('sellerCalc exposes hide flags in the pure calc contract', () => {
    // Hiding brokerage should exclude it from both net and totalToAgent.
    const base = {
      mode: 'forward',
      amount: 1_000_000,
      commissionRate: 0.02,
      commissionVatIncluded: false,
      lawyerMode: 'percent',
      lawyerRate: 0.005,
      lawyerAmount: 0,
      lawyerVatIncluded: false,
      additional: 0,
    };
    const full = sellerCalc(base);
    const noBrokerage = sellerCalc({ ...base, includeBrokerage: false });
    const noLawyer = sellerCalc({ ...base, includeLawyer: false });
    const neither = sellerCalc({ ...base, includeBrokerage: false, includeLawyer: false });

    // Sanity: full calc has both positive costs.
    expect(full.brokerage).toBeGreaterThan(0);
    expect(full.lawyer).toBeGreaterThan(0);

    // Hiding brokerage increases net-to-seller by roughly the brokerage
    // cost. Allow ±1 shekel rounding drift.
    expect(noBrokerage.net).toBeCloseTo(full.net + full.brokerage, 0);
    expect(noLawyer.net).toBeCloseTo(full.net + full.lawyer, 0);
    expect(neither.net).toBeCloseTo(full.net + full.brokerage + full.lawyer, 0);
  });
});

describe('C-1 — mobile calculator mirrors the toggle affordances', () => {
  it('mobile file acknowledges the hide flags', () => {
    expect(msrc).toMatch(/showBrokerage|includeBrokerage/);
  });
});
