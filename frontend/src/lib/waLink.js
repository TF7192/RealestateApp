// Build a WhatsApp share URL cleanly. Accepts an Israeli phone in any
// format. Emojis travel as percent-encoded UTF-8 — both endpoints below
// handle that identically.

export function normalizeIsraeliPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0'))   return '972' + digits.slice(1);
  return digits;
}

// 2026-05-12 — encode `text` ourselves with encodeURIComponent so spaces
// become %20 (not URLSearchParams' `+`). WhatsApp Web's URL parser
// accepts both, but several agents reported emojis rendering as "?"
// when the URL had `+`-encoded spaces from a different code path; using
// %20 uniformly makes the bytes the parser sees deterministic.
//
// All URL builders below share this helper so there's a single
// encoding boundary — no risk of double-encoding or accidental
// `URLSearchParams` mix-and-match.
function encodeWaText(text) {
  if (!text) return '';
  // Compose to a single canonical Unicode form before percent-encoding.
  // NFC keeps modifier sequences (variation selectors, ZWJ) intact while
  // collapsing pre-composed forms — what WhatsApp's emoji renderer
  // expects. Defensive in case a paste pipeline anywhere upstream
  // produced decomposed sequences.
  let t = text;
  try { t = t.normalize('NFC'); } catch { /* old environments */ }
  return encodeURIComponent(t);
}

export function waUrl(phone, text) {
  const p = normalizeIsraeliPhone(phone);
  const t = text ? `?text=${encodeWaText(text)}` : '';
  return `https://wa.me/${p}${t}`;
}

// Open without recipient — lets the user pick from their contacts inside WA
export function waUrlNoRecipient(text) {
  return `https://wa.me/?text=${encodeWaText(text || '')}`;
}

// Shared building block (used by openWhatsApp in native/share.js).
export function waEncodeText(text) { return encodeWaText(text); }

export function telUrl(phone) {
  return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export function wazeUrl(streetCity) {
  return `https://waze.com/ul?q=${encodeURIComponent(streetCity || '')}&navigate=yes`;
}
