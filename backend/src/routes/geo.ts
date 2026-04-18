import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

/**
 * Reverse-geocode proxy.
 *
 * The browser cannot set a custom User-Agent (Nominatim's policy requires
 * one and they block unidentified requests), and the response shape needs
 * normalization for Israeli addresses where the right "city" key is one of
 * city/town/village/municipality/suburb depending on the locality. We do the
 * proxy + parsing here and return a clean `{city, street, fullAddress}`.
 */
export const registerGeoRoutes: FastifyPluginAsync = async (app) => {
  const Q = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
  });

  // Tiny in-memory throttle so we never burst Nominatim past 1 req/sec
  let lastCallAt = 0;
  const minGapMs = 1000;

  app.get('/reverse', async (req, reply) => {
    const parsed = Q.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'lat/lon required' } });
    }
    const { lat, lon } = parsed.data;

    const now = Date.now();
    const wait = Math.max(0, lastCallAt + minGapMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lon}&accept-language=he&zoom=18&addressdetails=1`;

    let data: any;
    try {
      const r = await fetch(url, {
        headers: {
          // Nominatim requires identifying the app per their usage policy.
          'User-Agent': 'Estia-CRM/1.0 (https://estia.tripzio.xyz)',
          'Accept-Language': 'he,en;q=0.7',
        },
      });
      if (!r.ok) {
        return reply.code(502).send({
          error: { message: 'reverse geocoder unavailable', upstream: r.status },
        });
      }
      data = await r.json();
    } catch (err: any) {
      req.log.warn({ err }, 'nominatim fetch failed');
      return reply.code(504).send({ error: { message: 'geocoder timeout' } });
    }

    const a = data?.address || {};
    // Israeli addresses use varied keys for the locality. Cascade through
    // the most-likely → least-likely.
    const city =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.suburb ||
      a.county ||
      a.state_district ||
      a.state ||
      '';

    const street = a.road || a.pedestrian || a.path || '';
    const houseNumber = a.house_number || '';

    const streetWithNumber = houseNumber && street
      ? `${street} ${houseNumber}`
      : street;

    return {
      city,
      street: streetWithNumber,
      fullAddress: data?.display_name || '',
      raw: a,
    };
  });

  /**
   * Forward-geocode typeahead via Photon (OSM-backed, free, no API key).
   *
   * Task 3 — every address input in the app must only accept a validated
   * place. The frontend AddressField hits this endpoint on every keystroke
   * (debounced) and only lets the agent submit the form after picking
   * from the returned list. The server stores what the client sends
   * (`placeId` + `lat`/`lng` + `formattedAddress`); we re-check nothing
   * here so this endpoint is a thin proxy, not a validation boundary.
   *
   * Photon's hosted instance (photon.komoot.io) accepts commercial
   * traffic and needs no key. We bias around the geographic centre of
   * Israel so agents searching "בן יהודה" don't get Montevideo.
   */
  const SearchQ = z.object({
    q:     z.string().trim().min(1).max(200),
    lang:  z.string().trim().max(5).optional(),
    limit: z.coerce.number().int().min(1).max(15).optional(),
    // Optional: already-chosen city — we append it to the query to nudge
    // suggestions toward the right locality.
    city:  z.string().trim().max(80).optional(),
  });

  // Same rolling throttle bucket; Photon hosted doesn't publish a hard
  // rate limit but courtesy-throttling keeps us honest.
  let lastSearchAt = 0;
  const searchMinGapMs = 250;

  app.get('/search', async (req, reply) => {
    const parsed = SearchQ.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'q required' } });
    }
    const { q, lang = 'he', limit = 8, city } = parsed.data;

    const now = Date.now();
    const wait = Math.max(0, lastSearchAt + searchMinGapMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSearchAt = Date.now();

    // Compose the query — if the agent already picked a city on the form
    // we append it so Photon ranks matches in that locality first.
    const composedQ = city ? `${q}, ${city}` : q;
    const url =
      `https://photon.komoot.io/api?` +
      `q=${encodeURIComponent(composedQ)}` +
      `&lang=${encodeURIComponent(lang)}` +
      `&limit=${limit}` +
      // Bias around geographic centre of Israel (~31.5, 35) so the
      // closest matches float to the top.
      `&lat=31.5&lon=35`;

    let data: any;
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Estia-CRM/1.0 (https://estia.tripzio.xyz)',
          'Accept-Language': `${lang},en;q=0.5`,
        },
      });
      if (!r.ok) {
        return reply.code(502).send({
          error: { message: 'places provider unavailable', upstream: r.status },
        });
      }
      data = await r.json();
    } catch (err: any) {
      req.log.warn({ err }, 'photon fetch failed');
      return reply.code(504).send({ error: { message: 'places provider timeout' } });
    }

    const features = Array.isArray(data?.features) ? data.features : [];
    const items = features
      // Filter to Israel — Photon doesn't accept country filter params so
      // we do it here. Accept both "IL" and missing countrycode for
      // features that straddle borders but look Israeli by locality.
      .filter((f: any) => {
        const cc = f?.properties?.countrycode;
        return !cc || cc === 'IL';
      })
      .map((f: any) => {
        const p = f?.properties || {};
        const coords = f?.geometry?.coordinates || [];
        // Photon returns [lon, lat]
        const lng = Number.isFinite(coords[0]) ? coords[0] : null;
        const lat = Number.isFinite(coords[1]) ? coords[1] : null;
        const street = p.street || p.name || '';
        const houseNumber = p.housenumber || '';
        const streetFull = houseNumber && street ? `${street} ${houseNumber}` : street;
        const localityName =
          p.city || p.town || p.village || p.municipality || p.county || '';
        const labelParts = [streetFull, localityName].filter(Boolean);
        return {
          // OSM id is unique when combined with osm_type (W/R/N). Store the
          // tuple so we can re-query later if needed.
          id: p.osm_id && p.osm_type ? `${p.osm_type}${p.osm_id}` : null,
          street: streetFull,
          houseNumber: houseNumber || null,
          city: localityName,
          postcode: p.postcode || null,
          lat,
          lng,
          label: labelParts.join(', '),
          // Raw kind so the UI can render different icons for
          // "street" vs "city" vs "poi" suggestions.
          kind: p.osm_value || p.osm_key || null,
        };
      })
      // Drop entries with neither street nor city — not useful to pick.
      .filter((x: any) => x.street || x.city);

    return { items };
  });
};
