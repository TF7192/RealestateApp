// Estia AI — opening greeting seeded into an empty chat transcript.
// Called from /ai (Ai.jsx) and the floating widget (AiChatWidget.jsx)
// when the persisted message list is empty on mount. Logout/login
// wipes the persisted transcript (see lib/auth.jsx purgeClientSessionState),
// so a fresh login lands on this greeting; a pure refresh keeps the
// existing transcript and never re-seeds.
//
// The greeting is markdown — Bubble in Ai.jsx renders **bold**, bullets,
// and emoji safely (no dangerouslySetInnerHTML).

const PREMIUM_TEASER =
  '\n\n💡 חלק מהיכולות הן Premium — שלח/י הודעה כדי לראות פרטים על שדרוג.';

export function buildAiGreeting({ isPremium = false, userName = '' } = {}) {
  const firstName = String(userName || '').trim().split(/\s+/)[0] || '';
  const hello = firstName ? `שלום ${firstName}!` : 'שלום!';

  const body = [
    `${hello} אני **Estia AI** — היד-ימין שלך לניהול מתעניינים, נכסים ועסקאות.`,
    '',
    'אני יכול/ה לעזור לך עם:',
    '- חיפוש במתעניינים שלך — "אילו מתעניינים חמים יש לי בתל אביב?"',
    '- ניסוח הודעות WhatsApp ותזכורות לפי הסטטוס של המתעניין',
    '- התאמת נכסים למתעניינים שלך והפך — "איזה נכס מתאים למתעניין החם האחרון?"',
    '- סיכום של היום, השבוע או החודש — פגישות, תזכורות, עסקאות שנסגרו',
    '- **הדרכה צעד-אחר-צעד**: שאל/י "איך עושים X" ואני אסביר איפה ללחוץ במערכת',
    '',
    'מה תרצה/י לעשות?',
  ].join('\n');

  return {
    role: 'assistant',
    content: isPremium ? body : body + PREMIUM_TEASER,
  };
}

export default buildAiGreeting;
