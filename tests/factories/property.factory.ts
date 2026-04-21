import { faker } from '@faker-js/faker';
import { PrismaClient, AssetClass, PropertyCategory } from '@prisma/client';

interface PropertyFactoryInput {
  agentId: string;
  assetClass?: AssetClass;
  category?: PropertyCategory;
  street?: string;
  city?: string;
  marketingPrice?: number;
  sqm?: number;
  rooms?: number;
  owner?: string;
  ownerPhone?: string;
}

export async function createProperty(prisma: PrismaClient, input: PropertyFactoryInput) {
  return prisma.property.create({
    data: {
      agentId: input.agentId,
      assetClass: input.assetClass ?? AssetClass.RESIDENTIAL,
      category: input.category ?? PropertyCategory.SALE,
      type: 'דירה',
      street: input.street ?? faker.location.street(),
      city: input.city ?? faker.location.city(),
      owner: input.owner ?? faker.person.fullName(),
      ownerPhone: input.ownerPhone ?? `05${faker.string.numeric(8)}`,
      marketingPrice: input.marketingPrice ?? faker.number.int({ min: 1_500_000, max: 5_000_000 }),
      sqm: input.sqm ?? faker.number.int({ min: 40, max: 220 }),
      rooms: input.rooms ?? faker.number.int({ min: 2, max: 6 }),
    },
  });
}
