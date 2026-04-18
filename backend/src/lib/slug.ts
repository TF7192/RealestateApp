/**
 * URL slug generator that preserves Hebrew letters.
 *
 * Modern browsers + Google index Hebrew URLs cleanly — `דירה-3-חד-תל-אביב`
 * shows readably in the address bar and link previews. We strip punctuation,
 * collapse whitespace to hyphens, lowercase Latin, drop everything else.
 */
export function slugify(text: string | null | undefined): string {
  if (!text) return '';
  let s = String(text).normalize('NFC');
  // Hebrew quote marks + Latin quotes
  s = s.replace(/['"׳״`]/g, '');
  s = s.toLowerCase();
  // Spaces / non-breaking-space / underscores → hyphen
  s = s.replace(/[\s\u00A0_]+/g, '-');
  // Keep: Hebrew (U+0590..U+05FF), basic Latin a-z, digits, hyphen
  s = s.replace(/[^\u0590-\u05FFa-z0-9-]/g, '');
  // Collapse runs of hyphens; trim leading/trailing
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  // Hard cap so slugs don't get unwieldy
  if (s.length > 80) s = s.slice(0, 80).replace(/-[^-]*$/, '');
  return s;
}

/**
 * Build a property slug like "דירה-3-חד-תל-אביב-רוטשילד-12".
 * Falls back to short pieces if some attributes are missing.
 */
export function propertySlug(p: {
  type?: string | null;
  rooms?: number | null;
  city?: string | null;
  street?: string | null;
}): string {
  const parts: string[] = [];
  if (p.type)   parts.push(slugify(p.type));
  if (p.rooms != null) parts.push(`${p.rooms}-חד`);
  if (p.city)   parts.push(slugify(p.city));
  if (p.street) parts.push(slugify(p.street));
  const base = parts.filter(Boolean).join('-');
  return base || 'נכס';
}

/**
 * Loop a unique-check function until we find a free slug. Used at create
 * time so we can collide-resolve client-side without a custom DB constraint.
 *
 *   const free = await ensureUniqueSlug(base, async (s) => !!(await prisma.x.findUnique({ where: { slug: s } })));
 */
export async function ensureUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxTries = 50
): Promise<string> {
  if (!base) base = 'item';
  if (!(await isTaken(base))) return base;
  for (let i = 2; i < maxTries + 2; i += 1) {
    const cand = `${base}-${i}`;
    if (!(await isTaken(cand))) return cand;
  }
  // Last-resort: append timestamp so we never block creation
  return `${base}-${Date.now().toString(36)}`;
}
