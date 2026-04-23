// One-shot backfill. Runs the same addressNormalize.normalizeAddress
// over every Property and Lead owned by TARGET_EMAIL and rewrites
// city/street to the canonical Population-Authority spelling.
//
// Usage:
//   TARGET_EMAIL=talfuks1234@gmail.com npx tsx scripts/backfill-normalize-addresses.ts
//     → dry run. prints every (id, before → after) diff.
//
//   TARGET_EMAIL=talfuks1234@gmail.com COMMIT=1 \
//     npx tsx scripts/backfill-normalize-addresses.ts
//     → actually writes. Prisma update per row.
//
// DATABASE_URL must be set (use an SSH tunnel to the RDS from your Mac,
// or run this on the EC2 where DATABASE_URL is already in .env). Script
// is idempotent — re-running after a successful commit produces no
// further diffs.

import { PrismaClient } from '@prisma/client';
import { normalizeAddress } from '../src/lib/addressNormalize.js';

const prisma = new PrismaClient();
const COMMIT = process.env.COMMIT === '1';
const email = process.env.TARGET_EMAIL;

if (!email) {
  console.error('TARGET_EMAIL env var required');
  process.exit(1);
}

type Touch = { kind: 'Property' | 'Lead'; id: string; before: { city: string | null; street: string | null }; after: { city?: string; street?: string } };

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, displayName: true, email: true },
  });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(`User: ${user.displayName} <${user.email}>  (id=${user.id})`);
  console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}\n`);

  const touches: Touch[] = [];

  // ── Properties ────────────────────────────────────────────────────
  const props = await prisma.property.findMany({
    where: { agentId: user.id },
    select: { id: true, city: true, street: true },
  });
  console.log(`Properties: ${props.length}`);
  for (const p of props) {
    const addr = normalizeAddress({ city: p.city, street: p.street });
    const cityChanged   = addr.city   && addr.city   !== p.city;
    const streetChanged = addr.street && addr.street !== p.street;
    if (cityChanged || streetChanged) {
      touches.push({
        kind: 'Property',
        id: p.id,
        before: { city: p.city, street: p.street },
        after: { city: cityChanged ? addr.city : undefined, street: streetChanged ? addr.street : undefined },
      });
    }
  }

  // ── Leads ─────────────────────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where: { agentId: user.id },
    select: { id: true, city: true, street: true },
  });
  console.log(`Leads:      ${leads.length}\n`);
  for (const l of leads) {
    const addr = normalizeAddress({ city: l.city, street: l.street });
    const cityChanged   = addr.city   && addr.city   !== l.city;
    const streetChanged = addr.street && addr.street !== l.street;
    if (cityChanged || streetChanged) {
      touches.push({
        kind: 'Lead',
        id: l.id,
        before: { city: l.city, street: l.street },
        after: { city: cityChanged ? addr.city : undefined, street: streetChanged ? addr.street : undefined },
      });
    }
  }

  if (!touches.length) {
    console.log('Nothing to change. All addresses already canonical.');
    return;
  }

  console.log(`Changes to apply (${touches.length}):\n`);
  for (const t of touches) {
    const cityLine   = t.after.city   ? `  city:   "${t.before.city}"   →   "${t.after.city}"`    : '';
    const streetLine = t.after.street ? `  street: "${t.before.street}"   →   "${t.after.street}"` : '';
    console.log(`${t.kind} ${t.id}`);
    if (cityLine)   console.log(cityLine);
    if (streetLine) console.log(streetLine);
    console.log('');
  }

  if (!COMMIT) {
    console.log('Dry run only — no writes. Re-run with COMMIT=1 to apply.');
    return;
  }

  // Raw SQL instead of prisma.update — the backfill needs to run
  // against databases at different migration levels (e.g., prod just
  // after the deploy but before a column that the current Prisma
  // client assumes). Raw UPDATE touches only the two columns we care
  // about.
  console.log('Writing...');
  for (const t of touches) {
    const table = t.kind === 'Property' ? '"Property"' : '"Lead"';
    if (t.after.city && t.after.street) {
      await prisma.$executeRawUnsafe(
        `UPDATE ${table} SET "city" = $1, "street" = $2 WHERE "id" = $3`,
        t.after.city, t.after.street, t.id,
      );
    } else if (t.after.city) {
      await prisma.$executeRawUnsafe(
        `UPDATE ${table} SET "city" = $1 WHERE "id" = $2`,
        t.after.city, t.id,
      );
    } else if (t.after.street) {
      await prisma.$executeRawUnsafe(
        `UPDATE ${table} SET "street" = $1 WHERE "id" = $2`,
        t.after.street, t.id,
      );
    }
  }
  console.log(`Done. Updated ${touches.length} rows.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
