// Per-field normalization for imported rows. Each transformer takes
// a raw cell value (whatever SheetJS handed back — string, number,
// Date, bool) and returns the typed shape Prisma expects, or throws
// a short Hebrew error the UI can render inline on the row.
//
// Keep these dumb and predictable — no network, no DB lookups. The
// route layer composes these + cross-field transforms (split full
// name, split "Herzl 42, Tel Aviv").

export class CellError extends Error {}
const err = (msg: string) => new CellError(msg);

const HEBREW_TRUE  = ['כן', 'יש', 'נכון', 'true', 'yes', '1', '✓', 'v'];
const HEBREW_FALSE = ['לא', 'אין', 'שקר', 'false', 'no', '0', '✗', 'x'];

export function asString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function asInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  // Strip currency symbols / thousands separators / Hebrew commas.
  const cleaned = String(v).replace(/[,₪$€\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw err('ערך לא מספרי');
  return Math.round(n);
}

export function asFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const cleaned = String(v).replace(/[,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw err('ערך לא מספרי');
  return n;
}

export function asBool(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (HEBREW_TRUE.some((t) => s === t.toLowerCase())) return true;
  if (HEBREW_FALSE.some((t) => s === t.toLowerCase())) return false;
  // Any non-empty truthy string defaults to true to be forgiving.
  return true;
}

// Israeli phone normalizer. Mirrors the frontend `toE164` helper but
// kept in-backend so the batch route doesn't need to pull the JS
// module. Returns null for empty / unparseable input.
export function asIsraeliPhone(v: unknown): string | null {
  const raw = asString(v);
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  let local: string | null = null;
  if ((digits.length === 10 || digits.length === 9) && digits.startsWith('0')) local = digits;
  else if (digits.length === 9  && /^[57]/.test(digits)) local = `0${digits}`;
  else if (digits.length === 8  && /^[234689]/.test(digits)) local = `0${digits}`;
  else if (digits.length === 12 && digits.startsWith('972')) local = `0${digits.slice(3)}`;
  else if (digits.length === 11 && digits.startsWith('972')) local = `0${digits.slice(3)}`;
  else if (digits.length === 13 && digits.startsWith('0972')) local = `0${digits.slice(4)}`;
  else if (digits.length === 14 && digits.startsWith('00972')) local = `0${digits.slice(5)}`;
  if (!local) return null;
  const p = local[1];
  if (!'2346895 7'.replace(/\s/g, '').includes(p)) return null;
  return `+972${local.slice(1)}`;
}

// "Ran Levi" → { firstName: 'Ran', lastName: 'Levi' }
// "ישראל ישראלי" → { firstName: 'ישראל', lastName: 'ישראלי' }
// "ישראל" → { firstName: 'ישראל', lastName: null }
export function splitFullName(v: unknown): { firstName: string | null; lastName: string | null } {
  const s = asString(v);
  if (!s) return { firstName: null, lastName: null };
  const parts = s.split(/\s+/);
  const first = parts.shift() ?? null;
  const last = parts.length ? parts.join(' ') : null;
  return { firstName: first, lastName: last };
}

// "הרצל 42, תל אביב" → { street: 'הרצל 42', city: 'תל אביב' }
// Falls back gracefully: no comma → everything is street, city stays null.
export function splitAddress(v: unknown): { street: string | null; city: string | null } {
  const s = asString(v);
  if (!s) return { street: null, city: null };
  const lastComma = s.lastIndexOf(',');
  if (lastComma < 0) return { street: s, city: null };
  return {
    street: s.slice(0, lastComma).trim() || null,
    city:   s.slice(lastComma + 1).trim() || null,
  };
}

// Enum coercers — forgiving on input, strict on output.
// Returns `null` if the input doesn't match any of the accepted labels.
export function asLookingFor(v: unknown): 'BUY' | 'RENT' | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  if (/השכרה|להשכיר|rent|שכירות|rental/.test(s)) return 'RENT';
  if (/מכירה|לקנות|buy|rkisha|sale|purchase/.test(s)) return 'BUY';
  return null;
}
export function asInterestType(v: unknown): 'PRIVATE' | 'COMMERCIAL' | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  if (/מסחרי|משרד|חנות|commercial|office|shop|store/.test(s)) return 'COMMERCIAL';
  if (/פרטי|private|residential|residence|מגורים/.test(s)) return 'PRIVATE';
  return null;
}
export function asAssetClass(v: unknown): 'RESIDENTIAL' | 'COMMERCIAL' | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  if (/מגורים|residential|apartment|דירה|residence/.test(s)) return 'RESIDENTIAL';
  if (/מסחרי|commercial|office|shop|store/.test(s)) return 'COMMERCIAL';
  return null;
}
export function asPropertyCategory(v: unknown): 'SALE' | 'RENT' | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  if (/מכירה|sale|for ?sale/.test(s)) return 'SALE';
  if (/השכרה|rent|rental|for ?rent/.test(s)) return 'RENT';
  return null;
}
