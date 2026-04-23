// Hebrew-first city + street normalizer backed by the official
// Population Authority registry (data.gov.il dataset 321, rebuilt
// offline into `src/data/israelStreets.json`). Given a user-typed
// value ("שיינקין, ראשון לציון") the normalizer returns the canonical
// spelling ("שנקין") plus the government-issued street code so we
// can later match rows across spelling variants.
//
// Strategy:
//   1. Normalize both sides — strip nikud / gershayim variants /
//      punctuation / dataset trailing whitespace — and compare on
//      that fold.
//   2. If the fold matches exactly, done.
//   3. Else run Levenshtein (length-filtered, so we only compare
//      candidates within ± the allowed edit distance) and accept the
//      best match whose normalized-ratio ≤ 0.33. That clears the
//      common Israeli-spelling drift (שיינקין → שנקין, 2 edits out
//      of 7) without over-matching unrelated streets.
//   4. No confident match → return the original input untouched.
//
// Read paths (search queries) call the same normalizer on the query
// string before building the Prisma `where`, so "שיינקין" finds the
// row stored as "שנקין". Write paths call it right before Prisma
// create/update so newly stored data is canonical.

import rawData from '../data/israelStreets.json';

type RegistryCity = {
  code: number;
  name: string;
  streets: Array<[number, string]>;
};
type Registry = { version: string; source: string; cities: RegistryCity[] };

const registry = rawData as Registry;

// ── Normalization key ────────────────────────────────────────────────
// Folds a user-typed Hebrew (or English) place name down to a form we
// can compare character-for-character. Strips: nikud, gershayim
// variants, parenthetical suffixes ("אום אל-פחם (עיר)"), punctuation,
// house numbers (agents type "הרצל 15" but the registry stores
// "הרצל"), and collapses whitespace.
const NIKUD_RE = /[֑-ׇ]/g;
const PAREN_RE = /\([^)]*\)/g;
// Trailing house number. Runs AFTER punctuation (/, -) has been
// converted to spaces, so "15/3" and "15-17" arrive as multiple
// numeric tokens — we strip them greedily. Optional Hebrew-letter
// suffix on each number ("15א").
const HOUSE_NUM_RE = /(?:\s+\d+[א-ת]?)+\s*$/;

