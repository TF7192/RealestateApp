import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

interface OwnerFactoryInput {
  agentId: string;
  name?: string;
  phone?: string;
  email?: string | null;
  notes?: string | null;
  relationship?: string | null;
}

/** Israeli-shaped phone: starts 05, total 10 digits. */
function ilMobile(): string {
  return `05${faker.string.numeric(8)}`;
}

export async function createOwner(prisma: PrismaClient, input: OwnerFactoryInput) {
  return prisma.owner.create({
    data: {
      agentId: input.agentId,
      name: input.name ?? faker.person.fullName(),
      phone: input.phone ?? ilMobile(),
      email: input.email === undefined ? faker.internet.email().toLowerCase() : input.email,
      notes: input.notes ?? null,
      relationship: input.relationship ?? null,
    },
  });
}
