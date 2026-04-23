// Build the compact Israel-streets JSON that ships inside the server
// image. Pulls the official list from data.gov.il resource
// 9ad3862c-8391-4b2f-84a4-2d4c68625f4b (רשימת רחובות בישראל — updated
// weekly by the Population Authority) via the CKAN datastore API,
// strips the Hebrew noise (trailing spaces, dataset-only sentinel
// street_code 9000), groups streets by city, and writes:
//
//   backend/src/data/israelStreets.json
//
// Shape:
//   {
//     "cities": [
//       { "code": 5000, "name": "תל אביב - יפו", "streets": [[100, "שנקין"], …] }
//     ],
//     "version": "2026-04-19"
//   }
//
// We keep codes in the JSON so the normalizer can later return them
// without a second lookup (street_code is the government-issued ID —
// the only stable handle across spelling variants).
//
// Rerun by hand with `npx tsx backend/scripts/build-israel-streets.ts`
// when the upstream dataset gets a fresh weekly dump. The JSON is
// checked-in so `npm run build` doesn't hit the network.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESOURCE_ID = '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';
const PAGE_SIZE = 32_000;

type Row = {
  'סמל_ישוב': number;
  'שם_ישוב': string;
  'סמל_רחוב': number;
  'שם_רחוב': string;
};

async function fetchPage(offset: number): Promise<Row[]> {
  const url =
    `https://data.gov.il/api/3/action/datastore_search?` +
    `resource_id=${RESOURCE_ID}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CKAN ${res.status} at offset ${offset}`);
  const body = (await res.json()) as { result: { records: Row[] } };
  return body.result.records;
}

async function main() {
  const all: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = await fetchPage(offset);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  console.log(`Fetched ${all.length} rows`);

  const byCity = new Map<number, { code: number; name: string; streets: Map<number, string> }>();
  for (const r of all) {
    const cityName = (r['שם_ישוב'] || '').trim();
    const streetName = (r['שם_רחוב'] || '').trim();
    const cityCode = Number(r['סמל_ישוב']);
    const streetCode = Number(r['סמל_רחוב']);
    if (!cityName || !cityCode) continue;
    let city = byCity.get(cityCode);
    if (!city) {
      city = { code: cityCode, name: cityName, streets: new Map() };
      byCity.set(cityCode, city);
    }
    // 9000 = sentinel for "no streets mapped in this locality" — the row
    // is just the city itself. Skip it so we don't offer the city name
    // as a street option.
    if (streetCode && streetCode !== 9000 && streetName) {
      city.streets.set(streetCode, streetName);
    }
  }

  const cities = [...byCity.values()]
    .map((c) => ({
      code: c.code,
      name: c.name,
      streets: [...c.streets.entries()]
        .map(([code, name]) => [code, name] as [number, string])
        .sort((a, b) => a[1].localeCompare(b[1], 'he')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const out = {
    version: new Date().toISOString().slice(0, 10),
    source: 'data.gov.il dataset 321',
    cities,
  };

  const dest = path.resolve(__dirname, '../src/data/israelStreets.json');
  await fs.writeFile(dest, JSON.stringify(out));
  const totalStreets = cities.reduce((n, c) => n + c.streets.length, 0);
  console.log(`Wrote ${dest}: ${cities.length} cities, ${totalStreets} streets`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
