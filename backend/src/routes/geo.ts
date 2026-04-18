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
};
