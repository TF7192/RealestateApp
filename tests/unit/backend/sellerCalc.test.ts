import { describe, it, expect } from 'vitest';
// @ts-expect-error — sellerCalc is plain JS in the frontend package; we
// import it directly so the unit suite tests the real code, not a copy.
// eslint-disable-next-line import/no-relative-packages
import { sellerCalc } from '../../../frontend/src/lib/sellerCalc.js';

/**
 * Exhaustive calculator coverage — this module drives every pricing
 * conversation an agent has. Flaws here would show the agent a wrong
 * net number on a real deal, so we test every mode + VAT permutation
 * + every edge case the spec calls out.
 */

// Helper: floating-point comparisons with shekel-level tolerance
// (rounding to whole ₪ is fine for all user-facing values).
const near = (actual: number, expected: number, eps = 0.5) =>
  expect(Math.abs(actual - expected)).toBeLessThan(eps);

describe('sellerCalc — forward (sale → net)', () => {
  it('computes brokerage, lawyer, and net with VAT-included rates', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 1_000_000,
      commissionRate: 0.02,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0.005,
      lawyerVatIncluded: true,
      additional: 0,
    });
    near(r.brokerage, 20_000);
    near(r.lawyer, 5_000);
    near(r.net, 975_000);
    expect(r.error).toBeNull();
  });

  it('applies VAT (18%) on top when VAT-included flags are false', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 1_000_000,
      commissionRate: 0.02,
      commissionVatIncluded: false,
      lawyerMode: 'percent',
      lawyerRate: 0.005,
      lawyerVatIncluded: false,
      additional: 0,
      vatRate: 0.18,
    });
    near(r.brokerage, 23_600);
    near(r.lawyer, 5_900);
    near(r.net, 970_500);
  });

  it('honors a fixed lawyer amount', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 2_000_000,
      commissionRate: 0.02,
      commissionVatIncluded: true,
      lawyerMode: 'fixed',
      lawyerAmount: 7_500,
      lawyerVatIncluded: true,
      additional: 0,
    });
    near(r.lawyer, 7_500);
    near(r.brokerage, 40_000);
    near(r.net, 1_952_500);
  });

  it('subtracts "additional" costs (mas shevach etc.) from net', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 1_000_000,
      commissionRate: 0.02,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0,
      lawyerVatIncluded: true,
      additional: 50_000,
    });
    near(r.net, 1_000_000 - 20_000 - 50_000);
  });

  it('returns fees_exceed_price when fees > price', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 100_000,
      commissionRate: 1, // 100%
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0.5,
      lawyerVatIncluded: true,
      additional: 0,
    });
    // With c=1, brokerage = price → net = -lawyer → fees_exceed_price
    expect(r.error).toBe('fees_exceed_price');
  });

  it('returns the empty result (no error) for zero amount', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 0,
      commissionRate: 0.02,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0,
      lawyerVatIncluded: true,
      additional: 0,
    });
    expect(r.net).toBe(0);
    expect(r.brokerage).toBe(0);
    expect(r.error).toBeNull();
  });

  it('treats null / NaN amount as empty', () => {
    for (const amount of [null, undefined as any, NaN, -5]) {
      const r = sellerCalc({
        mode: 'forward',
        amount,
        commissionRate: 0.02,
        commissionVatIncluded: true,
        lawyerMode: 'percent',
        lawyerRate: 0,
        lawyerVatIncluded: true,
        additional: 0,
      });
      expect(r.net).toBe(0);
    }
  });

  it('handles very large numbers without float drift beyond ₪1', () => {
    const r = sellerCalc({
      mode: 'forward',
      amount: 100_000_000_000, // 100 billion ₪
      commissionRate: 0.02,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0,
      lawyerVatIncluded: true,
      additional: 0,
    });
    near(r.brokerage, 2_000_000_000, 1);
    near(r.net, 98_000_000_000, 1);
  });
});

describe('sellerCalc — reverse (net → listing price)', () => {
  it('solves for the listing price that yields the requested net (percent lawyer, VAT on top)', () => {
    // Forward 1m → net 970,500 (proved above). Reverse of that net must
    // give us back the 1m listing.
    const r = sellerCalc({
      mode: 'reverse',
      amount: 970_500,
      commissionRate: 0.02,
      commissionVatIncluded: false,
      lawyerMode: 'percent',
      lawyerRate: 0.005,
      lawyerVatIncluded: false,
      additional: 0,
      vatRate: 0.18,
    });
    near(r.listingPrice, 1_000_000, 1);
    expect(r.error).toBeNull();
  });

  it('solves with a fixed-shekel lawyer cost', () => {
    const r = sellerCalc({
      mode: 'reverse',
      amount: 970_000,
      commissionRate: 0.02,
      commissionVatIncluded: false,
      lawyerMode: 'fixed',
      lawyerAmount: 5_000,
      lawyerVatIncluded: true,
      additional: 0,
      vatRate: 0.18,
    });
    expect(r.listingPrice).toBeGreaterThan(970_000);
  });

  it('returns fees_exceed_100_percent when denominator is zero', () => {
    const r = sellerCalc({
      mode: 'reverse',
      amount: 100_000,
      commissionRate: 0.6,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0.5,
      lawyerVatIncluded: true,
      additional: 0,
    });
    expect(r.error).toBe('fees_exceed_100_percent');
    expect(r.listingPrice).toBe(0);
  });

  it('clamps negative rates to 0 instead of crashing', () => {
    const r = sellerCalc({
      mode: 'reverse',
      amount: 1_000_000,
      commissionRate: -0.5,
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: -1,
      lawyerVatIncluded: true,
      additional: 0,
    });
    // clamped to 0 → listing = net
    near(r.listingPrice, 1_000_000, 1);
  });

  it('clamps rates above 1 (100%) to 1', () => {
    const r = sellerCalc({
      mode: 'reverse',
      amount: 100_000,
      commissionRate: 5, // Not a real rate
      commissionVatIncluded: true,
      lawyerMode: 'percent',
      lawyerRate: 0,
      lawyerVatIncluded: true,
      additional: 0,
    });
    // 100% commission makes denom = 0 → fees_exceed_100_percent
    expect(r.error).toBe('fees_exceed_100_percent');
  });
});