// Street-prefix aliases the government registry uses interchangeably.
// We normalize in both directions: queries typed with the long form
// ("שדרות הרצל") still match registry entries stored short ("שד הרצל"),
// and vice versa. Applied only at the start of the key — mid-string
// occurrences of these words (rare) are left alone.
const PREFIX_ALIASES: Array<[RegExp, string]> = [
  [/^(שדרות|שדרה|שד'?)\s+/, 'שד '],
  [/^(רחוב|רח'?)\s+/, ''],           // "רחוב הרצל" / "רח' הרצל" → "הרצל"
  [/^(דרך|דר'?)\s+/, 'דרך '],
  [/^(סמטת?|סמ'?)\s+/, 'סמטת '],
  [/^(כיכר|ככר)\s+/, 'כיכר '],
];

export function normKey(s: string): string {
  let k = s
    .normalize('NFKC')
    .replace(NIKUD_RE, '')
    .replace(PAREN_RE, ' ')
    .replace(/["״׳'`]/g, '')          // all gershayim / apostrophe variants
    .replace(/[-_.,/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  k = k.replace(HOUSE_NUM_RE, '').trim();
  for (const [re, sub] of PREFIX_ALIASES) {
    if (re.test(k)) { k = k.replace(re, sub).trim(); break; }
  }
  return k;
}

// ── Indexes ─────────────────────────────────────────────────────────
// Built once at module init. `cityByKey` maps normalized city name →
// the RegistryCity row. `streetsByCityKey` maps normalized city name
// → a list of { key, keyTight, name, code } ready for Levenshtein.

type StreetEntry = { key: string; keyTight: string; name: string; code: number; len: number };
type CityEntry = { key: string; keyTight: string; name: string; code: number; len: number; streets: StreetEntry[] };

const cityByKey = new Map<string, CityEntry>();
const cityByTight = new Map<string, CityEntry>();
const cityList: CityEntry[] = [];

for (const c of registry.cities) {
  const streets: StreetEntry[] = c.streets.map(([code, name]) => {
    const key = normKey(name);
    return { key, keyTight: key.replace(/\s+/g, ''), name, code, len: key.length };
  });
  const key = normKey(c.name);
  const entry: CityEntry = {
    key,
    keyTight: key.replace(/\s+/g, ''),
    name: c.name.trim(),
    code: c.code,
    len: key.length,
    streets,
  };
  cityByKey.set(key, entry);
  cityByTight.set(entry.keyTight, entry);
  cityList.push(entry);
}

// ── Levenshtein ─────────────────────────────────────────────────────
// Plain iterative Levenshtein with early-exit when the running
// minimum-of-row exceeds `maxDist`. Fast enough for our scale (a city
// has at most ~2,000 streets; we additionally length-filter before
// even calling this).

function levenshtein(a: string, b: string, maxDist: number): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > maxDist) return maxDist + 1;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// Accept-distance cap. Cities use a tighter ratio (0.2) because they
// live in a sparse namespace where a 2-edit slip (ת"א ↔ ג'נאביב) is
// almost always nonsense. Streets use 0.33 — street names cluster in
// Hebrew, so real spelling drift (שיינקין/שינקין — 1 edit out of 7)
// needs the looser bound to survive.
function acceptDist(maxLen: number, ratio: number): number {
  return Math.max(1, Math.round(maxLen * ratio));
}

// Token-subset check: every token of the query appears in the
// candidate's token set. Catches real-world prefix slips like
// "תל אביב" → "תל אביב - יפו" that Levenshtein alone mishandles
// because the length delta is 4. Only considered when the query is
// at least two tokens and at least 5 chars — single-token prefixes
// are too promiscuous ("רמ" would match every city starting with רמ).
function tokenSubset(queryKey: string, candKey: string): boolean {
  const q = queryKey.split(/\s+/).filter(Boolean);
  if (q.length < 2) return false;
  const totalLen = q.reduce((n, t) => n + t.length, 0);
  if (totalLen < 5) return false;
  const c = new Set(candKey.split(/\s+/).filter(Boolean));
  return q.every((t) => c.has(t));
}

type Candidate<T extends { key: string; keyTight: string; len: number }> = {
  entry: T;
  dist: number;
};

function bestMatch<T extends { key: string; keyTight: string; len: number }>(
  raw: string,
  candidates: T[],
  ratio: number,
): Candidate<T> | null {
  const key = normKey(raw);
  const keyTight = key.replace(/\s+/g, '');
  if (!key) return null;
  const qLen = key.length;
  const qTight = keyTight.length;
  const maxDist = acceptDist(Math.max(qLen, 4), ratio);

  // Token-subset pass first — deterministic and cheap. Accept the
  // shortest candidate that contains every query token, which keeps
  // "תל אביב" from snapping to "תל אביב - יפו - שוק הכרמל" if we
  // ever added long compounds.
  let tokenHit: T | null = null;
  for (const cand of candidates) {
    if (tokenSubset(key, cand.key)) {
      if (!tokenHit || cand.len < tokenHit.len) tokenHit = cand;
    }
  }
  if (tokenHit) return { entry: tokenHit, dist: 0 };

  let best: Candidate<T> | null = null;
  for (const cand of candidates) {
    if (Math.abs(cand.len - qLen) > maxDist && Math.abs(cand.keyTight.length - qTight) > maxDist) {
      continue;
    }
    if (cand.keyTight === keyTight) return { entry: cand, dist: 0 };
    const d = Math.min(
      levenshtein(cand.key, key, maxDist),
      levenshtein(cand.keyTight, keyTight, maxDist),
    );
    if (d <= maxDist && (!best || d < best.dist)) {
      best = { entry: cand, dist: d };
      if (d === 0) return best;
    }
  }
  return best;
}

// ── Public API ──────────────────────────────────────────────────────

export type NormalizedCity = { value: string; code: number; confidence: number };
export type NormalizedStreet = { value: string; code: number; confidence: number };

/**
 * Snap a raw city string to its canonical Population-Authority name.
 * Returns null for empty input or when no candidate is close enough.
 */
export function normalizeCity(raw?: string | null): NormalizedCity | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const key = normKey(trimmed);
  const keyTight = key.replace(/\s+/g, '');
  const exact = cityByKey.get(key) || cityByTight.get(keyTight);
  if (exact) return { value: exact.name, code: exact.code, confidence: 1 };
  const best = bestMatch(trimmed, cityList, 0.2);
  if (!best) return null;
  const conf = 1 - best.dist / Math.max(best.entry.len, key.length, 1);
  return { value: best.entry.name, code: best.entry.code, confidence: conf };
}

// Extract the house-number suffix so the caller can re-append it to
// the canonical street name. Accepts "15", "15א", "15/3", "15-17".
// Returns null when the raw value has no trailing numeric token.
function extractHouseSuffix(raw: string): string | null {
  const m = raw.match(/\s+(\d+[א-ת]?(?:[\/-]\d+[א-ת]?)?)\s*$/);
  return m ? m[1] : null;
}

/**
 * Snap a raw street string to its canonical spelling inside the given
 * city. Returns null if the city isn't recognized or no street is
 * close enough. The returned `value` re-attaches the house-number
 * suffix from the raw input so downstream writes preserve that
 * detail — only the street *name* is normalized.
 */
export function normalizeStreet(
  raw?: string | null,
  cityHint?: string | null,
): NormalizedStreet | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Need a city to disambiguate — identical street names live in many
  // municipalities, and guessing across the whole country is too risky.
  const city = normalizeCity(cityHint);
  if (!city) return null;
  const cityEntry = cityByKey.get(normKey(city.value));
  if (!cityEntry || !cityEntry.streets.length) return null;
  const houseSuffix = extractHouseSuffix(trimmed);
  const append = (name: string) => (houseSuffix ? `${name} ${houseSuffix}` : name);

  const key = normKey(trimmed);
  const keyTight = key.replace(/\s+/g, '');
  const exact =
    cityEntry.streets.find((s) => s.key === key) ||
    cityEntry.streets.find((s) => s.keyTight === keyTight);
  if (exact) return { value: append(exact.name), code: exact.code, confidence: 1 };
  const best = bestMatch(trimmed, cityEntry.streets, 0.33);
  if (!best) return null;
  const conf = 1 - best.dist / Math.max(best.entry.len, key.length, 1);
  return { value: append(best.entry.name), code: best.entry.code, confidence: conf };
}

/**
 * Convenience wrapper for write paths. Takes any object that may carry
 * `city` and/or `street` and returns a partial overlay with the
 * canonical values filled in (and government codes attached). Caller
 * does `{ ...body, ...normalizeAddress(body) }`.
 *
 * Values we couldn't confidently normalize are omitted from the
 * overlay — the caller's original wins, so the user's input never
 * gets silently dropped if the registry doesn't know the street yet.
 */
export function normalizeAddress(input: { city?: string | null; street?: string | null }): {
  city?: string;
  street?: string;
  cityCode?: number;
  streetCode?: number;
} {
  const out: { city?: string; street?: string; cityCode?: number; streetCode?: number } = {};
  const city = normalizeCity(input.city);
  if (city) {
    out.city = city.value;
    out.cityCode = city.code;
  }
  const streetCityHint = city?.value ?? input.city ?? null;
  const street = normalizeStreet(input.street, streetCityHint);
  if (street) {
    out.street = street.value;
    out.streetCode = street.code;
  }
  return out;
}
