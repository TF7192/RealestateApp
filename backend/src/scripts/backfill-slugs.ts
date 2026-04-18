// One-shot backfill: fill slug for every existing User (AGENT) and Property
// that doesn't have one. Safe to re-run — only fills NULL rows.
//
// Run with: npm run backfill:slugs    (added below to package.json)

import { prisma } from '../lib/prisma.js';
import { slugify, propertySlug, ensureUniqueSlug } from '../lib/slug.js';

async function main() {
  // Agents
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', slug: null },
    select: { id: true, displayName: true },
  });
  console.log(`[slugs] backfilling ${agents.length} agents…`);
  for (const a of agents) {
    const base = slugify(a.displayName) || `agent-${a.id.slice(-6)}`;
    const free = await ensureUniqueSlug(base, async (cand) => {
      const x = await prisma.user.findUnique({ where: { slug: cand } });
      return !!x;
    });
    await prisma.user.update({ where: { id: a.id }, data: { slug: free } });
    console.log(`  • ${a.displayName} → /agents/${free}`);
  }

  // Properties — slug is unique per-agent
  const properties = await prisma.property.findMany({
    where: { slug: null },
    select: { id: true, agentId: true, type: true, rooms: true, city: true, street: true },
  });
  console.log(`[slugs] backfilling ${properties.length} properties…`);
  for (const p of properties) {
    const base = propertySlug(p) || `property-${p.id.slice(-6)}`;
    const free = await ensureUniqueSlug(base, async (cand) => {
      const x = await prisma.property.findFirst({
        where: { agentId: p.agentId, slug: cand },
      });
      return !!x;
    });
    await prisma.property.update({ where: { id: p.id }, data: { slug: free } });
  }
  console.log('[slugs] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
