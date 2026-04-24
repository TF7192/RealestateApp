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

  for (const lane of demoPipelines) {
    const agent = teamAgents[lane.agentIdx];
    for (const r of lane.rows) {
      // Mirror each deal with a matching property so /properties
      // shows the team's inventory on any agent login.
      await prisma.property.create({
        data: {
          agentId: agent.id,
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
  console.log('🌱 done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
