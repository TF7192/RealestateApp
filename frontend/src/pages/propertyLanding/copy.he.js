// Hebrew copy presets for the per-property landing page.
//
// Lifted from the original PropertyLandingPage's `TEMPLATES` object so
// byte-identical output is preserved for rows where the agent hasn't
// customized anything. The renderer falls back to these defaults
// whenever a section's `props.eyebrow / title / subtitle / heading /
// ...` field is the empty string.
//
// LUXURY and INVESTMENT share the residential layout and only
// diverge on copy — Phase 3 may bespoke them further; the structure
// is here today so the editor's template dropdown has somewhere to
// point.

export const TEMPLATES = {
  RESIDENTIAL: {
    eyebrow: 'הבית הבא שלכם',
    title: 'בית שמחכה להיכנס אליו',
    subtitle: 'לחוות את הנכס לפני כולם — הירשמו ונחזור אליכם עם כל הפרטים.',
    formHeading: 'מעוניינים בסיור? השאירו פרטים',
    formSub: 'נחזור אליכם בתוך שעות עבודה עם מידע מלא, מועדי סיור והצעה אישית.',
    submit: 'קבעו סיור',
    messagePlaceholder: 'מתי נוח לכם לבקר? האם יש דרישות ספציפיות?',
    gratitude: 'תודה! נחזור אליכם בהקדם לקביעת סיור.',
  },
  COMMERCIAL: {
    eyebrow: 'מרחב עסקי חדש',
    title: 'מרחב שמניע עסקים קדימה',
    subtitle: 'מיקום, אופי, ושטח שמתאימים לעסק שלכם. נשלח לכם את כל המידע לפי דרישה.',
    formHeading: 'רוצים פרטים על הנכס? מלאו את הטופס',
    formSub: 'נחזור אליכם עם תוכנית, שטחים, תנאי שכירות והצעה מותאמת לעסק שלכם.',
    submit: 'שלחו פנייה',
    messagePlaceholder: 'ספרו לנו על העסק / השימוש המתוכנן / כמה עמדות עבודה דרושות',
    gratitude: 'תודה! פנייתכם נקלטה — הסוכן יחזור אליכם עם פרטים.',
  },
  LUXURY: {
    eyebrow: 'מגורי יוקרה',
    title: 'נכס בוטיק שלא חוזר על עצמו',
    subtitle: 'פנייה אישית, סיור פרטי, עסקה דיסקרטית.',
    formHeading: 'בקשו סיור פרטי',
    formSub: 'נחזור אליכם לתיאום סיור פרטי בשעות שיתאימו לכם, כולל הכנת תיק מותאם.',
    submit: 'קבעו סיור פרטי',
    messagePlaceholder: 'נשמח לדעת על תיאומים מועדפים, צרכים מיוחדים, או שאלות מקדימות.',
    gratitude: 'תודה — נחזור אליכם באופן אישי לתיאום סיור.',
  },
  INVESTMENT: {
    eyebrow: 'הזדמנות השקעה',
    title: 'נכס שמדבר מספרים',
    subtitle: 'תשואה, שכירות שוטפת, פוטנציאל עליית ערך — נשלח לכם את כל הנתונים.',
    formHeading: 'בקשו תיק נתונים מלא',
    formSub: 'נחזור אליכם עם תזרים צפוי, מצב שכירות נוכחי, וניתוח רווחיות.',
    submit: 'שלחו לי את הנתונים',
    messagePlaceholder: 'מה מעניין אתכם — תשואה, מימון, פוטנציאל פיתוח, יציאה?',
    gratitude: 'תודה — נשלח אליכם את תיק הנתונים בהקדם.',
  },
};

export function templateCopy(template) {
  return TEMPLATES[template] || TEMPLATES.RESIDENTIAL;
}
