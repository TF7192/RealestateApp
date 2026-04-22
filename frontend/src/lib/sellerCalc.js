// Task 3 · pure seller-side fee calculator. Two modes:
//
//   forward  — agent enters the sale price; output is what the seller
//              walks away with after fees.
//   reverse  — agent enters the seller's target net; output is the
//              listing price they need to ask, solved algebraically (no
//              iteration / no fixed-point loops).
//
// All inputs are plain numbers (we do the parsing in the UI). Rates
// (commission, lawyer-percent) are decimals, not percentages — i.e. 0.02
// for 2%. The UI accepts "2" or "2%" and divides by 100 before calling
// in. Currency values are integers (₪) — no fractional shekel.
//
// Israeli context — the brokerage commission and lawyer fees are usually
// quoted EXCLUSIVE of VAT and the agent pays the VAT on top. The
// `*VatIncluded` flags let the user mark "the rate I gave already
// includes VAT" so we don't double-charge.
//
// Mas shevach (capital gains) is intentionally NOT auto-calculated —
// the rules depend on exemptions the calculator can't see. We expose
// `additional` as a free-form ₪ field for the user to plug in.
//
// Default VAT 18% is the current Israeli rate (raised from 17% in Jan
// 2025). Caller can override via the `vatRate` field on inputs if the
// user wants to model a different jurisdiction or future change.

const DEFAULT_VAT_RATE = 0.18;

/**
 * @typedef {Object} CalcInput
 * @property {'forward'|'reverse'} mode
 * @property {number|null} amount             — sale price (forward) or target net (reverse), ₪
 * @property {number} commissionRate          — decimal, e.g. 0.02 for 2%
 * @property {boolean} commissionVatIncluded  — true if rate already includes VAT
 * @property {'percent'|'fixed'} lawyerMode
 * @property {number} lawyerRate              — decimal (when percent)
 * @property {number} lawyerAmount            — ₪ (when fixed)
 * @property {boolean} lawyerVatIncluded      — true if rate/amount already includes VAT
 * @property {number} additional              — ₪ — additional costs (mas shevach, tabu, etc.)
 * @property {number} [vatRate]               — defaults to DEFAULT_VAT_RATE
 * @property {boolean} [includeBrokerage]     — C-1: when false, brokerage
 *   is still computed for display but excluded from `net`. Defaults to true.
 * @property {boolean} [includeLawyer]        — C-1: same for lawyer fees.
 */

/**
 * @typedef {Object} CalcResult
 * @property {number} listingPrice          — gross ₪
 * @property {number} brokerage             — total brokerage incl. VAT, ₪
 * @property {number} brokerageBase         — pre-VAT, ₪
 * @property {number} brokerageVat          — VAT portion, ₪
 * @property {number} lawyer                — total lawyer incl. VAT, ₪
 * @property {number} lawyerBase            — pre-VAT, ₪
 * @property {number} lawyerVat             — VAT portion, ₪
 * @property {number} additional            — ₪ (echoed back)
 * @property {number} net                   — what the seller walks away with, ₪
 * @property {number} totalToAgent          — brokerage incl. VAT
 * @property {string|null} error            — null if everything is well-defined
 */

/**
 * Calculate either direction. Always returns a result object — when
 * the inputs are insufficient or impossible (e.g. fees > 100% of price),
 * `error` is set and the numeric fields are 0.
 *
 * @param {CalcInput} input
 * @returns {CalcResult}
 */
export function sellerCalc(input) {
  const vat = input.vatRate ?? DEFAULT_VAT_RATE;
  const c   = clampRate(input.commissionRate);
  const vb  = input.commissionVatIncluded ? 1 : (1 + vat);

  const empty = {
    listingPrice: 0,
    brokerage: 0, brokerageBase: 0, brokerageVat: 0,
    lawyer: 0, lawyerBase: 0, lawyerVat: 0,
    additional: input.additional || 0,
    net: 0,
    totalToAgent: 0,
    error: null,
  };

  if (input.amount == null || !Number.isFinite(input.amount) || input.amount <= 0) {
    return empty;
  }

  // ── forward: amount IS the listing price; compute net ──────────
  if (input.mode === 'forward') {
    const P = input.amount;
    const brokerageBase = P * c;
    const brokerage     = brokerageBase * vb;
    const brokerageVat  = brokerage - brokerageBase;

    const lawyer = lawyerOnPrice(P, input, vat);
    const additional = Math.max(0, input.additional || 0);
    // C-1 — optional exclusions. When the agent hides the brokerage
    // or lawyer block in the UI, the cost is rendered as "not
    // counted" and the net-to-seller is computed without it.
    const includeBrokerage = input.includeBrokerage !== false;
    const includeLawyer    = input.includeLawyer    !== false;
    const effectiveBrokerage = includeBrokerage ? brokerage       : 0;
    const effectiveLawyer    = includeLawyer    ? lawyer.total    : 0;
    const net = P - effectiveBrokerage - effectiveLawyer - additional;

    return {
      listingPrice: P,
      brokerage, brokerageBase, brokerageVat,
      lawyer: lawyer.total, lawyerBase: lawyer.base, lawyerVat: lawyer.vat,
      additional,
      net,
      totalToAgent: includeBrokerage ? brokerage : 0,
      error: net < 0 ? 'fees_exceed_price' : null,
    };
  }

  // ── reverse: amount IS the target net; solve for listing price ─
  // Algebra:
  //   percent lawyer:
  //     N = P - P·c·vb - P·l·vl - A
  //     P = (N + A) / (1 - c·vb - l·vl)
  //   fixed lawyer:
  //     N = P - P·c·vb - L·vl - A
  //     P = (N + L·vl + A) / (1 - c·vb)
  const N = input.amount;
  const additional = Math.max(0, input.additional || 0);
  const vl = input.lawyerVatIncluded ? 1 : (1 + vat);

  let P;
  let denom;
  if (input.lawyerMode === 'fixed') {
    const L = Math.max(0, input.lawyerAmount || 0);
    denom = 1 - (c * vb);
    if (denom <= 0) {
      return { ...empty, error: 'fees_exceed_100_percent' };
    }
    P = (N + L * vl + additional) / denom;
  } else {
    const l = clampRate(input.lawyerRate);
    denom = 1 - (c * vb) - (l * vl);
    if (denom <= 0) {
      return { ...empty, error: 'fees_exceed_100_percent' };
    }
    P = (N + additional) / denom;
  }
  if (!Number.isFinite(P) || P <= 0) {
    return { ...empty, error: 'invalid_inputs' };
  }

  const brokerageBase = P * c;
  const brokerage     = brokerageBase * vb;
  const brokerageVat  = brokerage - brokerageBase;
  const lawyer = lawyerOnPrice(P, input, vat);
  const computedNet = P - brokerage - lawyer.total - additional;

  return {
    listingPrice: P,
    brokerage, brokerageBase, brokerageVat,
    lawyer: lawyer.total, lawyerBase: lawyer.base, lawyerVat: lawyer.vat,
    additional,
    net: computedNet, // should equal N modulo float; surface it for display
    totalToAgent: brokerage,
    error: null,
  };
}

