import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 seeding…');

  // Geography
  const cities = [
    { name: 'רמלה', lat: 31.928, lng: 34.862 },
    { name: 'באר יעקב', lat: 31.943, lng: 34.835 },
    { name: 'ראשון לציון', lat: 31.964, lng: 34.804 },
    { name: 'לוד', lat: 31.951, lng: 34.895 },
    { name: 'רחובות', lat: 31.894, lng: 34.810 },
    { name: 'נס ציונה', lat: 31.929, lng: 34.798 },
  ];
  for (const c of cities) {
    await prisma.cityLookup.upsert({
      where: { name: c.name },
      create: c,
      update: c,
    });
  }
  const streets = [
    { name: 'הרצל', city: 'רמלה', lat: 31.927, lng: 34.866 },
    { name: 'איינשטיין', city: 'רמלה', lat: 31.929, lng: 34.864 },
    { name: 'שלמה המלך', city: 'רמלה', lat: 31.926, lng: 34.858 },
    { name: 'בן גוריון', city: 'רמלה', lat: 31.930, lng: 34.860 },
    { name: 'ויצמן', city: 'רמלה', lat: 31.925, lng: 34.861 },
    { name: 'ז׳בוטינסקי', city: 'רמלה', lat: 31.931, lng: 34.863 },
    { name: 'דני מס', city: 'רמלה', lat: 31.924, lng: 34.859 },
    { name: 'הרצל', city: 'באר יעקב', lat: 31.944, lng: 34.838 },
    { name: 'השקד', city: 'באר יעקב', lat: 31.941, lng: 34.832 },
    { name: 'הדקל', city: 'באר יעקב', lat: 31.942, lng: 34.836 },
    { name: 'הברוש', city: 'באר יעקב', lat: 31.945, lng: 34.834 },
    { name: 'ויצמן', city: 'ראשון לציון', lat: 31.966, lng: 34.806 },
    { name: 'רוטשילד', city: 'ראשון לציון', lat: 31.963, lng: 34.792 },
    { name: 'הרצל', city: 'ראשון לציון', lat: 31.965, lng: 34.800 },
    { name: 'סוקולוב', city: 'ראשון לציון', lat: 31.968, lng: 34.802 },
    { name: 'ז׳בוטינסקי', city: 'ראשון לציון', lat: 31.960, lng: 34.808 },
    { name: 'דיזנגוף', city: 'ראשון לציון', lat: 31.962, lng: 34.798 },
    { name: 'התעשייה', city: 'לוד', lat: 31.952, lng: 34.898 },
    { name: 'הרצל', city: 'לוד', lat: 31.950, lng: 34.893 },
  ];
  for (const s of streets) {
    await prisma.streetLookup.upsert({
      where: { name_city: { name: s.name, city: s.city } },
      create: s,
      update: s,
    });
  }

  // Demo agent
  const agentEmail = 'agent.demo@estia.app';
  const agentPassword = 'estia-demo-1234';
  const agent = await prisma.user.upsert({
    where: { email: agentEmail },
    update: {},
    create: {
      email: agentEmail,
      passwordHash: await argon2.hash(agentPassword),
      role: 'AGENT',
      displayName: 'יוסי כהן',
      phone: '050-1234567',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
      agentProfile: {
        create: {
          agency: 'רימקס פרמיום',
          title: 'סוכן נדל״ן בכיר',
          license: '12345',
          bio: 'מעל 12 שנות ניסיון בתיווך נדל״ן באזור רמלה, באר יעקב וראשון לציון. מלווה לקוחות פרטיים ומסחריים משלב החיפוש ועד למסירת המפתח — בגישה שקופה, זמינות מלאה וליווי אישי.',
        },
      },
    },
  });
  console.log(`✓ agent ${agentEmail} / ${agentPassword}`);

  // Demo customer
  const customerEmail = 'customer.demo@estia.app';
  const customerPassword = 'estia-demo-1234';
  await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      email: customerEmail,
      passwordHash: await argon2.hash(customerPassword),
      role: 'CUSTOMER',
      displayName: 'רינה שמעון',
      phone: '052-4445566',
      customerProfile: { create: {} },
    },
  });
  console.log(`✓ customer ${customerEmail} / ${customerPassword}`);

  // Demo properties
  const agentId = agent.id;
  const existingCount = await prisma.property.count({ where: { agentId } });
  if (existingCount > 0) {
    console.log('✓ properties already seeded');
    await prisma.$disconnect();
    return;
  }

  const ACTION_KEYS = [
    'tabuExtract', 'photography', 'buildingPhoto', 'dronePhoto', 'virtualTour',
    'sign', 'iList', 'yad2', 'facebook', 'marketplace', 'onMap', 'madlan',
    'whatsappGroup', 'officeWhatsapp', 'externalCoop', 'video', 'neighborLetters',
    'coupons', 'flyers', 'newspaper', 'agentTour', 'openHouse',
  ];

  const sampleProps = [
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'דירה',
      street: 'איינשטיין 12', city: 'רמלה', lat: 31.929, lng: 34.864,
      owner: 'אנה כהן', ownerPhone: '050-1234567',
      marketingPrice: 1350000, sqm: 84, rooms: 4, floor: 7, totalFloors: 12,
      elevator: true, renovated: 'שמורה', vacancyDate: '8 חודשים',
      parking: true, storage: true, balconySize: 12, airDirections: 'דרום-מערב',
      ac: true, safeRoom: true, buildingAge: 15, sector: 'כללי',
      notes: 'דירה מרווחת עם נוף פתוח, מטבח משודרג',
      images: [
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
      ],
      completedKeys: ['tabuExtract','photography','buildingPhoto','sign','iList','yad2','facebook','marketplace','onMap'],
    },
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'דירה',
      street: 'שלמה המלך 55', city: 'רמלה', lat: 31.926, lng: 34.858,
      owner: 'שרית לוי', ownerPhone: '052-9876543',
      marketingPrice: 1580000, sqm: 95, rooms: 4.5, floor: 3, totalFloors: 8,
      elevator: true, renovated: 'משופצת', vacancyDate: 'מיידי',
      parking: true, storage: false, balconySize: 14, airDirections: 'מזרח',
      ac: true, safeRoom: true, buildingAge: 8, sector: 'כללי',
      notes: 'דירה משופצת ברמה גבוהה, קרובה למרכז',
      images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80'],
      completedKeys: ACTION_KEYS.slice(0, 18),
    },
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'פנטהאוז',
      street: 'הרצל 28', city: 'באר יעקב', lat: 31.944, lng: 34.838,
      owner: 'יעקב מזרחי', ownerPhone: '054-5551234',
      marketingPrice: 2850000, sqm: 140, rooms: 5, floor: 10, totalFloors: 10,
      elevator: true, renovated: 'חדש מקבלן', vacancyDate: '3 חודשים',
      parking: true, storage: true, balconySize: 40, airDirections: 'כל הכיוונים',
      ac: true, safeRoom: true, buildingAge: 0, sector: 'כללי',
      notes: 'פנטהאוז עם נוף פנורמי, גג פרטי 60 מ״ר',
      images: [
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
      ],
      completedKeys: ACTION_KEYS.slice(0, 21),
    },
    {
      assetClass: 'RESIDENTIAL', category: 'RENT', type: 'דירה',
      street: 'בן גוריון 15', city: 'רמלה', lat: 31.930, lng: 34.860,
      owner: 'מיכל ברק', ownerPhone: '053-4445566',
      marketingPrice: 4500, sqm: 70, rooms: 3, floor: 2, totalFloors: 5,
      elevator: false, renovated: 'משופצת', vacancyDate: 'מיידי',
      parking: false, storage: false, balconySize: 8, airDirections: 'דרום',
      ac: true, safeRoom: false, buildingAge: 30, sector: 'כללי',
      notes: 'להשכרה בלבד, דירה מתוחזקת היטב',
      images: ['https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80'],
      completedKeys: ['photography','buildingPhoto','sign','iList','yad2','facebook','marketplace','officeWhatsapp'],
    },
    {
      assetClass: 'COMMERCIAL', category: 'SALE', type: 'משרד',
      street: 'הרצל 40', city: 'רמלה', lat: 31.927, lng: 34.866,
      owner: 'אלי נחמני', ownerPhone: '050-8881234',
      marketingPrice: 980000, sqm: 120, sqmArnona: 120, rooms: null, floor: 2, totalFloors: 4,
      elevator: true, renovated: 'משופץ', vacancyDate: 'מיידי',
      parking: true, storage: false, balconySize: 0, airDirections: 'מערב',
      ac: true, safeRoom: false, buildingAge: 10, sector: 'כללי',
      notes: 'משרד ייצוגי במרכז העיר, מתאים לעו״ד / רו״ח',
      images: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80'],
      completedKeys: ['tabuExtract','photography','buildingPhoto','sign','iList','yad2','facebook','onMap','officeWhatsapp','externalCoop'],
    },
    {
      assetClass: 'COMMERCIAL', category: 'RENT', type: 'חנות',
      street: 'סוקולוב 12', city: 'ראשון לציון', lat: 31.968, lng: 34.802,
      owner: 'מרים דגן', ownerPhone: '052-3339988',
      marketingPrice: 12000, sqm: 65, sqmArnona: 65, rooms: null, floor: 0, totalFloors: 3,
      elevator: false, renovated: 'שמור', vacancyDate: 'מיידי',
      parking: false, storage: true, balconySize: 0, airDirections: null,
      ac: true, safeRoom: false, buildingAge: 25, sector: 'כללי',
      notes: 'חנות ברחוב מרכזי, חזית רחבה',
      images: ['https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=80'],
      completedKeys: ['photography','buildingPhoto','sign','yad2','facebook','marketplace','officeWhatsapp'],
    },
  ];

  for (const p of sampleProps) {
    const { images, completedKeys, ...rest } = p as any;
    const created = await prisma.property.create({
      data: {
        agentId,
        ...rest,
        exclusiveStart: new Date('2025-02-01'),
        exclusiveEnd: new Date('2025-10-01'),
        marketingActions: {
          create: ACTION_KEYS.map((key) => ({
            actionKey: key,
            done: completedKeys.includes(key),
            doneAt: completedKeys.includes(key) ? new Date() : null,
          })),
        },
        images: { create: images.map((url: string, i: number) => ({ url, sortOrder: i })) },
      },
    });
    console.log(`✓ property ${created.street}, ${created.city}`);
  }

  // Leads
  const leads = [
    {
      name: 'אבי גולדשטיין', phone: '050-1112233', interestType: 'PRIVATE' as const,
      lookingFor: 'BUY' as const, city: 'רמלה', rooms: '4-5',
      priceRangeLabel: '1,200,000 - 1,600,000', budget: 1600000, preApproval: true,
      sector: 'כללי', balconyRequired: true, schoolProximity: 'עד 500 מטר',
      brokerageSignedAt: new Date('2025-04-02'),
      brokerageExpiresAt: new Date('2025-10-02'),
      notes: 'מחפש דירה קרובה לבתי ספר, גמיש במחיר',
      source: 'פייסבוק', status: 'HOT' as const,
      lastContact: new Date('2025-04-12'),
    },
    {
      name: 'רינה שמעון', phone: '052-4445566', interestType: 'PRIVATE' as const,
      lookingFor: 'BUY' as const, city: 'באר יעקב', rooms: '5+',
      priceRangeLabel: '2,500,000 - 3,500,000', budget: 3500000, preApproval: true,
      sector: 'כללי', balconyRequired: true, schoolProximity: 'הליכה',
      brokerageSignedAt: new Date('2025-03-22'),
      brokerageExpiresAt: new Date('2025-09-22'),
      notes: 'משפחה עם 4 ילדים, מחפשת קוטג׳ או פנטהאוז',
      source: 'הפניה', status: 'HOT' as const,
      lastContact: new Date('2025-04-14'),
    },
    {
      name: 'סיגל כהן', phone: '050-3334455', interestType: 'PRIVATE' as const,
      lookingFor: 'RENT' as const, city: 'רמלה', rooms: '3',
      priceRangeLabel: '3,500 - 5,000 ₪/חודש', budget: 5000, preApproval: false,
      sector: 'כללי', notes: 'מחפשת להשכרה, סטודנטית', source: 'אתר', status: 'WARM' as const,
      brokerageSignedAt: new Date('2025-04-08'),
      brokerageExpiresAt: new Date('2025-10-08'),
      lastContact: new Date('2025-04-08'),
    },
    {
      name: 'יוסי פרץ', phone: '058-9990011', interestType: 'COMMERCIAL' as const,
      lookingFor: 'BUY' as const, city: 'רמלה', street: 'הרצל',
      priceRangeLabel: '800,000 - 1,200,000', budget: 1200000, preApproval: true,
      sector: 'כללי', notes: 'מחפש משרד או חנות באזור המרכז',
      source: 'סיור סוכנים', status: 'COLD' as const,
      brokerageSignedAt: new Date('2025-03-11'),
      brokerageExpiresAt: new Date('2025-09-11'),
      lastContact: new Date('2025-03-25'),
    },
    {
      name: 'נועה אלון', phone: '052-1231234', interestType: 'PRIVATE' as const,
      lookingFor: 'BUY' as const, city: 'באר יעקב', rooms: '4',
      priceRangeLabel: '1,500,000 - 2,000,000', budget: 2000000, preApproval: true,
      sector: 'כללי', balconyRequired: true, schoolProximity: 'עד ק״מ',
      notes: 'גרושה עם 2 ילדים, צריכה ממ״ד', source: 'הפניה מלקוח', status: 'HOT' as const,
      brokerageSignedAt: new Date('2025-04-11'),
      brokerageExpiresAt: new Date('2025-10-11'),
      lastContact: new Date('2025-04-15'),
    },
    {
      name: 'אופיר לביא', phone: '053-4567890', interestType: 'COMMERCIAL' as const,
      lookingFor: 'RENT' as const, city: 'לוד', street: 'התעשייה',
      priceRangeLabel: '6,000 - 9,000 ₪/חודש', budget: 9000, preApproval: false,
      sector: 'כללי', notes: 'מחפש מחסן להפעלת עסק קטן',
      source: 'יד 2', status: 'WARM' as const,
      brokerageSignedAt: new Date('2025-04-02'),
      brokerageExpiresAt: new Date('2025-10-02'),
      lastContact: new Date('2025-04-13'),
    },
  ];
  for (const l of leads) {
    await prisma.lead.create({ data: { agentId, ...l } });
  }
  console.log(`✓ seeded ${leads.length} leads`);

  // Deals
  const deals = [
    { propertyStreet: 'איינשטיין 12', city: 'רמלה', assetClass: 'RESIDENTIAL' as const, category: 'SALE' as const, status: 'NEGOTIATING' as const, marketingPrice: 1350000, offer: 1325000, buyerAgent: 'עצמי', sellerAgent: 'עצמי', lawyer: 'עו״ד רחל גפן' },
    { propertyStreet: 'השקד 22', city: 'באר יעקב', assetClass: 'RESIDENTIAL' as const, category: 'SALE' as const, status: 'WAITING_MORTGAGE' as const, marketingPrice: 3200000, offer: 3100000, buyerAgent: 'עצמי', sellerAgent: 'עצמי', lawyer: 'עו״ד דני שלום' },
    { propertyStreet: 'העצמאות 44', city: 'רמלה', assetClass: 'RESIDENTIAL' as const, category: 'SALE' as const, status: 'SIGNED' as const, marketingPrice: 1100000, offer: 1050000, closedPrice: 1075000, commission: 21500, buyerAgent: 'מוטי - רימקס גולד', sellerAgent: 'עצמי', lawyer: 'עו״ד מיכל אור', signedAt: new Date('2025-03-28') },
    { propertyStreet: 'ויצמן 8', city: 'ראשון לציון', assetClass: 'RESIDENTIAL' as const, category: 'RENT' as const, status: 'SIGNED' as const, marketingPrice: 7200, offer: 7000, closedPrice: 7100, commission: 7100, buyerAgent: 'עצמי', sellerAgent: 'עצמי', lawyer: '—', signedAt: new Date('2025-02-12') },
    { propertyStreet: 'סוקולוב 12', city: 'ראשון לציון', assetClass: 'COMMERCIAL' as const, category: 'RENT' as const, status: 'SIGNED' as const, marketingPrice: 12000, offer: 11500, closedPrice: 11800, commission: 11800, buyerAgent: 'עצמי', sellerAgent: 'עצמי', lawyer: 'עו״ד נעם ברעם', signedAt: new Date('2025-03-03') },
    { propertyStreet: 'הרצל 40', city: 'רמלה', assetClass: 'COMMERCIAL' as const, category: 'SALE' as const, status: 'NEGOTIATING' as const, marketingPrice: 980000, offer: 950000, buyerAgent: 'עצמי', sellerAgent: 'עצמי', lawyer: 'עו״ד חן יצחק' },
  ];
  for (const d of deals) {
    await prisma.deal.create({ data: { agentId, ...d } });
  }
  console.log(`✓ seeded ${deals.length} deals`);
  console.log('🌱 done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
