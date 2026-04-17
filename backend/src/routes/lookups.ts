import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';

export const registerLookupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cities', async () => {
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
