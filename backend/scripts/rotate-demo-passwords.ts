// SEC-038 — one-shot rotation for the six demo accounts whose
// passwords leaked via the public seed script.
//
// SEQUENCING (read this before running):
//   1. Deploy the SEC-038 fix first. The container CMD must no longer
//      run `npx tsx prisma/seed.ts`, and the seed script itself must
//      contain the NODE_ENV=production guard. If you run this rotation
//      before the deploy lands, the next container start will reseed
//      the same hardcoded passwords and undo the rotation.
//   2. Then run, on a host with DATABASE_URL pointed at production:
//        ESTIA_ROTATE_CONFIRM=I_CONFIRM npm run db:rotate-demo-passwords
//      The opt-in env var exists so a stray invocation (typo,
//      autocomplete, history-up-arrow) cannot quietly invalidate every
//      demo login. The script never deletes user rows — historical
//      data references (deals, properties, leads) keep working — only
//      passwordHash is overwritten with a 96-hex-char random string
//      that nobody will ever know.
//   3. After the script reports rotated/not-found per row, the demo
//      accounts can no longer be logged into via /api/auth/login. If
//      you need a fresh demo, create a new account through the normal
//      signup flow.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const DEMO_EMAILS = [
  'agent.demo@estia.app',
  'customer.demo@estia.app',
  'office.demo@estia.app',
  'sara.team@estia.app',
  'amit.team@estia.app',
  'maya.team@estia.app',
] as const;

async function main(): Promise<void> {
  if (process.env.ESTIA_ROTATE_CONFIRM !== 'I_CONFIRM') {
    console.error(
      '[rotate-demo-passwords] refusing to run — set ESTIA_ROTATE_CONFIRM=I_CONFIRM to proceed (SEC-038).',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    for (const email of DEMO_EMAILS) {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!existing) {
        console.log(`[rotate-demo-passwords] ${email}: not found`);
        continue;
      }
      // 48 random bytes → 96 hex chars. argon2 hashes the random string
      // so the password store stays in the same shape the rest of the
      // app expects; nobody (including this process after exit) ever
      // knows the plaintext.
      const newPlain = randomBytes(48).toString('hex');
      const hash = await argon2.hash(newPlain);
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hash } });
      console.log(`[rotate-demo-passwords] ${email}: rotated`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[rotate-demo-passwords] failed:', err);
  process.exit(1);
});
