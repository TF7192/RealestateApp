import { beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

// Deterministic faker output → deterministic test data → diagnosable flakes.
faker.seed(1234);

// Per-test truncate. Transaction rollback would be faster, but Prisma's
// interactive-transaction hooks don't compose cleanly with Fastify
// handlers calling the singleton `prisma` client. Truncate is ~3-5ms on
// an empty schema; fine for the expected suite size (<200 integration
// tests).
const prisma = new PrismaClient();
const TRUNCATE_ORDER = [
  // Dependents first.
  'PropertyImage', 'PropertyVideo', 'MarketingAction', 'PropertyOwnership',
  'Message', 'Conversation',
  'CalendarConnection', 'Meeting',
  'TransferRequest', 'Agreement',
  'ProspectSignature',
  'Yad2ImportAttempt',
  'Deal', 'Lead', 'Property', 'Owner',
  'Template',
  'Session',
  'User',
];

beforeEach(async () => {
  // We wrap the TRUNCATE in a single statement so it's atomic +
  // FK-safe. Any table missing from TRUNCATE_ORDER gets picked up by
  // the CASCADE but reset-identity won't fire on it — so keep the
  // list current when the schema grows.
  const safe = TRUNCATE_ORDER
    .map((t) => `"public"."${t}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${safe} RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
