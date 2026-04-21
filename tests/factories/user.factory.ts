import { faker } from '@faker-js/faker';
import argon2 from 'argon2';
import { PrismaClient, type User, UserRole, AuthProvider } from '@prisma/client';

export interface UserFactoryInput {
  email?: string;
  displayName?: string;
  role?: UserRole;
  // Plain password; defaults to 'Password1!' (also the seeded demo pw).
  // Hashed before insert so the login endpoint can verify normally.
  password?: string;
}

/**
 * Creates a real User row. Uses the same argon2 hashing as the signup
 * endpoint so tests can exercise the real login flow end-to-end.
 *
 * ALWAYS prefer this over hand-inserting users — if the User schema
 * changes, the factory updates in one place and every test picks it up.
 */
export async function createUser(
  prisma: PrismaClient,
  input: UserFactoryInput = {}
): Promise<User & { _plainPassword: string }> {
  const plainPassword = input.password ?? 'Password1!';
  const passwordHash = await argon2.hash(plainPassword);
  const role = input.role ?? UserRole.AGENT;
  const displayName = input.displayName ?? faker.person.fullName();
  // Unique slug per user — prod uses buildAgentSlug; tests don't care
  // about collision hygiene so a faker-driven random suffix is fine.
  const slug = role === UserRole.AGENT
    ? `agent-${faker.string.alphanumeric(8).toLowerCase()}`
    : null;
  const user = await prisma.user.create({
    data: {
      email: input.email ?? faker.internet.email().toLowerCase(),
      displayName,
      role,
      provider: AuthProvider.EMAIL,
      passwordHash,
      slug,
      agentProfile:    role === UserRole.AGENT    ? { create: {} } : undefined,
      customerProfile: role === UserRole.CUSTOMER ? { create: {} } : undefined,
    },
  });
  return Object.assign(user, { _plainPassword: plainPassword });
}

export const createAgent = (prisma: PrismaClient, input: UserFactoryInput = {}) =>
  createUser(prisma, { ...input, role: UserRole.AGENT });

export const createCustomer = (prisma: PrismaClient, input: UserFactoryInput = {}) =>
  createUser(prisma, { ...input, role: UserRole.CUSTOMER });