function lawyerOnPrice(P, input, vat) {
  const vl = input.lawyerVatIncluded ? 1 : (1 + vat);
  let base;
  if (input.lawyerMode === 'fixed') {
    base = Math.max(0, input.lawyerAmount || 0);
  } else {
    base = P * clampRate(input.lawyerRate);
  }
  const total = base * vl;
  return { base, total, vat: total - base };
}

function clampRate(x) {
  if (x == null || !Number.isFinite(x) || x < 0) return 0;
  if (x > 1) return 1; // 100% sanity cap
  return x;
}

// ── Self-tests, runnable with `node --input-type=module -e ...`.
// Co-located so the math stays honest. Each block returns a string of
// passes / fails — the caller decides what to do with it. Used by
// sellerCalc.test.js (when a test runner is added later).
export function _selfTest() {
  const eq = (a, b, eps = 0.5) => Math.abs(a - b) < eps;
  const fails = [];

  // forward, no VAT, simple
  const r1 = sellerCalc({
    mode: 'forward',
    amount: 1_000_000,
    commissionRate: 0.02,
    commissionVatIncluded: true,
    lawyerMode: 'percent',
    lawyerRate: 0.005,
    lawyerVatIncluded: true,
    additional: 0,
  });
  if (!eq(r1.brokerage, 20_000)) fails.push(`forward.brokerage = ${r1.brokerage}, want 20000`);
  if (!eq(r1.lawyer,    5_000))  fails.push(`forward.lawyer = ${r1.lawyer}, want 5000`);
  if (!eq(r1.net,       975_000)) fails.push(`forward.net = ${r1.net}, want 975000`);

  // forward, with VAT on both
  const r2 = sellerCalc({
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
  // brokerage: 1m * 0.02 * 1.18 = 23,600
  // lawyer:    1m * 0.005 * 1.18 = 5,900
  // net = 1m - 23,600 - 5,900 = 970,500
  if (!eq(r2.brokerage, 23_600)) fails.push(`forward+vat.brokerage = ${r2.brokerage}, want 23600`);
  if (!eq(r2.lawyer,    5_900))  fails.push(`forward+vat.lawyer = ${r2.lawyer}, want 5900`);
  if (!eq(r2.net,       970_500)) fails.push(`forward+vat.net = ${r2.net}, want 970500`);

  // reverse, percent lawyer, with VAT
  // Want net 970,500. Should solve back to ~1,000,000.
  const r3 = sellerCalc({
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
  if (!eq(r3.listingPrice, 1_000_000, 1)) fails.push(`reverse.listing = ${r3.listingPrice}, want ~1000000`);

  // reverse, fixed lawyer
  // P = (N + L*vl + A) / (1 - c*vb)
  // N=970000, L=5000 incl-vat, A=0, c=0.02, vb=1.18 → P = 970000 / 0.9764 ≈ 993,440
  const r4 = sellerCalc({
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
  if (r4.listingPrice <= 970_000) fails.push(`reverse-fixed.listing = ${r4.listingPrice}, want > N`);

  // edge: fees > 100%
  const r5 = sellerCalc({
    mode: 'reverse',
    amount: 100_000,
    commissionRate: 0.6,
    commissionVatIncluded: true,
    lawyerMode: 'percent',
    lawyerRate: 0.5,
    lawyerVatIncluded: true,
    additional: 0,
  });
  if (r5.error !== 'fees_exceed_100_percent') fails.push(`edge.error = ${r5.error}, want fees_exceed_100_percent`);

  // edge: zero amount returns empty without crashing
  const r6 = sellerCalc({
    mode: 'forward',
    amount: 0,
    commissionRate: 0.02,
    commissionVatIncluded: true,
    lawyerMode: 'percent',
    lawyerRate: 0.005,
    lawyerVatIncluded: true,
    additional: 0,
  });
  if (r6.net !== 0 || r6.brokerage !== 0) fails.push('edge.zero amount should return empty');

  return { ok: fails.length === 0, fails };
}
