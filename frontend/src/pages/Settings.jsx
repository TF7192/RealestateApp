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
//
// Cream & Gold inline-style re-skin matching the rest of the port.

import { Link } from 'react-router-dom';
import {
  Tag, MapPin, Building2, UserCircle, MessageSquare, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const CARDS = [
  {
    key: 'tags',
    to: '/settings/tags',
    title: 'תגיות',
    description: 'נהל את אוסף התגיות של המשרד — צבעים, תחום (נכסים / לידים / כולם).',
    Icon: Tag,
  },
  {
    key: 'neighborhoods',
    to: '/settings/neighborhoods',
    title: 'שכונות',
    description: 'הגדר את רשימת השכונות שצצות באוטו-קומפליט של הטפסים.',
    Icon: MapPin,
  },
  {
    key: 'office',
    to: '/office',
    title: 'משרד',
    description: 'פרטי המשרד, לוגו וחברי הצוות. זמין רק לבעלי חשבון מנהל.',
    ownerOnly: true,
    Icon: Building2,
  },
  {
    key: 'profile',
    to: '/profile',
    title: 'הפרופיל שלי',
    description: 'שם, טלפון, אווטר, חיבור ל-Google Calendar.',
    Icon: UserCircle,
  },
  {
    key: 'templates',
    to: '/templates',
    title: 'תבניות הודעה',
    description: 'תבניות WhatsApp ודוא"ל לשליחה מהירה ללקוחות.',
    Icon: MessageSquare,
  },
];

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const visible = CARDS.filter((card) => !card.ownerOnly || isOwner);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Header */}
      <header style={{ marginBottom: 22 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0,
        }}>הגדרות</h1>
        <p style={{
          fontSize: 13, color: DT.muted, margin: '4px 0 0', lineHeight: 1.6,
          maxWidth: 640,
        }}>
          כל מה שצריך להתאים לפני שיוצאים לעבודה — תגיות, שכונות, משרד, פרופיל ותבניות.
        </p>
      </header>

      {/* Cards grid */}
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0,
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}>
        {visible.map((card) => {
          const { Icon } = card;
          return (
            <li key={card.key}>
              <Link
                to={card.to}
                style={{
                  ...FONT,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  background: DT.white,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 14,
                  padding: 18,
                  textDecoration: 'none',
                  color: DT.ink,
                  height: '100%',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = DT.gold;
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(180,139,76,0.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = DT.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: DT.goldSoft, color: DT.goldDark,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Icon size={18} />
                  </div>
                  <ChevronLeft size={16} style={{ color: DT.muted }} aria-hidden="true" />
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 800, letterSpacing: -0.3, color: DT.ink,
                }}>{card.title}</div>
                <div style={{
                  fontSize: 13, color: DT.muted, lineHeight: 1.6,
                }}>{card.description}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
