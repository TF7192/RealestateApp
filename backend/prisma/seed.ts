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

  // Demo properties for the original יוסי כהן agent. Guarded so re-
  // runs skip straight to the office-demo block below instead of
  // returning early (the previous `return` would skip the demo-office
  // seed on every subsequent run).
  const agentId = agent.id;
  const existingCount = await prisma.property.count({ where: { agentId } });
  const shouldSeedSoloProperties = existingCount === 0;
  if (!shouldSeedSoloProperties) {
    console.log('✓ solo agent properties already seeded — skipping to office demo');
  }
  if (shouldSeedSoloProperties) {

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
  } // end `if (shouldSeedSoloProperties)`

  // ─── Demo office + team (for client walkthroughs) ───────────────
  //
  // One OWNER (the manager) + three AGENTs all pointing at a single
  // Office row, plus a spread of properties and signed / in-progress
  // deals per agent so the /team scoreboard is populated and the
  // Deals kanban has realistic volume. Everything upserts so re-
  // running the seed is idempotent.
  const OFFICE_NAME = 'Estia Demo Brokerage';
  const managerEmail = 'office.demo@estia.app';
  const managerPassword = 'EstiaDemo1!';

  // Upsert the office (anchored on name so this stays idempotent).
  const office = await prisma.office.upsert({
    where: { id: 'demo-office-cuid-anchor' }, // unstable — we branch below
    update: { name: OFFICE_NAME },
    create: { name: OFFICE_NAME, phone: '03-555-0100', address: 'רוטשילד 12, תל אביב' },
  }).catch(async () => {
    const existing = await prisma.office.findFirst({ where: { name: OFFICE_NAME } });
    if (existing) return existing;
    return prisma.office.create({
      data: { name: OFFICE_NAME, phone: '03-555-0100', address: 'רוטשילד 12, תל אביב' },
    });
  });

  // Office manager — OWNER role, attached to the office.
  const manager = await prisma.user.upsert({
    where: { email: managerEmail },
    update: { role: 'OWNER', officeId: office.id, isPremium: true },
    create: {
      email: managerEmail,
      passwordHash: await argon2.hash(managerPassword),
      role: 'OWNER',
      officeId: office.id,
      displayName: 'דנה לוי',
      phone: '050-5550100',
      isPremium: true,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80',
      agentProfile: {
        create: {
          agency: OFFICE_NAME,
          title: 'מנהלת משרד',
          license: '45678',
          bio: 'מנהלת משרד ותיקה עם מעל עשור של ליווי סוכנים, פיתוח עסקי וסגירת עסקאות בתל אביב והמרכז.',
        },
      },
    },
  });
  console.log(`✓ office manager ${managerEmail} / ${managerPassword}`);

  // Three team agents. Each gets a distinct display name, avatar,
  // license, and is attached to the same office.
  const teamAgentsSeed = [
    { email: 'sara.team@estia.app',  name: 'שרה דוד',   phone: '050-5550201', license: '51201', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80' },
    { email: 'amit.team@estia.app',  name: 'עמית כהן',  phone: '050-5550202', license: '51202', avatar: 'https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=400&q=80' },
    { email: 'maya.team@estia.app',  name: 'מאיה ברק',  phone: '050-5550203', license: '51203', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80' },
  ];
  const teamAgents = [] as { id: string; name: string }[];
  for (const t of teamAgentsSeed) {
    const agentRow = await prisma.user.upsert({
      where: { email: t.email },
      update: { officeId: office.id, isPremium: false },
      create: {
        email: t.email,
        passwordHash: await argon2.hash(managerPassword),
        role: 'AGENT',
        officeId: office.id,
        displayName: t.name,
        phone: t.phone,
        isPremium: false,
        avatarUrl: t.avatar,
        agentProfile: {
          create: {
            agency: OFFICE_NAME,
            title: 'סוכנ/ית נדל״ן',
            license: t.license,
            bio: 'חלק מצוות ' + OFFICE_NAME + '.',
          },
        },
      },
    });
    teamAgents.push({ id: agentRow.id, name: t.name });
  }

  // Per-agent pipeline: a blend of signed deals (Q2-2026) + in-
  // progress ones so the /team scoreboard + Deals kanban look busy.
  // Signed totals (closedPrice / commission) drive the scoreboard's
  // volume and commission columns.
  const q2Start = new Date('2026-04-01');
  const demoPipelines: Array<{
    agentIdx: number;
    rows: Array<{ street: string; city: string; status: 'SIGNED'|'NEGOTIATING'|'WAITING_MORTGAGE'|'PENDING_CONTRACT'; price: number; closed?: number; commission?: number; signedAt?: Date; category?: 'SALE'|'RENT' }>;
  }> = [
    {
      agentIdx: 0, // שרה — top performer
      rows: [
        { street: 'רוטשילד 112', city: 'תל אביב',       status: 'SIGNED', price: 4_900_000, closed: 4_800_000, commission: 96_000,  signedAt: new Date('2026-04-03') },
        { street: 'בן גוריון 85', city: 'תל אביב',      status: 'SIGNED', price: 6_300_000, closed: 6_150_000, commission: 123_000, signedAt: new Date('2026-04-11') },
        { street: 'דיזנגוף 220',  city: 'תל אביב',      status: 'SIGNED', price: 3_450_000, closed: 3_400_000, commission: 68_000,  signedAt: new Date('2026-04-19') },
        { street: 'אחד העם 9',    city: 'תל אביב',      status: 'NEGOTIATING',     price: 2_950_000 },
        { street: 'הרצל 50',      city: 'רמת גן',      status: 'PENDING_CONTRACT', price: 4_200_000 },
      ],
    },
    {
      agentIdx: 1, // עמית — mid-pack
      rows: [
        { street: 'סוקולוב 45',   city: 'רמת גן',      status: 'SIGNED', price: 2_450_000, closed: 2_400_000, commission: 48_000, signedAt: new Date('2026-04-07') },
        { street: 'ביאליק 20',    city: 'רמת גן',      status: 'SIGNED', price: 3_150_000, closed: 3_050_000, commission: 61_000, signedAt: new Date('2026-04-15') },
        { street: 'ז׳בוטינסקי 8', city: 'גבעתיים',     status: 'WAITING_MORTGAGE', price: 3_800_000, commission: 76_000 },
        { street: 'קפלן 14',      city: 'תל אביב',     status: 'NEGOTIATING',      price: 5_400_000 },
      ],
    },
    {
      agentIdx: 2, // מאיה — rentals-heavy
      rows: [
        { street: 'הירקון 280',   city: 'תל אביב',     status: 'SIGNED', price: 9_500,  closed: 9_200,  commission: 9_200, signedAt: new Date('2026-04-05'), category: 'RENT' },
        { street: 'אבן גבירול 70',city: 'תל אביב',     status: 'SIGNED', price: 11_500, closed: 11_200, commission: 11_200, signedAt: new Date('2026-04-12'), category: 'RENT' },
        { street: 'לה גרדיה 12',  city: 'תל אביב',     status: 'SIGNED', price: 2_100_000, closed: 2_050_000, commission: 41_000, signedAt: new Date('2026-04-20') },
        { street: 'שינקין 30',    city: 'תל אביב',     status: 'NEGOTIATING', price: 8_500, category: 'RENT' },
      ],
    },
  ];

  // Wipe out stale demo deals + properties so the seed remains
  // idempotent for the team agents. Keyed on the agent ids we just
  // created, scoped so we never touch the יוסי כהן demo data.
  const teamAgentIds = teamAgents.map((a) => a.id);
  await prisma.deal.deleteMany({ where: { agentId: { in: teamAgentIds } } });
  await prisma.property.deleteMany({ where: { agentId: { in: teamAgentIds } } });

  // Collect each team agent's freshly-created properties by street so
  // the transfer block below can target real property rows.
  const teamPropertyIds: Record<string, string> = {};

  for (const lane of demoPipelines) {
    const agent = teamAgents[lane.agentIdx];
    for (const r of lane.rows) {
      // Mirror each deal with a matching property so /properties
      // shows the team's inventory on any agent login.
      const createdProp = await prisma.property.create({
        data: {
          agentId: agent.id,
          owner: 'בעל פרטי',
          ownerPhone: '050-0000000',
          street: r.street,
          city: r.city,
          assetClass: 'RESIDENTIAL',
          category: r.category === 'RENT' ? 'RENT' : 'SALE',
          type: r.category === 'RENT' ? 'דירה להשכרה' : 'דירה',
          marketingPrice: r.price,
          sqm: r.category === 'RENT' ? 80 : 110,
          rooms: 4,
          floor: 3,
          totalFloors: 8,
          status: r.status === 'SIGNED' ? 'SOLD' : 'ACTIVE',
          notes: null,
        },
      });
      teamPropertyIds[`${agent.id}::${r.street}`] = createdProp.id;
      await prisma.deal.create({
        data: {
          agentId: agent.id,
          propertyStreet: r.street,
          city: r.city,
          assetClass: 'RESIDENTIAL',
          category: r.category === 'RENT' ? 'RENT' : 'SALE',
          status: r.status,
          marketingPrice: r.price,
          offer: Math.round(r.price * 0.97),
          closedPrice: r.closed ?? null,
          commission: r.commission ?? null,
          buyerAgent: 'עצמי',
          sellerAgent: 'עצמי',
          lawyer: 'עו״ד ' + agent.name.split(' ')[0],
          signedAt: r.signedAt ?? null,
          updateDate: r.signedAt ?? q2Start,
        },
      });
    }
  }
  console.log(`✓ demo office "${OFFICE_NAME}" with ${teamAgents.length} agents + pipelines`);

  // ─── Manager demo data (reminders / activity / transfers /
  // invites / Yad2 scan history) ──────────────────────────────────
  //
  // Idempotent on re-run: wipe every manager-scoped row we're about
  // to create before re-seeding, so running `db:seed` twice doesn't
  // double-up the walkthrough data. Scoped strictly to the manager
  // user id so the team agents' rows stay untouched.
  await prisma.reminder.deleteMany({ where: { agentId: manager.id } });
  await prisma.activityLog.deleteMany({
    where: { agentId: { in: [manager.id, ...teamAgentIds] } },
  });
  await prisma.propertyTransfer.deleteMany({
    where: {
      OR: [{ fromAgentId: manager.id }, { toAgentId: manager.id }],
    },
  });
  await prisma.officeInvite.deleteMany({
    where: { officeId: office.id, acceptedAt: null },
  });
  await prisma.yad2ImportAttempt.deleteMany({ where: { agentId: manager.id } });

  // Anchor "now" to the seed's runtime so dates stay relative on every
  // re-seed. Offsets are in days; negative = past, positive = future.
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const atOffset = (offsetDays: number, hour = 10, minute = 0) => {
    const d = new Date(now.getTime() + offsetDays * dayMs);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Fetch anchor entities so reminders / activity rows can deep-link
  // into real rows the manager sees on her team-scoped views. Grab
  // one of each team agent's deals + properties for variety.
  const saraProp  = await prisma.property.findFirst({
    where: { agentId: teamAgents[0].id, street: 'רוטשילד 112' },
    select: { id: true, street: true, city: true },
  });
  const amitProp  = await prisma.property.findFirst({
    where: { agentId: teamAgents[1].id, street: 'סוקולוב 45' },
    select: { id: true, street: true, city: true },
  });
  const mayaProp  = await prisma.property.findFirst({
    where: { agentId: teamAgents[2].id, street: 'לה גרדיה 12' },
    select: { id: true, street: true, city: true },
  });
  const saraDeal  = await prisma.deal.findFirst({
    where: { agentId: teamAgents[0].id, propertyStreet: 'רוטשילד 112' },
    select: { id: true },
  });
  const amitDeal  = await prisma.deal.findFirst({
    where: { agentId: teamAgents[1].id, propertyStreet: 'ז׳בוטינסקי 8' },
    select: { id: true },
  });

  // 1. Reminders — 8 diverse rows mixed across past/today/week/next-week,
  // attached to mixed entity types for realistic filter coverage.
  const reminderRows: Array<{
    title: string;
    notes?: string | null;
    dueAt: Date;
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    completedAt?: Date | null;
    propertyId?: string | null;
  }> = [
    {
      title: 'להתקשר לשרה דוד על העסקה ברוטשילד 112',
      notes: 'לסכם עם הקונה את תנאי המשכנתא ולוח הזמנים לחתימה.',
      dueAt: atOffset(-5, 11, 30),
      status: 'COMPLETED',
      completedAt: atOffset(-5, 12, 0),
      propertyId: saraProp?.id ?? null,
    },
    {
      title: 'לשלוח חוזה בלעדיות ללקוח על דיזנגוף 220',
      notes: 'לצרף את טופס גילוי נאות + נספח עמלה.',
      dueAt: atOffset(-3, 9, 0),
      status: 'COMPLETED',
      completedAt: atOffset(-3, 10, 15),
    },
    {
      title: 'פגישת צוות שבועית — סקירת עסקאות פתוחות',
      notes: 'להכין סיכום סטטוס לכל סוכן/ת ולהציג ב-Teams.',
      dueAt: atOffset(0, 15, 0),
      status: 'PENDING',
    },
    {
      title: 'להתקשר לעו״ד רחל גפן על חוזה רוטשילד 112',
      notes: 'לוודא נוסח סעיף ערבות בנקאית.',
      dueAt: atOffset(0, 17, 30),
      status: 'PENDING',
      propertyId: saraProp?.id ?? null,
    },
    {
      title: 'ביקורת שיווק — עמית כהן',
      notes: 'לעבור יחד על 3 הפרסומים הפעילים ולעדכן תוכן.',
      dueAt: atOffset(2, 10, 0),
      status: 'PENDING',
    },
    {
      title: 'פגישה עם לקוחה חדשה — דירה 4 חדרים בתל אביב',
      notes: 'רחוב בן יהודה, להכין 3 הצעות מתאימות מראש.',
      dueAt: atOffset(3, 12, 0),
      status: 'PENDING',
    },
    {
      title: 'לחדש מנוי Yad2 Pro — כל צוות המשרד',
      notes: 'לבדוק כמה סוכנים פעילים ולתאם עם חשבונות.',
      dueAt: atOffset(6, 9, 0),
      status: 'PENDING',
    },
    {
      title: 'סיכום רבעון Q2 — להכין דו״ח למנכ״ל',
      notes: 'כולל סכום עמלות, מספר עסקאות, ופיפליין.',
      dueAt: atOffset(9, 14, 0),
      status: 'PENDING',
    },
  ];
  for (const r of reminderRows) {
    await prisma.reminder.create({
      data: {
        agentId: manager.id,
        title: r.title,
        notes: r.notes ?? null,
        dueAt: r.dueAt,
        status: r.status,
        completedAt: r.completedAt ?? null,
        propertyId: r.propertyId ?? null,
      },
    });
  }

  // 2. Activity log — ~15 manager events + a couple on the team agents
  // so the team-view timeline has cross-agent context. Rows are written
  // directly to ActivityLog (same path production's logActivity() uses,
  // minus the try/catch which exists to protect user actions).
  const activityRows: Array<{
    agentId: string;
    actorId: string;
    verb: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    createdAt: Date;
  }> = [
    // Manager-scoped events — spans the last 14 days.
    { agentId: manager.id, actorId: manager.id, verb: 'invited',  entityType: 'User',     summary: 'שלחה הזמנה לסוכנ/ית חדש/ה', createdAt: atOffset(-13, 9, 30) },
    { agentId: manager.id, actorId: manager.id, verb: 'signed',   entityType: 'Contract', summary: 'חתימה על חוזה בלעדיות — רוטשילד 112', entityId: saraProp?.id ?? null, createdAt: atOffset(-12, 14, 0) },
    { agentId: manager.id, actorId: manager.id, verb: 'updated',  entityType: 'Office',   summary: 'עדכנה את פרטי המשרד (כתובת + טלפון)', entityId: office.id, createdAt: atOffset(-11, 10, 15) },
    { agentId: manager.id, actorId: manager.id, verb: 'created',  entityType: 'Reminder', summary: 'יצרה תזכורת — פגישת צוות שבועית', createdAt: atOffset(-10, 16, 0) },
    { agentId: manager.id, actorId: manager.id, verb: 'shared',   entityType: 'Property', summary: 'שיתפה נכס דיזנגוף 220 עם מאיה ברק', entityId: saraProp?.id ?? null, createdAt: atOffset(-9, 11, 20) },
    { agentId: manager.id, actorId: manager.id, verb: 'updated',  entityType: 'Deal',     summary: 'עדכנה סטטוס עסקה — ביאליק 20 → חתום', entityId: amitDeal?.id ?? null, createdAt: atOffset(-8, 13, 45) },
    { agentId: manager.id, actorId: manager.id, verb: 'imported', entityType: 'Property', summary: 'ייבאה 4 נכסים מ-Yad2', createdAt: atOffset(-7, 9, 0) },
    { agentId: manager.id, actorId: manager.id, verb: 'created',  entityType: 'Lead',     summary: 'הוסיפה ליד חדש — דירה בפרויקט חדש בת״א', createdAt: atOffset(-6, 15, 10) },
    { agentId: manager.id, actorId: manager.id, verb: 'completed',entityType: 'Reminder', summary: 'סיימה תזכורת — שליחת חוזה דיזנגוף 220', createdAt: atOffset(-3, 10, 15) },
    { agentId: manager.id, actorId: manager.id, verb: 'transferred', entityType: 'Property', summary: 'העבירה נכס אחד העם 9 לשרה דוד', entityId: saraProp?.id ?? null, createdAt: atOffset(-4, 12, 0) },
    { agentId: manager.id, actorId: manager.id, verb: 'viewed',   entityType: 'Report',   summary: 'צפתה בדוח רבעוני Q2 2026', createdAt: atOffset(-2, 9, 40) },
    { agentId: manager.id, actorId: manager.id, verb: 'created',  entityType: 'Reminder', summary: 'הוסיפה תזכורת — שיחה עם עו״ד רחל גפן', createdAt: atOffset(-1, 17, 0) },
    { agentId: manager.id, actorId: manager.id, verb: 'updated',  entityType: 'Lead',     summary: 'עדכנה פרטי ליד — נעה אלון', createdAt: atOffset(-1, 11, 25) },
    { agentId: manager.id, actorId: manager.id, verb: 'signed',   entityType: 'Contract', summary: 'חתימה דיגיטלית על חוזה תיווך — ביאליק 20', entityId: amitProp?.id ?? null, createdAt: atOffset(0, 8, 45) },
    { agentId: manager.id, actorId: manager.id, verb: 'published',entityType: 'Advert',   summary: 'פרסמה מודעה חדשה ב-Yad2 ו-Facebook', entityId: mayaProp?.id ?? null, createdAt: atOffset(0, 10, 5) },
    // Team-agent events the manager sees through the office scoreboard.
    { agentId: teamAgents[0].id, actorId: teamAgents[0].id, verb: 'signed', entityType: 'Deal', summary: 'עסקה נחתמה — דיזנגוף 220 (3.4M)', entityId: saraProp?.id ?? null, createdAt: atOffset(-2, 16, 30) },
    { agentId: teamAgents[1].id, actorId: teamAgents[1].id, verb: 'updated', entityType: 'Property', summary: 'עדכן מחיר שיווק — ז׳בוטינסקי 8', entityId: amitProp?.id ?? null, createdAt: atOffset(-1, 14, 10) },
  ];
  for (const a of activityRows) {
    await prisma.activityLog.create({
      data: {
        agentId: a.agentId,
        actorId: a.actorId,
        verb: a.verb,
        entityType: a.entityType,
        entityId: a.entityId ?? null,
        summary: a.summary,
        createdAt: a.createdAt,
      },
    });
  }

  // 3. Property transfers — 3 rows that surface on the manager's
  // /transfers page. Covers all three directions the UI exercises:
  // pending-incoming (manager is target), accepted-outgoing (manager
  // gave a lead property away), declined-incoming.
  const transferSeeds: Array<{
    propertyId: string;
    fromAgentId: string;
    toAgentId: string;
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    message: string;
    daysAgo: number;
  }> = [
    {
      propertyId: teamPropertyIds[`${teamAgents[0].id}::אחד העם 9`],
      fromAgentId: teamAgents[0].id,
      toAgentId: manager.id,
      status: 'PENDING',
      message: 'דנה, הלקוח שלי ביטל — את יכולה לקחת את זה?',
      daysAgo: 1,
    },
    {
      propertyId: teamPropertyIds[`${teamAgents[1].id}::קפלן 14`],
      fromAgentId: manager.id,
      toAgentId: teamAgents[1].id,
      status: 'ACCEPTED',
      message: 'עמית, מעבירה אליך — הלקוח גר ליד המשרד שלך.',
      daysAgo: 5,
    },
    {
      propertyId: teamPropertyIds[`${teamAgents[2].id}::שינקין 30`],
      fromAgentId: manager.id,
      toAgentId: teamAgents[2].id,
      status: 'DECLINED',
      message: 'מאיה, נכס להשכרה — מתאים לתיק שלך?',
      daysAgo: 8,
    },
  ];
  for (const t of transferSeeds) {
    if (!t.propertyId) continue; // defensive — skip if the lookup missed
    await prisma.propertyTransfer.create({
      data: {
        propertyId: t.propertyId,
        fromAgentId: t.fromAgentId,
        toAgentId: t.toAgentId,
        toAgentEmail: null,
        status: t.status,
        message: t.message,
        createdAt: atOffset(-t.daysAgo, 10, 0),
        respondedAt: t.status === 'PENDING' ? null : atOffset(-t.daysAgo + 1, 11, 0),
      },
    });
  }

  // 4. Pending office invites — 2 unaccepted rows so the /office
  // "pending invites" section renders with real entries.
  const pendingInvites = [
    { email: 'ronen.candidate@estia.app', daysAgo: 2 },
    { email: 'liat.candidate@estia.app',  daysAgo: 4 },
  ];
  for (const inv of pendingInvites) {
    await prisma.officeInvite.create({
      data: {
        officeId: office.id,
        email: inv.email,
        invitedById: manager.id,
        createdAt: atOffset(-inv.daysAgo, 10, 0),
      },
    });
  }

  // 5. Yad2 scan history — 2 past import attempts in the quota table
  // so /integrations/yad2 shows a populated "recent scans" chip row.
  // Well outside the 60-minute rolling window so they don't consume
  // the manager's current quota slots.
  await prisma.yad2ImportAttempt.create({
    data: { agentId: manager.id, attemptedAt: atOffset(-2, 9, 30) },
  });
  await prisma.yad2ImportAttempt.create({
    data: { agentId: manager.id, attemptedAt: atOffset(-7, 14, 0) },
  });

  console.log(`✓ manager demo: ${reminderRows.length} reminders, ${activityRows.length} activity rows, ${transferSeeds.length} transfers, ${pendingInvites.length} invites, 2 yad2 scans`);

  // ─── Manager personal data (properties / owners / leads / deals /
  // documents / meetings) ────────────────────────────────────────────
  //
  // The agent-scoped list endpoints (`GET /deals`, `/properties`,
  // `/leads`, `/owners`, `/documents`) filter on `agentId = uid`, so
  // without personal rows the manager's own views look empty on a
  // client walkthrough even though the /team scoreboard is busy. This
  // block seeds a balanced cross-section owned by the manager herself.
  //
  // Idempotent on re-run: we wipe every manager-scoped row we're about
  // to re-create before seeding. Scoped strictly to the manager user id
  // so the three team agents' personal data stays untouched.
  //
  // Wipe order matters: children before parents because of the FKs.
  // LeadMeeting → Lead, PropertyTransfer → Property, etc. Transfers
  // involving the manager's personal properties are already wiped in
  // the earlier block, so we skip re-wiping here.
  await prisma.leadMeeting.deleteMany({ where: { agentId: manager.id } });
  await prisma.deal.deleteMany({ where: { agentId: manager.id } });
  await prisma.lead.deleteMany({ where: { agentId: manager.id } });
  await prisma.property.deleteMany({ where: { agentId: manager.id } });
  await prisma.owner.deleteMany({ where: { agentId: manager.id } });
  await prisma.uploadedFile.deleteMany({
    where: { ownerId: manager.id, kind: 'document' },
  });

  // Wipe the 5 "team-distributed" leads we create below so the seed
  // stays idempotent on those rows as well. Keyed on a marker string
  // in `source` to avoid nuking any hand-crafted team leads.
  await prisma.lead.deleteMany({
    where: {
      agentId: { in: teamAgentIds },
      source: 'demo-team-sprinkle',
    },
  });

  // 1. Photo pool — copy from the admin user's properties if they
  // exist in this DB, otherwise fall back to the Unsplash URLs the
  // solo-agent block already uses. Admin is talfuks1234@gmail.com;
  // absent on fresh local DBs, present in production.
  const adminUser = await prisma.user.findUnique({
    where: { email: 'talfuks1234@gmail.com' },
    select: { id: true },
  });
  let photoCopySucceeded = false;
  const photoPool: string[][] = [];
  if (adminUser) {
    const adminProps = await prisma.property.findMany({
      where: { agentId: adminUser.id },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      take: 20,
    });
    for (const ap of adminProps) {
      const urls = ap.images.map((i) => i.url).filter(Boolean);
      if (urls.length > 0) photoPool.push(urls);
      if (photoPool.length >= 8) break;
    }
    if (photoPool.length >= 8) photoCopySucceeded = true;
  }
  // Fallback photo sets — mirror the solo-agent seed's Unsplash URLs.
  const fallbackPhotoSets: string[][] = [
    ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
     'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'],
    ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80'],
    ['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
     'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80'],
    ['https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80'],
    ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80'],
    ['https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=80'],
    ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80',
     'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80'],
    ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80'],
  ];
  while (photoPool.length < 8) {
    photoPool.push(fallbackPhotoSets[photoPool.length % fallbackPhotoSets.length]);
  }

  // 2. Owners — 6 rows, mixed Hebrew names and relationships. The
  // first three link to properties below via `propertyOwnerId` so the
  // Owners page shows "דירות משויכות" counts > 0.
  const ownerSeeds: Array<{
    name: string; phone: string; email?: string; relationship: string; notes?: string;
  }> = [
    { name: 'אברהם רוזנברג', phone: '052-4440001', email: 'avi.rose@example.com', relationship: 'בעל יחיד',  notes: 'בעלים של נכס ברוטשילד — מוכר בגלל רילוקיישן ללונדון.' },
    { name: 'מיכל שטרן',     phone: '053-4440002', email: 'michal.s@example.com', relationship: 'ירושה',      notes: 'ירשה את הדירה בבן יהודה מסבתה, מעדיפה למכור במהירות.' },
    { name: 'יורם אלמוג',    phone: '054-4440003',                                 relationship: 'חברה בע״מ', notes: 'דירקטור בחברת השקעות — מחזיק שלוש דירות להשכרה.' },
    { name: 'רחל קפלן',      phone: '050-4440004', email: 'rachel.k@example.com', relationship: 'זוג נשוי',   notes: 'בני זוג שמשדרגים לבית פרטי בהרצליה.' },
    { name: 'דוד חן',         phone: '058-4440005',                                 relationship: 'בעל יחיד',  notes: 'מחפש לשדרג את הדירה הנוכחית בתל אביב.' },
    { name: 'אורית ברקוביץ׳', phone: '052-4440006', email: 'orit.b@example.com', relationship: 'אחים',       notes: 'שלושה אחים מחזיקים יחד את הנכס המסחרי ברמת גן.' },
  ];
  const ownerRows: Array<{ id: string; name: string }> = [];
  for (const o of ownerSeeds) {
    const row = await prisma.owner.create({
      data: {
        agentId: manager.id,
        name: o.name,
        phone: o.phone,
        email: o.email ?? null,
        relationship: o.relationship,
        notes: o.notes ?? null,
      },
    });
    ownerRows.push({ id: row.id, name: row.name });
  }

  // 3. Properties — 8 rows under the manager. Mixed SALE/RENT ×
  // RESIDENTIAL/COMMERCIAL. First three link to owners[0..2].
  const propertySeeds: Array<{
    assetClass: 'RESIDENTIAL' | 'COMMERCIAL';
    category: 'SALE' | 'RENT';
    type: string;
    street: string; city: string; lat?: number; lng?: number;
    owner: string; ownerPhone: string;
    marketingPrice: number; sqm: number;
    rooms?: number | null; floor?: number; totalFloors?: number;
    elevator?: boolean; renovated?: string; vacancyDate?: string;
    parking?: boolean; storage?: boolean; balconySize?: number;
    airDirections?: string | null; ac?: boolean; safeRoom?: boolean;
    buildingAge?: number; sector?: string; notes?: string;
    propertyOwnerIdx?: number; // index into ownerRows
  }> = [
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'דירה',
      street: 'רוטשילד 34', city: 'תל אביב', lat: 32.065, lng: 34.772,
      owner: 'אברהם רוזנברג', ownerPhone: '052-4440001',
      marketingPrice: 5_900_000, sqm: 115, rooms: 4, floor: 5, totalFloors: 9,
      elevator: true, renovated: 'משופצת', vacancyDate: 'מיידי',
      parking: true, storage: true, balconySize: 14, airDirections: 'דרום-מערב',
      ac: true, safeRoom: true, buildingAge: 12, sector: 'כללי',
      notes: 'דירה בקומה גבוהה עם נוף פתוח לשדרה, משופצת ברמה גבוהה.',
      propertyOwnerIdx: 0,
    },
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'דירה',
      street: 'בן יהודה 152', city: 'תל אביב', lat: 32.085, lng: 34.770,
      owner: 'מיכל שטרן', ownerPhone: '053-4440002',
      marketingPrice: 4_250_000, sqm: 92, rooms: 3.5, floor: 2, totalFloors: 4,
      elevator: false, renovated: 'שמורה', vacancyDate: '3 חודשים',
      parking: false, storage: false, balconySize: 8, airDirections: 'מזרח',
      ac: true, safeRoom: false, buildingAge: 45, sector: 'כללי',
      notes: 'דירת באוהאוס מקורית, נשמרה במצב יוצא דופן — פוטנציאל השבחה.',
      propertyOwnerIdx: 1,
    },
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'פנטהאוז',
      street: 'דיזנגוף 180', city: 'תל אביב', lat: 32.080, lng: 34.773,
      owner: 'יורם אלמוג', ownerPhone: '054-4440003',
      marketingPrice: 7_950_000, sqm: 165, rooms: 5, floor: 14, totalFloors: 14,
      elevator: true, renovated: 'חדש מקבלן', vacancyDate: 'מיידי',
      parking: true, storage: true, balconySize: 55, airDirections: 'כל הכיוונים',
      ac: true, safeRoom: true, buildingAge: 2, sector: 'כללי',
      notes: 'פנטהאוז מרווח עם גג פרטי 80 מ״ר ונוף ים מרהיב.',
      propertyOwnerIdx: 2,
    },
    {
      assetClass: 'RESIDENTIAL', category: 'SALE', type: 'דירת גן',
      street: 'ביאליק 12', city: 'רמת גן', lat: 32.079, lng: 34.817,
      owner: 'רחל קפלן', ownerPhone: '050-4440004',
      marketingPrice: 3_180_000, sqm: 105, rooms: 4, floor: 0, totalFloors: 6,
      elevator: true, renovated: 'משופצת', vacancyDate: '6 חודשים',
      parking: true, storage: true, balconySize: 35, airDirections: 'דרום',
      ac: true, safeRoom: true, buildingAge: 18, sector: 'כללי',
      notes: 'דירת גן עם חצר פרטית, קרובה לפארק הלאומי.',
      propertyOwnerIdx: 3,
    },
    {
      assetClass: 'RESIDENTIAL', category: 'RENT', type: 'דירה',
      street: 'אלנבי 88', city: 'תל אביב', lat: 32.067, lng: 34.771,
      owner: 'דוד חן', ownerPhone: '058-4440005',
      marketingPrice: 8_500, sqm: 68, rooms: 3, floor: 3, totalFloors: 5,
      elevator: false, renovated: 'משופצת', vacancyDate: 'מיידי',
      parking: false, storage: false, balconySize: 6, airDirections: 'דרום',
      ac: true, safeRoom: false, buildingAge: 35, sector: 'כללי',
      notes: 'דירה להשכרה, משופצת היטב, לב תל אביב.',
      propertyOwnerIdx: 4,
    },
    {
      assetClass: 'RESIDENTIAL', category: 'RENT', type: 'דירה',
      street: 'ז׳בוטינסקי 40', city: 'רמת גן', lat: 32.084, lng: 34.812,
      owner: 'בעלת יחיד — פרטי', ownerPhone: '050-4440099',
      marketingPrice: 12_500, sqm: 110, rooms: 4, floor: 7, totalFloors: 10,
      elevator: true, renovated: 'משופצת', vacancyDate: 'מיידי',
      parking: true, storage: true, balconySize: 12, airDirections: 'מזרח',
      ac: true, safeRoom: true, buildingAge: 8, sector: 'כללי',
      notes: 'דירת 4 חדרים רחבת ידיים עם חניה וממ״ד.',
    },
    {
      assetClass: 'COMMERCIAL', category: 'SALE', type: 'משרד',
      street: 'דרך מנחם בגין 150', city: 'תל אביב', lat: 32.073, lng: 34.793,
      owner: 'אורית ברקוביץ׳', ownerPhone: '052-4440006',
      marketingPrice: 2_600_000, sqm: 180,
      rooms: null, floor: 22, totalFloors: 40,
      elevator: true, renovated: 'משופץ', vacancyDate: 'מיידי',
      parking: true, storage: false, balconySize: 0, airDirections: 'צפון',
      ac: true, safeRoom: false, buildingAge: 6, sector: 'כללי',
      notes: 'משרד בקומה גבוהה במגדל ייצוגי, נוף פנורמי.',
      propertyOwnerIdx: 5,
    },
    {
      assetClass: 'COMMERCIAL', category: 'RENT', type: 'חנות',
      street: 'שינקין 18', city: 'תל אביב', lat: 32.066, lng: 34.775,
      owner: 'קרן נדל״ן מסחרי בע״מ', ownerPhone: '03-5554444',
      marketingPrice: 13_500, sqm: 85,
      rooms: null, floor: 0, totalFloors: 3,
      elevator: false, renovated: 'שמור', vacancyDate: 'מיידי',
      parking: false, storage: true, balconySize: 0, airDirections: null,
      ac: true, safeRoom: false, buildingAge: 20, sector: 'כללי',
      notes: 'חנות בחזית רחוב מבוקש, חלון ראווה רחב.',
    },
  ];

  const managerPropertyIds: string[] = [];
  for (let i = 0; i < propertySeeds.length; i++) {
    const p = propertySeeds[i];
    const photos = photoPool[i] ?? photoPool[i % photoPool.length];
    const linkedOwnerId = typeof p.propertyOwnerIdx === 'number'
      ? ownerRows[p.propertyOwnerIdx]?.id ?? null
      : null;
    const created = await prisma.property.create({
      data: {
        agentId: manager.id,
        assetClass: p.assetClass,
        category: p.category,
        type: p.type,
        street: p.street,
        city: p.city,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        owner: p.owner,
        ownerPhone: p.ownerPhone,
        propertyOwnerId: linkedOwnerId,
        marketingPrice: p.marketingPrice,
        sqm: p.sqm,
        rooms: p.rooms ?? null,
        floor: p.floor ?? null,
        totalFloors: p.totalFloors ?? null,
        elevator: p.elevator ?? false,
        renovated: p.renovated ?? null,
        vacancyDate: p.vacancyDate ?? null,
        parking: p.parking ?? false,
        storage: p.storage ?? false,
        balconySize: p.balconySize ?? 0,
        airDirections: p.airDirections ?? null,
        ac: p.ac ?? false,
        safeRoom: p.safeRoom ?? false,
        buildingAge: p.buildingAge ?? null,
        sector: p.sector ?? null,
        notes: p.notes ?? null,
        exclusiveStart: atOffset(-60),
        exclusiveEnd: atOffset(120),
        marketingStartDate: atOffset(-45),
        status: 'ACTIVE',
        images: {
          create: photos.map((url, j) => ({ url, sortOrder: j })),
        },
      },
    });
    managerPropertyIds.push(created.id);
  }

  // 4. Leads — 15 personal leads for the manager. Wide mix of status /
  // interestType / lookingFor / city / budget with realistic Hebrew
  // names and phone numbers. `lastContact` spread across last 30 days.
  const managerLeadSeeds: Array<{
    name: string; phone: string; email?: string;
    interestType: 'PRIVATE' | 'COMMERCIAL';
    lookingFor: 'BUY' | 'RENT';
    city: string; street?: string;
    rooms?: string;
    priceRangeLabel: string; budget: number;
    preApproval?: boolean;
    status: 'HOT' | 'WARM' | 'COLD';
    source: string; notes: string;
    lastContactDaysAgo: number;
  }> = [
    { name: 'יעל בר-לב',      phone: '050-7010101', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'תל אביב',    rooms: '4',   priceRangeLabel: '4,500,000 - 6,000,000', budget: 6_000_000, preApproval: true,  status: 'HOT',  source: 'הפניה',         notes: 'מחפשת דירה משפחתית ליד פארק הירקון, עדיפות לממ״ד.',        lastContactDaysAgo: 1 },
    { name: 'אילן רוזן',      phone: '052-7020202', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'רמת גן',     rooms: '5',   priceRangeLabel: '3,000,000 - 4,200,000', budget: 4_200_000, preApproval: true,  status: 'HOT',  source: 'פייסבוק',      notes: 'משפחה עם שלושה ילדים — רוצה ליד בית הספר "הדר".',          lastContactDaysAgo: 2 },
    { name: 'דנית גל',         phone: '053-7030303', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'גבעתיים',    rooms: '3',   priceRangeLabel: '2,500,000 - 3,300,000', budget: 3_300_000, preApproval: false, status: 'WARM', source: 'יד 2',          notes: 'רווקה, משקיעה — מחפשת דירה עם פוטנציאל השבחה.',           lastContactDaysAgo: 4 },
    { name: 'עופר נחמיאס',    phone: '054-7040404', interestType: 'PRIVATE',    lookingFor: 'RENT', city: 'תל אביב',    rooms: '2',   priceRangeLabel: '6,500 - 9,500 ₪/חודש',    budget: 9_500,    preApproval: false, status: 'WARM', source: 'אתר',           notes: 'זוג צעיר, תאריך כניסה יולי.',                                lastContactDaysAgo: 3 },
    { name: 'שרון מלול',      phone: '058-7050505', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'תל אביב',    rooms: '5+',  priceRangeLabel: '7,000,000 - 9,000,000', budget: 9_000_000, preApproval: true,  status: 'HOT',  source: 'אירוע פתוח',   notes: 'מחפשת פנטהאוז, מוכנה לחכות עד שנה לדירה הנכונה.',        lastContactDaysAgo: 0 },
    { name: 'טל פרידמן',      phone: '050-7060606', interestType: 'COMMERCIAL', lookingFor: 'BUY',  city: 'תל אביב',    street: 'רוטשילד', priceRangeLabel: '2,000,000 - 3,500,000', budget: 3_500_000, preApproval: true,  status: 'WARM', source: 'לינקדאין',      notes: 'רוצה משרד להשקעה — ציפיית תשואה 4%+.',                    lastContactDaysAgo: 6 },
    { name: 'אפרת כהן-דוד', phone: '052-7070707', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'רמת גן',     rooms: '4',   priceRangeLabel: '2,800,000 - 3,600,000', budget: 3_600_000, preApproval: true,  status: 'WARM', source: 'המלצת חברה',   notes: 'עורכת דין, מעדיפה בניין בוטיק עד 20 דירות.',                lastContactDaysAgo: 8 },
    { name: 'מיכאל פרנקל',   phone: '053-7080808', interestType: 'COMMERCIAL', lookingFor: 'RENT', city: 'רמת גן',     street: 'ז׳בוטינסקי', priceRangeLabel: '12,000 - 18,000 ₪/חודש',  budget: 18_000,   preApproval: false, status: 'HOT',  source: 'אתר',           notes: 'משרד להייטק, לפחות 200 מ״ר, מוכן להיכנס מיידית.',         lastContactDaysAgo: 2 },
    { name: 'נועם שפירא',    phone: '054-7090909', interestType: 'PRIVATE',    lookingFor: 'RENT', city: 'גבעתיים',    rooms: '3',   priceRangeLabel: '7,000 - 10,000 ₪/חודש',   budget: 10_000,   preApproval: false, status: 'COLD', source: 'יד 2',          notes: 'סטודנט לרפואה, מחפש להעביר לצפון ת״א.',                    lastContactDaysAgo: 12 },
    { name: 'ליאת אבני',     phone: '058-7101010', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'תל אביב',    rooms: '4',   priceRangeLabel: '5,000,000 - 6,500,000', budget: 6_500_000, preApproval: true,  status: 'HOT',  source: 'הפניה מלקוח',  notes: 'גרושה עם שני ילדים, פרויקטים חדשים מעניינים.',              lastContactDaysAgo: 1 },
    { name: 'אורי שרעבי',    phone: '050-7111111', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'תל אביב',    rooms: '3',   priceRangeLabel: '3,800,000 - 4,800,000', budget: 4_800_000, preApproval: true,  status: 'WARM', source: 'פייסבוק',      notes: 'סינגל, אוהב דירות יד ראשונה בפרויקטים.',                   lastContactDaysAgo: 5 },
    { name: 'רונית ישראלי',  phone: '052-7121212', interestType: 'COMMERCIAL', lookingFor: 'BUY',  city: 'הרצליה',     street: 'סוקולוב', priceRangeLabel: '4,500,000 - 6,500,000', budget: 6_500_000, preApproval: true,  status: 'WARM', source: 'סיור סוכנים',  notes: 'קרן השקעות — נכסים מסחריים מניבים באזור המרכז.',          lastContactDaysAgo: 9 },
    { name: 'גלעד יוסף',     phone: '053-7131313', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'תל אביב',    rooms: '4.5', priceRangeLabel: '5,500,000 - 7,000,000', budget: 7_000_000, preApproval: true,  status: 'HOT',  source: 'הפניה',         notes: 'רופא משפחה, חוזר מארה״ב, כסף מוכן.',                        lastContactDaysAgo: 0 },
    { name: 'יובל אמסלם',    phone: '054-7141414', interestType: 'PRIVATE',    lookingFor: 'RENT', city: 'תל אביב',    rooms: '4',   priceRangeLabel: '10,000 - 14,000 ₪/חודש',   budget: 14_000,   preApproval: false, status: 'WARM', source: 'אתר',           notes: 'מנהלת במולטינשיונל, רילוקיישן מהולנד.',                    lastContactDaysAgo: 7 },
    { name: 'מאיר ששון',     phone: '058-7151515', interestType: 'PRIVATE',    lookingFor: 'BUY',  city: 'רמת גן',     rooms: '3',   priceRangeLabel: '2,200,000 - 2,900,000', budget: 2_900_000, preApproval: false, status: 'COLD', source: 'יד 2',          notes: 'פנסיונר, מחפש דירה קטנה ושקטה, חסר פרה-אפרובל.',         lastContactDaysAgo: 20 },
  ];

  const managerLeadIds: string[] = [];
  for (const l of managerLeadSeeds) {
    const row = await prisma.lead.create({
      data: {
        agentId: manager.id,
        name: l.name,
        phone: l.phone,
        email: l.email ?? null,
        interestType: l.interestType,
        lookingFor: l.lookingFor,
        city: l.city,
        street: l.street ?? null,
        rooms: l.rooms ?? null,
        priceRangeLabel: l.priceRangeLabel,
        budget: l.budget,
        preApproval: l.preApproval ?? false,
        status: l.status,
        source: l.source,
        notes: l.notes,
        brokerageSignedAt: atOffset(-Math.min(l.lastContactDaysAgo + 7, 90)),
        brokerageExpiresAt: atOffset(180),
        lastContact: atOffset(-l.lastContactDaysAgo, 10 + (l.lastContactDaysAgo % 8), 0),
      },
    });
    managerLeadIds.push(row.id);
  }

  // 5 additional leads spread across sara/amit/maya so /team intel has
  // some cross-agent pipeline colour. Marked with source='demo-team-
  // sprinkle' so the idempotent wipe above catches them on re-run.
  const teamLeadSeeds: Array<{
    agentIdx: number; name: string; phone: string;
    city: string; rooms?: string; budget: number;
    priceRangeLabel: string;
    status: 'HOT' | 'WARM' | 'COLD';
    lookingFor: 'BUY' | 'RENT';
    notes: string; lastContactDaysAgo: number;
  }> = [
    { agentIdx: 0, name: 'תמר גרוס',    phone: '050-8010001', city: 'תל אביב', rooms: '4',  budget: 5_800_000, priceRangeLabel: '4,800,000 - 5,800,000', status: 'HOT',  lookingFor: 'BUY',  notes: 'של שרה — ממתינה לתשובה על הצעה ברוטשילד 112.', lastContactDaysAgo: 1 },
    { agentIdx: 0, name: 'ברק ישראלוב', phone: '052-8010002', city: 'תל אביב', rooms: '5',  budget: 7_200_000, priceRangeLabel: '6,200,000 - 7,200,000', status: 'WARM', lookingFor: 'BUY',  notes: 'של שרה — מעוניין בבן גוריון 85 אם הקונה הנוכחי ייסוג.',            lastContactDaysAgo: 3 },
    { agentIdx: 1, name: 'נטע מילוא',    phone: '053-8020001', city: 'רמת גן',  rooms: '4',  budget: 3_400_000, priceRangeLabel: '2,800,000 - 3,400,000', status: 'HOT',  lookingFor: 'BUY',  notes: 'של עמית — רוצה לראות את סוקולוב 45 פעם שלישית.',                lastContactDaysAgo: 2 },
    { agentIdx: 1, name: 'דניאל אוחיון', phone: '054-8020002', city: 'גבעתיים', rooms: '3',  budget: 2_900_000, priceRangeLabel: '2,400,000 - 2,900,000', status: 'WARM', lookingFor: 'BUY',  notes: 'של עמית — לקוח ציני, לא לחוץ.',                                     lastContactDaysAgo: 6 },
    { agentIdx: 2, name: 'שי ברזילי',     phone: '058-8030001', city: 'תל אביב', rooms: '2',  budget: 11_000,    priceRangeLabel: '9,000 - 11,000 ₪/חודש', status: 'HOT',  lookingFor: 'RENT', notes: 'של מאיה — מחליט השבוע אם הולך על הירקון 280.',                lastContactDaysAgo: 0 },
  ];
  for (const l of teamLeadSeeds) {
    await prisma.lead.create({
      data: {
        agentId: teamAgents[l.agentIdx].id,
        name: l.name,
        phone: l.phone,
        interestType: 'PRIVATE',
        lookingFor: l.lookingFor,
        city: l.city,
        rooms: l.rooms ?? null,
        priceRangeLabel: l.priceRangeLabel,
        budget: l.budget,
        preApproval: l.status === 'HOT',
        status: l.status,
        source: 'demo-team-sprinkle',
        notes: l.notes,
        brokerageSignedAt: atOffset(-30),
        brokerageExpiresAt: atOffset(150),
        lastContact: atOffset(-l.lastContactDaysAgo, 11, 0),
      },
    });
  }

  // 5. Deals on the manager — 6 rows with mixed statuses. Two are
  // SIGNED in Q2-2026 with closedPrice + commission + signedAt so the
  // dashboard + kanban show win-state entries. Rest are in-flight.
  // updateDate must be set (defaults to now() via schema but we want
  // the timeline ordering to reflect the deal stage).
  const managerDealSeeds: Array<{
    propertyStreet: string; city: string;
    assetClass: 'RESIDENTIAL' | 'COMMERCIAL';
    category: 'SALE' | 'RENT';
    status: 'SIGNED' | 'NEGOTIATING' | 'WAITING_MORTGAGE' | 'PENDING_CONTRACT' | 'CLOSED';
    marketingPrice: number; offer: number;
    closedPrice?: number; commission?: number;
    buyerAgent: string; sellerAgent: string; lawyer: string;
    signedAt?: Date; updateDate: Date;
  }> = [
    // Two SIGNED wins — Q2 2026.
    {
      propertyStreet: 'רוטשילד 34', city: 'תל אביב',
      assetClass: 'RESIDENTIAL', category: 'SALE', status: 'SIGNED',
      marketingPrice: 5_900_000, offer: 5_780_000, closedPrice: 5_800_000, commission: 116_000,
      buyerAgent: 'אנגלו סכסון — דורון נאור',
      sellerAgent: 'עצמי (דנה לוי)',
      lawyer: 'עו״ד רחל גפן',
      signedAt: new Date('2026-04-08'),
      updateDate: new Date('2026-04-08'),
    },
    {
      propertyStreet: 'ביאליק 12', city: 'רמת גן',
      assetClass: 'RESIDENTIAL', category: 'SALE', status: 'SIGNED',
      marketingPrice: 3_180_000, offer: 3_100_000, closedPrice: 3_120_000, commission: 62_400,
      buyerAgent: 'רימקס פרמיום — אלון גולן',
      sellerAgent: 'עצמי (דנה לוי)',
      lawyer: 'עו״ד דני שלום',
      signedAt: new Date('2026-04-17'),
      updateDate: new Date('2026-04-17'),
    },
    // In-flight deals.
    {
      propertyStreet: 'דיזנגוף 180', city: 'תל אביב',
      assetClass: 'RESIDENTIAL', category: 'SALE', status: 'NEGOTIATING',
      marketingPrice: 7_950_000, offer: 7_650_000,
      buyerAgent: 'פרטי — ללא מתווך',
      sellerAgent: 'עצמי (דנה לוי)',
      lawyer: 'עו״ד מיכל אור',
      updateDate: atOffset(-2, 14, 0),
    },
    {
      propertyStreet: 'בן יהודה 152', city: 'תל אביב',
      assetClass: 'RESIDENTIAL', category: 'SALE', status: 'WAITING_MORTGAGE',
      marketingPrice: 4_250_000, offer: 4_150_000,
      buyerAgent: 'עצמי (דנה לוי)',
      sellerAgent: 'אנגלו סכסון — עידית פרנקל',
      lawyer: 'עו״ד נעם ברעם',
      updateDate: atOffset(-5, 11, 30),
    },
    {
      propertyStreet: 'דרך מנחם בגין 150', city: 'תל אביב',
      assetClass: 'COMMERCIAL', category: 'SALE', status: 'PENDING_CONTRACT',
      marketingPrice: 2_600_000, offer: 2_500_000,
      buyerAgent: 'BDO נדל״ן — רון אסף',
      sellerAgent: 'עצמי (דנה לוי)',
      lawyer: 'עו״ד חן יצחק',
      updateDate: atOffset(-1, 16, 0),
    },
    {
      propertyStreet: 'אלנבי 88', city: 'תל אביב',
      assetClass: 'RESIDENTIAL', category: 'RENT', status: 'CLOSED',
      marketingPrice: 8_500, offer: 8_300, closedPrice: 8_400, commission: 8_400,
      buyerAgent: 'עצמי (דנה לוי)',
      sellerAgent: 'עצמי (דנה לוי)',
      lawyer: '—',
      signedAt: new Date('2026-03-22'),
      updateDate: new Date('2026-03-22'),
    },
  ];
  for (const d of managerDealSeeds) {
    await prisma.deal.create({
      data: {
        agentId: manager.id,
        propertyStreet: d.propertyStreet,
        city: d.city,
        assetClass: d.assetClass,
        category: d.category,
        status: d.status,
        marketingPrice: d.marketingPrice,
        offer: d.offer,
        closedPrice: d.closedPrice ?? null,
        commission: d.commission ?? null,
        buyerAgent: d.buyerAgent,
        sellerAgent: d.sellerAgent,
        lawyer: d.lawyer,
        signedAt: d.signedAt ?? null,
        updateDate: d.updateDate,
      },
    });
  }

  // 6. Documents (UploadedFile kind='document') — 5 rows for the
  // Documents library page. Sizes are plausible for each file type;
  // `path` is a synthetic key — these rows will render without a real
  // S3 object, the page tolerates broken presigned URLs (falls back to
  // /uploads/<path>). This is fine for walkthrough-demo purposes.
  const docSeeds: Array<{
    originalName: string; mimeType: string; sizeBytes: number; tags: string[];
  }> = [
    {
      originalName: 'חוזה-בלעדיות-רוטשילד-112.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 412_000,
      tags: ['חוזים', 'בלעדיות'],
    },
    {
      originalName: 'תב"ע-אזור-5.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_850_000,
      tags: ['תב״ע', 'תכנון'],
    },
    {
      originalName: 'דו"ח-שווי-שוק.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 78_000,
      tags: ['דוחות', 'Q2'],
    },
    {
      originalName: 'תיק-נכס-רוטשילד.zip',
      mimeType: 'application/zip',
      sizeBytes: 6_400_000,
      tags: ['תיקי נכס'],
    },
    {
      originalName: 'צילום-נסח-טאבו.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 210_000,
      tags: ['טאבו', 'מסמכים משפטיים'],
    },
  ];
  for (const f of docSeeds) {
    await prisma.uploadedFile.create({
      data: {
        ownerId: manager.id,
        kind: 'document',
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        // Synthetic path — mirrors the runtime layout documents/<uid>/<uuid>.<ext>
        path: `documents/${manager.id}/demo-${f.originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
        tags: f.tags,
      },
    });
  }

  // 7. LeadMeeting — 4 meetings across the next 14 days tied to
  // random manager leads so the Calendar page month view has markers.
  const meetingSeeds: Array<{
    title: string; notes?: string; location?: string;
    leadIdx: number;
    daysFromNow: number; hour: number; minute: number; durationMinutes: number;
  }> = [
    {
      title: 'סיור בדירה — רוטשילד 34 (יעל בר-לב)',
      notes: 'סבב שני של הלקוחה בדירה, להביא מפרט טכני + סקר משעבודים.',
      location: 'רוטשילד 34, תל אביב',
      leadIdx: 0,
      daysFromNow: 2, hour: 10, minute: 0, durationMinutes: 60,
    },
    {
      title: 'פגישה במשרד — אילן רוזן',
      notes: 'לסכם יחד 3 נכסים ברמת גן + לדון בלוחות זמנים למימון.',
      location: 'משרד Estia Demo Brokerage, רוטשילד 12',
      leadIdx: 1,
      daysFromNow: 5, hour: 13, minute: 30, durationMinutes: 45,
    },
    {
      title: 'סיור נוסף — דיזנגוף 180 (שרון מלול)',
      notes: 'הפעם עם בן הזוג, להציג את הגג הפרטי.',
      location: 'דיזנגוף 180, תל אביב',
      leadIdx: 4,
      daysFromNow: 8, hour: 17, minute: 0, durationMinutes: 60,
    },
    {
      title: 'הצגה מסחרית — טל פרידמן',
      notes: 'פגישה לסקירת 2 משרדים להשקעה, להכין דוחות תשואה.',
      location: 'Zoom',
      leadIdx: 5,
      daysFromNow: 12, hour: 11, minute: 0, durationMinutes: 45,
    },
  ];
  for (const m of meetingSeeds) {
    const leadId = managerLeadIds[m.leadIdx];
    if (!leadId) continue;
    const startsAt = atOffset(m.daysFromNow, m.hour, m.minute);
    const endsAt = new Date(startsAt.getTime() + m.durationMinutes * 60 * 1000);
    await prisma.leadMeeting.create({
      data: {
        leadId,
        agentId: manager.id,
        title: m.title,
        notes: m.notes ?? null,
        location: m.location ?? null,
        startsAt,
        endsAt,
      },
    });
  }

  console.log(`✓ manager personal: ${propertySeeds.length} properties, ${ownerSeeds.length} owners, ${managerLeadSeeds.length} leads (+${teamLeadSeeds.length} team-sprinkle), ${managerDealSeeds.length} deals, ${docSeeds.length} documents, ${meetingSeeds.length} meetings (photo-copy from admin ${photoCopySucceeded ? 'OK' : 'fallback'})`);
  console.log('🌱 done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
