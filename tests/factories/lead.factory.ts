import { faker } from '@faker-js/faker';
import { PrismaClient, LeadStatus, LeadInterestType, LeadLookingFor } from '@prisma/client';

interface LeadFactoryInput {
  agentId: string;
  name?: string;
  phone?: string;
  city?: string;
  status?: LeadStatus;
  interestType?: LeadInterestType;
  lookingFor?: LeadLookingFor;
  lastContact?: Date | null;
  notes?: string | null;
}

/** Israeli-shaped phone: starts 05, total 10 digits. */
function ilMobile(): string {
  const suffix = faker.string.numeric(8);
  return `05${suffix}`;
}

export async function createLead(prisma: PrismaClient, input: LeadFactoryInput) {
  return prisma.lead.create({
    data: {
      agentId: input.agentId,
      name: input.name ?? faker.person.fullName(),
      phone: input.phone ?? ilMobile(),
      city: input.city ?? faker.location.city(),
      status: input.status ?? LeadStatus.WARM,
      interestType: input.interestType ?? LeadInterestType.PRIVATE,
      lookingFor: input.lookingFor ?? LeadLookingFor.BUY,
      lastContact: input.lastContact ?? null,
      notes: input.notes ?? null,
    },
  });
}
