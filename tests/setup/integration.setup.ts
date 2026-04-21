import { beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

// Deterministic faker output → deterministic test data → diagnosable flakes.
faker.seed(1234);

// Per-test truncate. Transaction rollback would be faster, but Prisma's
// interactive-transaction hooks don't compose cleanly with Fastify
// handlers calling the singleton `prisma` client. Truncate is ~3-5ms on
// an empty schema; fine for the expected suite size (<200 integration
// tests).
//
// The table list is discovered from the DB once per run, so adding a
// model to schema.prisma doesn't require touching this file.
const prisma = new PrismaClient();
let truncateSQL = '';

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations')
  `;
  if (!tables.length) {
    throw new Error(
      'Integration setup found no application tables. Did prisma migrate deploy run against this DB?'
    );
  }
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  truncateSQL = `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(truncateSQL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
