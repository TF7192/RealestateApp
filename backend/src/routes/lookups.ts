import type { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { normKey } from '../lib/addressNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Full canonical Israeli city list from the Population-Authority
// registry — same source `normalizeCity` uses downstream. Cached at
// module load. `/lookups/cities` (below) kept returning only the
// seeded subset, which missed major municipalities like תל אביב -
// יפו; this endpoint is what the Onboarding + other city pickers
// should read from.
// Cached on first hit so the JSON parse (≈1.5 MB) runs once.
let REGISTRY_CITIES: string[] | null = null;

// Per-city street index — built on first hit and reused for every
// /streets autocomplete call. Keyed by `normKey(cityName)` so we can
// look up cities the agent typed in any of the registry-recognised
// spelling variants (תל אביב / תל אביב - יפו / etc.). Each entry is a
// flat array of { name, code, key }, where `key` is the normalized
// match key that lets us prefix-match Hebrew without re-normalizing
// per request. ~62k rows total at ~50 bytes each = ~3MB resident, a
// fixed cost paid once at module init.
type StreetIndexEntry = { name: string; code: number; key: string };
let STREET_INDEX: Map<string, StreetIndexEntry[]> | null = null;

type RegistryCity = {
  code: number;
  name: string;
  streets?: Array<[number, string]>;
};
type Registry = { cities?: RegistryCity[] };

function loadRegistry(): Registry {
  try {
    const jsonPath = resolve(__dirname, '../data/israelStreets.json');
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as Registry;
  } catch {
    return { cities: [] };
  }
}

function loadRegistryCities(): string[] {
  if (REGISTRY_CITIES) return REGISTRY_CITIES;
  try {
    const parsed = loadRegistry();
    REGISTRY_CITIES = (parsed.cities || [])
      .map((c) => (c?.name || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'));
  } catch { REGISTRY_CITIES = []; }
  return REGISTRY_CITIES || [];
}

function loadStreetIndex(): Map<string, StreetIndexEntry[]> {
  if (STREET_INDEX) return STREET_INDEX;
  const idx = new Map<string, StreetIndexEntry[]>();
  try {
    const parsed = loadRegistry();
    for (const c of parsed.cities || []) {
      const cityName = (c?.name || '').trim();
      if (!cityName) continue;
      const entries: StreetIndexEntry[] = (c.streets || []).map(
        ([code, name]) => ({
          name: String(name || '').trim(),
          code: Number(code) || 0,
          // Pre-fold each street name to the same key normKey produces.
          // Per-request lookups then just `.startsWith` / `.includes` on
          // the (lowercase, nikud-stripped, qualifier-stripped) key.
          key: normKey(String(name || '')),
        }),
      ).filter((s) => s.name);
      // Index under the canonical city name AND the normalized key, so
      // either ?city=תל אביב or the registry's "תל אביב - יפו" both hit.
      const canonical = cityName;
      idx.set(canonical, entries);
      const k = normKey(canonical);
      if (k && !idx.has(k)) idx.set(k, entries);
    }
  } catch { /* index stays empty — endpoints just return [] */ }
  STREET_INDEX = idx;
  return idx;
}

// O(n) prefix/contains filter over a city's street list. Hebrew-letter
// prefix is the strongest signal (the agent is typing left-to-right
// from the start of the street name), so prefix matches are ranked
// before substring matches; ties break on shorter names so "הרצל"
// outranks "הרצל פינת אלנבי".
function searchStreets(
  entries: StreetIndexEntry[],
  q: string,
  limit: number,
): StreetIndexEntry[] {
  const k = normKey(q);
  if (!k) return entries.slice(0, Math.max(0, limit));
  const prefix: StreetIndexEntry[] = [];
  const contains: StreetIndexEntry[] = [];
  for (const s of entries) {
    if (!s.key) continue;
    if (s.key.startsWith(k)) prefix.push(s);
    else if (s.key.includes(k)) contains.push(s);
    if (prefix.length >= limit) break;
  }
  // Stable sort by name length so the most-typed canonical hits float up.
  prefix.sort((a, b) => a.name.length - b.name.length);
  contains.sort((a, b) => a.name.length - b.name.length);
  return prefix.concat(contains).slice(0, Math.max(0, limit));
}

export const registerLookupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cities', async () => {
    // Prefer the full registry; fall back to the seeded CityLookup
    // table only if the JSON failed to load.
    const registry = loadRegistryCities();
    if (registry.length) {
      return { cities: registry.map((name) => ({ name })) };
    }
    const cities = await prisma.cityLookup.findMany();
    return {
      cities: cities.map((c) => ({ name: c.name, lat: c.lat, lng: c.lng })),
    };
  });

  // Street autocomplete backed by the in-memory population-registry
  // index. Replaces the old StreetLookup-table read (which carried
  // only a seeded subset and didn't map to canonical street codes).
  // Response: { items: [{ name, code }] } — typed for the
  // StreetHouseField autocomplete on /properties/new.
  app.get('/streets', async (req) => {
    const { city, q, limit } = req.query as {
      city?: string;
      q?: string;
      limit?: string;
    };
    const lim = Math.max(1, Math.min(100, Number(limit) || 20));
    if (!city) return { items: [] };
    const idx = loadStreetIndex();
    const entries =
      idx.get(city.trim()) || idx.get(normKey(city)) || null;
    if (!entries) return { items: [] };
    // Empty q → return the first 50 streets in registry order. The
    // dataset isn't ranked, but the population-authority order is
    // already stable + spans common streets first inside most cities.
    // The 50-row default is intentional (spec) — a wider list than
    // limit's 20 default so an idle dropdown gives the agent room to
    // browse. Caller can shrink it by passing &limit=10 etc.
    if (!q || !q.trim()) {
      const cap = Number(limit) ? lim : 50;
      return {
        items: entries.slice(0, cap)
          .map(({ name, code }) => ({ name, code })),
      };
    }
    const hits = searchStreets(entries, q, lim);
    return { items: hits.map(({ name, code }) => ({ name, code })) };
  });

  // Quick resolver — returns coords for a free-text query.
  app.get('/resolve', async (req) => {
    const { q } = req.query as { q?: string };
    if (!q) return { match: null };
    const qt = q.trim();
    const street = await prisma.streetLookup.findFirst({
      where: { OR: [{ name: { contains: qt } }, { city: { contains: qt } }] },
    });
    if (street) {
      return {
        match: {
          label: `${street.name}, ${street.city}`,
          lat: street.lat,
          lng: street.lng,
          type: 'street',
        },
      };
    }
    const city = await prisma.cityLookup.findFirst({
      where: { name: { contains: qt } },
    });
    if (city) {
      return {
        match: { label: city.name, lat: city.lat, lng: city.lng, type: 'city' },
      };
    }
    return { match: null };
  });
};
