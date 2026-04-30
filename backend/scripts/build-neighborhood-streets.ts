// scripts/build-neighborhood-streets.ts
//
// Offline ingestion: pulls OpenStreetMap (via Overpass) for every
// city in our Population-Authority street registry and builds the
// Neighborhood table — one row per OSM `place=suburb|neighbourhood|
// quarter` element — with `streetCodes` populated by spatial-join
// against the city's registry streets.
//
// Strategy per city:
//   1. Query Overpass for all `place=suburb|neighbourhood|quarter`
//      elements within the city's bounding box. Polygons (way /
//      relation with geometry) keep their geometry; bare nodes are
//      kept as points.
//   2. For polygon neighborhoods: query Overpass for `highway~"^(
//      residential|primary|secondary|tertiary|unclassified|
//      living_street|pedestrian)$"]["name"]` ways inside the polygon.
//   3. Match each OSM way's `name` against the city's canonical
//      registry streets (normalized via the same `normKey` the
//      runtime uses) → collect codes.
//   4. For node-only neighborhoods (no polygon): assign each registry
//      street to its nearest neighborhood node (Voronoi-style). Run
//      once after all polygon work for the city.
//   5. Upsert into the `Neighborhood` table.
//
// Run:
//   ESTIA_DATABASE_URL=... npx tsx scripts/build-neighborhood-streets.ts \
//     [--city=<name>] [--limit-cities=N] [--dry-run]
//
// Idempotent — upserts on `(city, name)`. Aliases column is left
// alone so any manual curation is preserved across re-runs.

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normKey } from '../src/lib/addressNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const prisma = new PrismaClient();

const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

type RegistryCity = { code: number; name: string; streets?: Array<[number, string]> };
type Registry = { cities?: RegistryCity[] };

type OsmTags = Record<string, string>;
type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: OsmTags;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role?: string; geometry?: Array<{ lat: number; lon: number }> }>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
};
type OsmResponse = { elements: OsmElement[] };

function loadRegistry(): Registry {
  const jsonPath = resolve(__dirname, '../src/data/israelStreets.json');
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as Registry;
}

async function overpass(query: string): Promise<OsmResponse> {
  const body = new URLSearchParams({ data: query }).toString();
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'EstiaCRM/1.0 (estia.co.il)',
    },
    body,
  });
  if (!r.ok) throw new Error(`overpass ${r.status} ${r.statusText}`);
  return r.json() as Promise<OsmResponse>;
}

// City bounding-box lookup. Overpass `area[name=...]` is unreliable
// for Hebrew names, so we resolve cities to their wikidata id when
// possible and fall back to a name-tag bbox search. Returns null if
// the city can't be located — callers skip those cities.
// Nominatim is more forgiving than Overpass on Hebrew name variants
// (it folds maqaf / em-dash / spaces internally), so we use it for
// the city → bbox lookup. Free public endpoint; required UA header
// per their usage policy. Rate-limited to ~1 req/sec, so the caller
// must serialise.
const NOMINATIM_UA = 'EstiaCRM/1.0 (estia.co.il)';
async function findCityBounds(name: string): Promise<{ s: number; w: number; n: number; e: number } | null> {
  const q = new URLSearchParams({
    city: name,
    country: 'Israel',
    format: 'json',
    limit: '1',
  }).toString();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
      headers: { 'User-Agent': NOMINATIM_UA },
    });
    if (!r.ok) return null;
    const arr = (await r.json()) as Array<{ boundingbox?: string[] }>;
    const bb = arr[0]?.boundingbox;
    if (!bb || bb.length !== 4) return null;
    // Nominatim order: [south, north, west, east]
    return { s: Number(bb[0]), n: Number(bb[1]), w: Number(bb[2]), e: Number(bb[3]) };
  } catch { return null; }
}

async function fetchHoodsInBbox(b: { s: number; w: number; n: number; e: number }) {
  const bbox = `${b.s},${b.w},${b.n},${b.e}`;
  const q = `[out:json][timeout:30];
(
  node["place"~"^(neighbourhood|suburb|quarter)$"](${bbox});
  way["place"~"^(neighbourhood|suburb|quarter)$"](${bbox});
  relation["place"~"^(neighbourhood|suburb|quarter)$"]["type"="multipolygon"](${bbox});
);
out tags geom;`;
  return (await overpass(q)).elements;
}

// Pulls all named highway ways inside a polygon. `polyCoords` is a
// flat lat-lon space-separated list per Overpass's `poly:"…"` filter.
async function fetchStreetsInPolygon(polyCoords: string) {
  const q = `[out:json][timeout:60];
way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|pedestrian)$"]["name"](poly:"${polyCoords}");
out tags;`;
  return (await overpass(q)).elements;
}

function polyCoordsString(geom: Array<{ lat: number; lon: number }>): string {
  return geom.map((p) => `${p.lat} ${p.lon}`).join(' ');
}

