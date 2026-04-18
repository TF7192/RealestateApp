// One-shot backfill: turn every Property's inline owner/ownerPhone fields
// into a real Owner row, and link them via Property.propertyOwnerId.
// Idempotent — properties that already have a propertyOwnerId are skipped.
//
// Two properties under the same agent that share the same (name+phone) are
// linked to the SAME Owner row — so the agent's "ספר בעלים" deduplicates.
//
// Run with:  npm run backfill:owners
//            (or:  node dist/scripts/backfill-owners.js  inside the container)

import { prisma } from '../lib/prisma.js';

async function main() {
  const properties = await prisma.property.findMany({
    where: { propertyOwnerId: null },
    select: { id: true, agentId: true, owner: true, ownerPhone: true, ownerEmail: true },
  });
  console.log(`[owners] backfilling ${properties.length} properties`);

  // Cache: agentId -> normalized "name|phone" -> Owner.id
  const cache = new Map<string, Map<string, string>>();

  let created = 0;
  let linked = 0;

  for (const p of properties) {
    const name = (p.owner || '').trim();
    const phone = (p.ownerPhone || '').replace(/[^\d]/g, '');
    if (!name && !phone) continue; // nothing to backfill from

    const key = `${name.toLowerCase()}|${phone}`;
    let perAgent = cache.get(p.agentId);
    if (!perAgent) {
      perAgent = new Map();
      // Pre-warm with any existing Owner rows for this agent
      const existing = await prisma.owner.findMany({
        where: { agentId: p.agentId },
        select: { id: true, name: true, phone: true },
      });
      for (const o of existing) {
        const k = `${o.name.toLowerCase()}|${(o.phone || '').replace(/[^\d]/g, '')}`;
        perAgent.set(k, o.id);
      }
      cache.set(p.agentId, perAgent);
    }

    let ownerId = perAgent.get(key);
    if (!ownerId) {
      const owner = await prisma.owner.create({
        data: {
          agentId: p.agentId,
          name: name || 'בעל לא מזוהה',
          phone: p.ownerPhone || '',
          email: p.ownerEmail || null,
        },
      });
      ownerId = owner.id;
      perAgent.set(key, ownerId);
      created += 1;
    }

    await prisma.property.update({
      where: { id: p.id },
      data: { propertyOwnerId: ownerId },
    });
    linked += 1;
  }

  console.log(`[owners] created ${created} owner rows, linked ${linked} properties`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
