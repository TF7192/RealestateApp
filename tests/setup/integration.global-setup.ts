import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Global setup for integration tests.
 *
 * Contract: a Postgres DB is available at DATABASE_URL. Locally this is
 * typically a Docker container spun up by `docker compose -f
 * docker-compose.test.yml up -d`. In CI it's a service container defined
 * in the workflow.
 *
 * We run a full migrate on start so the schema matches production's
 * migration chain exactly — no `prisma db push` shortcuts, which would
 * hide migration bugs.
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Integration tests require DATABASE_URL pointing at a disposable Postgres. ' +
      'Locally: `docker compose -f docker-compose.test.yml up -d` then export ' +
      'DATABASE_URL="postgresql://estia:estia@localhost:54329/estia_test"'
    );
  }
  if (!process.env.DATABASE_URL.includes('test')) {
    throw new Error(
      `Refusing to run integration tests against non-test DB: ${process.env.DATABASE_URL}. ` +
      'The database name must contain "test" — this is a safety guardrail.'
    );
  }

  // Run migrations so the schema matches production.
  try {
    execSync('npx prisma migrate deploy', {
      cwd: new URL('../../backend/', import.meta.url),
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[integration globalSetup] prisma migrate deploy failed', err);
    throw err;
  }

  // Verify connectivity + wipe any leftover rows from previous runs.
  // TRUNCATE with RESTART IDENTITY keeps the schema but clears data in
  // the right order (FK-safe via CASCADE).
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('_prisma_migrations')
    `;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }

  return async () => {
    // Global teardown — no-op for now. The test DB is owned by the
    // harness; Docker compose handles destruction.
  };
}