function relationOuterRing(rel: OsmElement): Array<{ lat: number; lon: number }> | null {
  if (!rel.members) return null;
  for (const m of rel.members) {
    if (m.type === 'way' && (m.role === 'outer' || m.role === '') && m.geometry?.length) {
      return m.geometry;
    }
  }
  return null;
}

function osmName(el: OsmElement): string | null {
  const t = el.tags || {};
  return t['name:he'] || t.name || null;
}

// Sleep helper — Overpass enforces ~2 req/sec on the public endpoint;
// stay polite or get banned.
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function processCity(reg: RegistryCity) {
  const cityName = reg.name;
  if (!reg.streets?.length) {
    console.log(`  [${cityName}] no registry streets — skip`);
    return { rows: 0, joined: 0 };
  }
  // Build a normalized lookup: registry-street-key → code, so we can
  // match OSM names back to canonical codes. `normKey` strips nikud,
  // qualifiers, lowercases — same path the runtime uses.
  const byKey = new Map<string, number>();
  for (const [code, name] of reg.streets) {
    const k = normKey(String(name));
    if (k && !byKey.has(k)) byKey.set(k, Number(code));
  }

  const bounds = await findCityBounds(cityName);
  if (!bounds) {
    console.log(`  [${cityName}] no bbox — skip`);
    return { rows: 0, joined: 0 };
  }
  await sleep(500);

  const els = await fetchHoodsInBbox(bounds);
  await sleep(500);

  const polygonHoods: Array<{ name: string; ring: Array<{ lat: number; lon: number }> }> = [];
  const nodeHoods: Array<{ name: string; lat: number; lon: number }> = [];
  for (const el of els) {
    const name = osmName(el);
    if (!name) continue;
    if (el.type === 'way' && el.geometry?.length) {
      polygonHoods.push({ name, ring: el.geometry });
    } else if (el.type === 'relation') {
      const ring = relationOuterRing(el);
      if (ring) polygonHoods.push({ name, ring });
    } else if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodeHoods.push({ name, lat: el.lat, lon: el.lon });
    }
  }

  let totalJoined = 0;
  let rows = 0;

  // 1. Polygon neighborhoods → spatial-join via Overpass `poly:`.
  for (const h of polygonHoods) {
    try {
      const ways = await fetchStreetsInPolygon(polyCoordsString(h.ring));
      const codes = new Set<number>();
      for (const w of ways) {
        const wn = osmName(w);
        if (!wn) continue;
        const code = byKey.get(normKey(wn));
        if (code != null) codes.add(code);
      }
      const arr = [...codes];
      await prisma.neighborhood.upsert({
        where: { city_name: { city: cityName, name: h.name } },
        create: { city: cityName, name: h.name, streetCodes: arr },
        update: { streetCodes: arr },
      });
      rows += 1;
      totalJoined += arr.length;
      await sleep(700);
    } catch (e) {
      console.log(`  [${cityName}] poly fail "${h.name}":`, (e as Error).message);
      await sleep(1500);
    }
  }

  // 2. Point-only neighborhoods get an empty streetCodes for now.
  //    The follow-up pass can do a Voronoi assignment based on the
  //    union of polygon coverage; out-of-scope for this script.
  for (const h of nodeHoods) {
    await prisma.neighborhood.upsert({
      where: { city_name: { city: cityName, name: h.name } },
      create: { city: cityName, name: h.name, streetCodes: [] },
      update: {},
    });
    rows += 1;
  }

  console.log(`  [${cityName}] hoods=${rows} (${polygonHoods.length} poly + ${nodeHoods.length} node), joined-streets=${totalJoined}`);
  return { rows, joined: totalJoined };
}

async function main() {
  const argv = process.argv.slice(2);
  const cityArg = argv.find((a) => a.startsWith('--city='))?.slice(7);
  const limitArg = argv.find((a) => a.startsWith('--limit-cities='))?.slice(15);
  const dryRun = argv.includes('--dry-run');

  const reg = loadRegistry();
  let cities = (reg.cities || []).filter((c) => (c.streets?.length ?? 0) > 0);
  if (cityArg) cities = cities.filter((c) => c.name === cityArg);
  if (limitArg) cities = cities.slice(0, Number(limitArg));

  console.log(`processing ${cities.length} cities…${dryRun ? ' (dry-run)' : ''}`);
  let totalRows = 0; let totalJoined = 0;
  for (const c of cities) {
    if (dryRun) { console.log(`  [${c.name}] would process`); continue; }
    try {
      const r = await processCity(c);
      totalRows += r.rows; totalJoined += r.joined;
    } catch (e) {
      console.log(`  [${c.name}] ERROR:`, (e as Error).message);
    }
    await sleep(800);
  }
  console.log(`done. neighborhoods=${totalRows}, joined-streets=${totalJoined}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
