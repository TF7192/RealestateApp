import type { FastifyPluginAsync } from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';

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
function loadRegistryCities(): string[] {
  if (REGISTRY_CITIES) return REGISTRY_CITIES;
  try {
    const jsonPath = resolve(__dirname, '../data/israelStreets.json');
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    REGISTRY_CITIES = (parsed.cities || [])
      .map((c: { name?: string }) => (c?.name || '').trim())
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'he'));
  } catch { REGISTRY_CITIES = []; }
  return REGISTRY_CITIES || [];
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

  app.get('/streets', async (req) => {
    const { city } = req.query as { city?: string };
    const where = city ? { city } : {};
    const streets = await prisma.streetLookup.findMany({ where });
    return {
      streets: streets.map((s) => ({ name: s.name, city: s.city, lat: s.lat, lng: s.lng })),
    };
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
