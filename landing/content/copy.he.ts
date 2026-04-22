/**
 * Landing — Hebrew copy
 *
 * Every user-visible string on the landing page lives in this file so
 * a Hebrew-fluent reviewer can edit the whole page in one sitting without
 * hunting through JSX. Do not hardcode copy inside components.
 *
 * Naming convention: snake_case keys by section. `nav.*`, `hero.*`,
 * `features.*`, `mobile.*`, `how.*`, `pricing.*`, `faq.*`, `final_cta.*`,
 * `footer.*`, `meta.*`.
 *
 * Open items flagged inline with `TODO(landing):`.
 *   • Pricing numbers + tier composition — placeholder; confirm with Adam.
 *   • App Store / Google Play URLs — none yet; buttons render disabled.
 *   • Screenshots — placeholder frames in components until final assets land.
 *   • Yad2 import tone — currently reads as shipped; adjust if still beta-flagged.
 */

export const copy = {
  meta: {
    title: 'CRM למתווכים · אפליקציה לאייפון ואנדרואיד · Estia',
    description:
      'CRM מודרני לסוכני נדל״ן: לקוחות, נכסים, יומן ומחשבון עמלות — בנייד. 30 יום חינם, בלי כרטיס אשראי.',
    og_alt: 'Estia — מערכת ניהול נדל״ן לסוכנים, עם אפליקציה לאייפון ולאנדרואיד.',
    canonical: 'https://estia.tripzio.xyz/',
  },

  nav: {
    logo: 'Estia',
    links: [
      { id: 'features', label: 'תכונות' },
      { id: 'pricing',  label: 'מחירים' },
      { id: 'faq',      label: 'שאלות נפוצות' },
    ],
    login_cta:   'התחברות',
    primary_cta: 'התחלה חינם',
    mobile_menu_open:  'פתיחת תפריט',
    mobile_menu_close: 'סגירת תפריט',
  },

  hero: {
    eyebrow: 'ה-CRM לסוכני הנדל״ן בישראל',
    h1: 'ה-CRM של המתווכים.\nכולו בנייד שלך.',
    sub:
      'ניהול לקוחות, נכסים, פגישות ולידים — מהמקום שבו אתם באמת עובדים. ' +
      '30 יום חינם, בלי כרטיס אשראי.',
    primary_cta: 'התחלה חינם ל-30 יום',
    secondary_cta: 'כבר יש לי חשבון',
    trust: ['בלי כרטיס אשראי', 'ביטול בכל רגע', 'תמיכה בעברית'],
    // TODO(landing): swap placeholder screenshot once final asset lands.
    screenshot_alt: 'מסך הבית של Estia: רשימת הלידים, הנכסים והיומן להיום.',
    app_store_label:    'הורדה מ-App Store',
    google_play_label:  'להורדה ב-Google Play',
    store_disabled_note: 'האפליקציה בדרך. השאירו אימייל ונעדכן.',
  },

  features: {
    section_title: 'כל הכלים שמתווך באמת צריך',
    section_sub:
      'הכלים שאתם משתמשים בהם מדי יום — ליד, נכס, פגישה, עמלה — במערכת אחת שעובדת גם כשאין זמן.',
    cards: [
      {
        key: 'leads',
        title: 'ניהול לקוחות שבאמת עובד',
        body: 'מעקב מלא על כל ליד, מהשיחה הראשונה ועד העסקה. הערות, תזכורות והיסטוריה במקום אחד.',
      },
      {
        key: 'properties',
        title: 'נכסים, בלעדיויות, וכל הפרטים',
        body: 'תיק נכס מלא: תמונות, בעלים, מסלול שיווק וזכויות חתומות — תמיד זמין לשליחה ללקוח.',
      },
      {
        key: 'calendar',
        title: 'יומן פגישות שמבין מה צריך',
        body: 'פגישה חדשה שואבת את הלקוח, הנכס והכתובת אוטומטית — גם בנייד וגם ביומן גוגל.',
      },
      {
        key: 'calculator',
        title: 'מחשבון עמלות מדויק',
        body: 'נטו למוכר או מחיר רישום, דינמי — עם מע״מ, שכר טרחת עו״ד ועלויות נוספות.',
      },
      {
        key: 'yad2',
        title: 'ייבוא מיד2 בלחיצה',
        // TODO(landing): adjust if Yad2 import is still beta-flagged in prod.
        body: 'סוכנות שלמה עולה לתוך Estia תוך דקה — תמונות, תיאורים ופרטי קשר, בלי העתק-הדבק.',
      },
      {
        key: 'mobile',
        title: 'אפליקציה לאייפון ולאנדרואיד',
        body: 'כל מה שיש באתר — גם בכיס שלכם. שיחות, פגישות ופעולות, בלי להתיישב מול מחשב.',
      },
    ],
  },

  mobile: {
    section_eyebrow: 'האפליקציה',
    section_title: 'כל הלידים שלך — כבר עכשיו בכיס שלך',
    section_sub: 'אפליקציה נטיבית לאייפון ולאנדרואיד. עובדת גם במעלית, גם בנהיגה, גם בפגישה.',
    bullets: [
      'הודעות WhatsApp, שיחות ופגישות — ישירות מהאפליקציה.',
      'מתראות חכמות שלא יגרמו לך לפספס ליד חם.',
      'תמונות, מיקום, ניווט — הכול בנגיעה אחת.',
      'סנכרון מיידי עם הדסקטופ — ממשיכים מאיפה שעצרתם.',
    ],
    qr_label_desktop: 'סרקו כדי להוריד',
    // TODO(landing): replace the placeholder device frame with final screenshots.
    screenshot_alt: 'מסך הלידים באפליקציית Estia — לחיצה אחת על ליד לפתיחת כרטיס מלא.',
  },

  how: {
    section_title: 'בעוד 2 דקות — אתם כבר עובדים',
    steps: [
      {
        n: 1,
        title: 'נרשמים בדקה',
        body: 'אימייל וסיסמה או התחברות עם Google. בלי כרטיס אשראי.',
      },
      {
        n: 2,
        title: 'מייבאים או מתחילים נקי',
        body: 'ייבוא מ-Excel או מ-Yad2, או הקלדת הנכסים הראשונים — הבחירה שלכם.',
      },
      {
        n: 3,
        title: 'עובדים. 30 יום חינם.',
        body: 'ביטול בכל רגע, בלי התחייבות, בלי שיחות מכירה.',
      },
    ],
  },

  pricing: {
    section_title: 'מחיר ברור. הכול כלול.',
    section_sub: '30 יום חינם. בלי כרטיס אשראי. ביטול בכל רגע.',
    // TODO(landing): confirm numbers + tier composition with Adam.
    // Current values are placeholders so the section's layout can be reviewed.
    // Change here — DOM updates itself.
    cycle_toggle: { monthly: 'חיוב חודשי', yearly: 'חיוב שנתי — חודשיים במתנה' },
    yearly_hint: 'חודשיים מתנה בתשלום שנתי',
    vat_note: 'כל המחירים כוללים מע״מ',
    currency: '₪',
    tiers: [
      {
        key: 'starter',
        name: 'בסיס',
        lead: 'למתווך עצמאי',
        monthly: 99,
        yearly:  990, // TODO(landing): confirm yearly math (10 × monthly = "2 months free")
        recommended: false,
        bullets: [
          'עד 50 נכסים פעילים',
          'עד 100 לקוחות/לידים',
          'אפליקציה לאייפון ואנדרואיד',
          'תמיכה בעברית במייל',
          'סנכרון ליומן גוגל',
        ],
        cta: 'התחלה חינם',
      },
      {
        key: 'pro',
        name: 'מקצועי',
        lead: 'למשרד או למתווך מקצועי',
        monthly: 249,
        yearly:  2490, // TODO(landing): confirm yearly math
        recommended: true,
        recommended_badge: 'הכי פופולרי',
        bullets: [
          'נכסים ולקוחות ללא הגבלה',
          'ייבוא מ-Yad2 ומ-Excel',
          'יומן מתקדם + ייצוא לתבניות WhatsApp',
          'מחשבון עמלות ועמלת תיווך',
          'דף נכס ציבורי + הודעות שיתוף מעוצבות',
          'עדיפות תמיכה',
        ],
        cta: 'התחלה חינם',
      },
    ],
    trust: [
      'בלי כרטיס אשראי לניסיון',
      'ביטול בכל רגע',
      'תמיכה בעברית',
      'שרתים באירופה (עומד בתקני GDPR)',
    ],
  },

  faq: {
    section_title: 'שאלות ששואלים אותנו',
    items: [
      {
        q: 'האם באמת אין צורך בכרטיס אשראי?',
        a: 'נכון. רושמים אימייל וסיסמה, נכנסים, עובדים. כרטיס אשראי מוזן רק אם החלטתם להמשיך אחרי 30 יום.',
      },
      {
        q: 'מה קורה אחרי 30 יום?',
        a: 'תקבלו אימייל יום לפני סוף התקופה. אם לא בחרתם מסלול בתשלום — החשבון עובר למצב צפייה בלבד, הנתונים נשמרים, ותוכלו לחזור בכל רגע.',
      },
      {
        q: 'האם האפליקציה עובדת על אייפון ואנדרואיד?',
        // TODO(landing): update wording once store listings are live.
        a: 'כן — אפליקציה נטיבית לשני המכשירים. בזמן הזה האפליקציה עדיין לא פורסמה בחנויות; מי שנרשם מקבל גישה מוקדמת ברגע שהיא עולה.',
      },
      {
        q: 'האם אפשר לייבא נתונים מ-Excel או מיד2?',
        a: 'כן. ייבוא מ-Excel בקליק, וייבוא מכל סוכנות ב-Yad2 בלחיצה אחת — כולל תמונות, תיאורים ומחירים.',
      },
      {
        q: 'האם הנתונים שלי מאובטחים?',
        a: 'הנתונים מוצפנים במעבר ובמנוחה, נשמרים על שרתים באירופה (AWS eu-north-1), וגיבויים אוטומטיים נשמרים 14 יום. אתם הבעלים הבלעדיים של המידע — ניתן לייצא אותו או למחוק אותו בכל רגע.',
      },
      {
        q: 'מתאים גם למתווך עצמאי או רק למשרדים?',
        a: 'שניהם. המסלול "בסיס" מתאים למתווך עצמאי; "מקצועי" מיועד למשרדים או לסוכנים עם נפח גבוה של נכסים ולקוחות.',
      },
    ],
  },

  final_cta: {
    h2: 'מוכנים לנהל את העסק שלכם אחרת?',
    sub: '30 יום חינם. בלי כרטיס אשראי. בלי התחייבות.',
    primary_cta: 'להתחלה חינם',
    secondary_label: 'או הורידו את האפליקציה:',
  },

  footer: {
    tagline: 'Estia — ה-CRM לסוכני הנדל״ן בישראל.',
    columns: [
      {
        title: 'מוצר',
        links: [
          { label: 'תכונות',        href: '#features' },
          { label: 'מחירים',        href: '#pricing' },
          { label: 'שאלות נפוצות', href: '#faq' },
          { label: 'התחברות',       href: '/login' },
        ],
      },
      {
        title: 'חברה',
        links: [
          // TODO(landing): wire real routes for contact / terms / privacy.
          { label: 'צור קשר',      href: 'mailto:hello@estia.tripzio.xyz' },
          { label: 'תנאי שימוש',    href: '#' },
          { label: 'מדיניות פרטיות', href: '#' },
        ],
      },
    ],
    copyright: '© 2026 Estia · כל הזכויות שמורות',
  },

  // Strings shared across sections
  shared: {
    currency_suffix: ' / חודש',
    vat_inclusive: 'כולל מע״מ',
    anchor_to_pricing: 'לראות מחירים',
    coming_soon: 'בקרוב',
  },
} as const;

export type Copy = typeof copy;
