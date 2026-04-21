import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './Settings.css';

// H4 — /settings landing page.
//
// A simple index of per-agent / per-office settings screens. Keeps the
// main sidebar uncluttered: agents who want to change tags, manage
// neighborhoods, or tweak their office details have one URL to reach
// for. Links deliberately include /settings/neighborhoods even though
// that route will be added in a later batch (Agent 9 / G2) — the link
// sits dormant until then, at which point it lights up automatically.
//
// `/office` is OWNER-only; hidden for AGENT-role accounts.

const CARDS = [
  {
    key: 'tags',
    to: '/settings/tags',
    title: 'תגיות',
    description: 'נהל את אוסף התגיות של המשרד — צבעים, תחום (נכסים / לידים / כולם).',
  },
  {
    key: 'neighborhoods',
    to: '/settings/neighborhoods',
    title: 'שכונות',
    description: 'הגדר את רשימת השכונות שצצות באוטו-קומפליט של הטפסים.',
  },
  {
    key: 'office',
    to: '/office',
    title: 'משרד',
    description: 'פרטי המשרד, לוגו וחברי הצוות. זמין רק לבעלי חשבון מנהל.',
    ownerOnly: true,
  },
  {
    key: 'profile',
    to: '/profile',
    title: 'הפרופיל שלי',
    description: 'שם, טלפון, אווטר, חיבור ל-Google Calendar.',
  },
  {
    key: 'templates',
    to: '/templates',
    title: 'תבניות הודעה',
    description: 'תבניות WhatsApp ודוא"ל לשליחה מהירה ללקוחות.',
  },
];

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const visible = CARDS.filter((card) => !card.ownerOnly || isOwner);

  return (
    <div className="settings-page" dir="rtl">
      <header className="settings-page-header">
        <h1 className="settings-page-title">הגדרות</h1>
        <p className="settings-page-subtitle">
          כל מה שצריך להתאים לפני שיוצאים לעבודה — תגיות, שכונות, משרד, פרופיל ותבניות.
        </p>
      </header>

      <ul className="settings-grid">
        {visible.map((card) => (
          <li key={card.key}>
            <Link to={card.to} className="btn btn-secondary settings-card">
              <span className="settings-card-title">{card.title}</span>
              <span className="settings-card-desc">{card.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
