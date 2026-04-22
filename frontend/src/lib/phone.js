// X-2 — one phone formatter for the whole Hebrew-first app.
//
// Why this file exists:
//   Every detail page was doing its own `.replace(/[^0-9]/g, '')` +
//   ad-hoc hyphenation. The result — mixed display shapes for the
//   same number across owner cards, lead cards, agent portal, and
//   WhatsApp links. This module is the one answer.
//
// Two public functions:
//   * `formatPhone(raw)` — returns a display-ready string.
//     Israeli international inputs (+972 / 972 / 00972) collapse to
//     "+972 XX-XXX-XXXX". Local Israeli inputs stay local — mobile
//     "05X-XXX-XXXX", landline "0X-XXX-XXXX". Unknown shapes return
//     digits-only rather than breaking the UI.
//   * `toE164(raw)` — returns the strict canonical "+972…" form for
//     server storage, or `null` if the input can't be resolved as an
//     Israeli number.
//
// We deliberately avoid `libphonenumber-js` — the only locale that
// matters here is Israel, and carrying ~60 KB of metadata for IL-only
// formatting is not worth it. If the product expands to other
// countries we can reconsider.

/** Strip every non-digit. Exported for call sites that build wa.me
 *  URLs and just want the digit stream. */
export function digitsOnly(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\D+/g, '');
}

// Resolve "whatever the user typed" to a local IL string with the
// leading 0. Mobile numbers land as 10 digits ("05X…"), landlines
// as 9 digits ("0X…"). Returns `null` if the digits don't match an
// IL shape — `toE164` distinguishes "invalid" from "canonicalizable"
// via that null.
function toLocalIL(raw) {
  const d = digitsOnly(raw);
  if (!d) return null;
  let local;
  // Already-local inputs.
  if ((d.length === 10 || d.length === 9) && d.startsWith('0')) {
    local = d;
  }
  // 9-digit mobile body without leading 0 (e.g. +972 stripped form).
  else if (d.length === 9 && '57'.includes(d[0])) {
    local = `0${d}`;
  }
  // 8-digit landline body without leading 0 (e.g. from "+97235551234").
  else if (d.length === 8 && '234689'.includes(d[0])) {
    local = `0${d}`;
  }
  // International variants: 972 / 0972 / 00972 prefix.
  else if (d.length === 12 && d.startsWith('972')) local = `0${d.slice(3)}`;
  else if (d.length === 11 && d.startsWith('972')) local = `0${d.slice(3)}`;
  else if (d.length === 13 && d.startsWith('0972')) local = `0${d.slice(4)}`;
  else if (d.length === 14 && d.startsWith('00972')) local = `0${d.slice(5)}`;
  else return null;

  // Second-digit sanity — IL phones all have a 0X prefix where X is
  // a mobile (5,7) or landline (2,3,4,6,8,9) code.
  const p = local[1];
  if (!'2346895 7'.replace(/\s/g, '').includes(p)) return null;
  return local;
}

/**
 * Display-friendly formatted phone number.
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function formatPhone(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const d = digitsOnly(s);
  if (!d) return '';

  // International — "+972…", "00972…", or a 12-digit form that leads
  // with 972 (agents paste this shape all the time).
  const hadIntl = /^\s*(\+|00)9?72/.test(s) || (d.length === 12 && d.startsWith('972'));
  const local = toLocalIL(s);

  // International-shaped input: "+972 XX-XXX-XXXX" for mobile, or
  // "+972 X-XXX-XXXX" for 9-digit landline.
  if (local && hadIntl) {
    const rest = local.slice(1);
    if (rest.length === 9) {
      return `+972 ${rest.slice(0, 2)}-${rest.slice(2, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+972 ${rest.slice(0, 1)}-${rest.slice(1, 4)}-${rest.slice(4)}`;
    }
  }

  // Local-shaped input.
  if (local) {
    const rest = local.slice(1);
    // Mobile — "05X-XXX-XXXX" or "07X-XXX-XXXX" (10-digit total).
    if (/^[57]/.test(rest) && rest.length === 9) {
      return `${local.slice(0, 3)}-${rest.slice(2, 5)}-${rest.slice(5)}`;
    }
    // Landline — 9-digit total: "0X-XXX-XXXX". Central area (0[234689])
    // uses a 1-digit area code; the remaining 7 split as 3-4.
    if (/^[234689]/.test(rest) && rest.length === 8) {
      const area = rest[0];
      const body = rest.slice(1);
      return `0${area}-${body.slice(0, 3)}-${body.slice(3)}`;
    }
  }

  // Unknown shape — we return the digit stream so the UI shows
  // *something* instead of an empty cell. Callers that need strict
  // validation should use `toE164` which returns `null` on failure.
  return d;
}

/**
 * Canonicalize to E.164 (+972...). Returns null for non-IL / invalid.
 * @param {string|number|null|undefined} raw
 * @returns {string|null}
 */
export function toE164(raw) {
  const local = toLocalIL(raw);
  if (!local) return null;
  return `+972${local.slice(1)}`;
}

export default formatPhone;
