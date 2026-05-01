// /api/geo/{reverse,search} — Nominatim + Photon proxies. Both
// upstreams must be mocked: Nominatim has a strict 1-req/sec policy
// and Photon has its own quotas; CI absolutely shouldn't reach either
// service. We mock global fetch at the test boundary.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';

let app: FastifyInstance;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof fetch;

beforeAll(async () => {
  app = await build();
  await app.ready();
  originalFetch = globalThis.fetch;
});

afterAll(async () => {
  await app.close();
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const okResponse = (json: unknown): Response => ({
  ok: true,
  status: 200,
  json: async () => json,
} as unknown as Response);

const upstreamFail = (status = 503): Response => ({
  ok: false,
  status,
  json: async () => ({}),
} as unknown as Response);

describe('GET /api/geo/reverse', () => {
  it('rejects missing lat/lon with a 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/geo/reverse' });
    expect(res.statusCode).toBe(400);
  });

  it('returns the normalised city + street + fullAddress for a Tel Aviv pin', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      address: {
        road: 'רוטשילד',
        house_number: '12',
        city: 'תל אביב',
        country_code: 'il',
      },
      display_name: 'רוטשילד 12, תל אביב, ישראל',
    }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/geo/reverse?lat=32.07&lon=34.78',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.city).toMatch(/תל אביב/);
    expect(typeof body.street).toBe('string');
  });

  it('502s when Nominatim itself fails', async () => {
    fetchMock.mockResolvedValueOnce(upstreamFail(503));
    const res = await app.inject({
      method: 'GET',
      url: '/api/geo/reverse?lat=32.07&lon=34.78',
    });
    expect(res.statusCode).toBe(502);
  });

  it('504s when fetch throws (network timeout)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const res = await app.inject({
      method: 'GET',
      url: '/api/geo/reverse?lat=32.07&lon=34.78',
    });
    expect(res.statusCode).toBe(504);
  });
});

describe('GET /api/geo/search', () => {
  it('rejects missing q with a 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/geo/search' });
    expect(res.statusCode).toBe(400);
  });

  it('returns Photon features mapped through the IL filter', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      features: [
        {
          properties: { name: 'רוטשילד 12', city: 'תל אביב', countrycode: 'IL' },
          geometry: { coordinates: [34.78, 32.07] },
        },
        {
          // Out-of-country result — must be filtered.
          properties: { name: 'Rothschild Berlin', countrycode: 'DE' },
          geometry: { coordinates: [13.4, 52.5] },
        },
      ],
    }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/geo/search?q=רוטשילד',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1);
    // x-geo-cache header announces miss vs hit.
    expect(res.headers['x-geo-cache']).toBe('miss');
  });

  it('serves a cached result on the second identical query (x-geo-cache: hit)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      features: [
        {
          properties: { name: 'הרצל 1', city: 'רמת גן', countrycode: 'IL' },
          geometry: { coordinates: [34.81, 32.08] },
        },
      ],
    }));
    const r1 = await app.inject({ method: 'GET', url: '/api/geo/search?q=הרצל' });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers['x-geo-cache']).toBe('miss');
    const r2 = await app.inject({ method: 'GET', url: '/api/geo/search?q=הרצל' });
    expect(r2.statusCode).toBe(200);
    expect(r2.headers['x-geo-cache']).toBe('hit');
    // Cache hit shouldn't have hit Photon a second time.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
