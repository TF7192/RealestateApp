// Auto-seed LeadSearchProfile rows for any Lead that doesn't have one
// yet. Most agents won't manually configure search criteria, so the
// market-discovery matching pipeline never fires unless we derive a
// reasonable default profile from the Lead's own fields (city, budget,
// rooms, required features).
//
// Idempotent: only inserts where no profile exists. Run on server boot
// and on every reactor tick — both are cheap (indexed `none: {}` query).

import type { PrismaClient } from '@prisma/client';

export function parseRoomsRange(s: string | null | undefined): {
  minRoom: number | null;
  maxRoom: number | null;
} {
  if (!s) return { minRoom: null, maxRoom: null };
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return { minRoom: null, maxRoom: null };
  const parsed = nums.map((n) => Number.parseFloat(n)).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return { minRoom: null, maxRoom: null };
  if (parsed.length === 1) return { minRoom: parsed[0], maxRoom: parsed[0] };
  return { minRoom: Math.min(...parsed), maxRoom: Math.max(...parsed) };
}

export async function ensureSearchProfilesForOrphanLeads(
  prisma: PrismaClient,
  batchSize = 500,
): Promise<number> {
  const orphans = await prisma.lead.findMany({
    where: { searchProfiles: { none: {} } },
    take: batchSize,
    select: {
      id: true,
      city: true,
      budget: true,
      rooms: true,
      balconyRequired: true,
      parkingRequired: true,
      elevatorRequired: true,
      safeRoomRequired: true,
    },
  });
  if (orphans.length === 0) return 0;

  for (const lead of orphans) {
    const { minRoom, maxRoom } = parseRoomsRange(lead.rooms);
    await prisma.leadSearchProfile.create({
      data: {
        leadId: lead.id,
        cities: lead.city ? [lead.city] : [],
        propertyTypes: [],
        neighborhoods: [],
        streets: [],
        minRoom,
        maxRoom,
        maxPrice: lead.budget ?? null,
        balconyReq: lead.balconyRequired,
        parkingReq: lead.parkingRequired,
        elevatorReq: lead.elevatorRequired,
        mamadReq: lead.safeRoomRequired,
      },
    });
  }
  return orphans.length;
}
