// Sprint 7 — Help page (in-app FAQ + support-channel hub).
//
// Static registry: src/data/helpFaq.json. Category pill filter,
// accordion list (one open at a time), and a bottom card with
// WhatsApp / email / contact-form channels. OSS-only: no Intercom,
// no vendor chat. The WhatsApp number is configurable via
// VITE_SUPPORT_PHONE so we don't bake a hard-coded string.
//
// Visual: DT Cream & Gold inline tokens, matching Customers /
// Contact / the rest of the claude-design port.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HelpCircle, Search, ChevronDown, MessageCircle, Mail, Send,
  Sparkles,
} from 'lucide-react';
import faqData from '../data/helpFaq.json';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Support phone falls back to a sensible default when the env var
// is missing (local dev, tests). Normalized to digits-only for
// `wa.me`, which wants no leading "+" or spaces.
const SUPPORT_PHONE_RAW =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_PHONE) ||
  '+972541234567';
const SUPPORT_PHONE_DIGITS = SUPPORT_PHONE_RAW.replace(/\D/g, '');

const SUPPORT_EMAIL = 'talfuks1234@gmail.com';
const EMAIL_SUBJECT = 'תמיכה ב-Estia';

// Ordered category list — drives the pill row. "הכול" is synthetic.
const CATEGORIES = [
  'הכול',
  'כללי',
  'לידים ולקוחות',
  'נכסים',
  'עסקאות',
  'AI וסיכומים',
  'חשבון ופרופיל',
  'חיוב',
];

export default function Help() {
  const [category, setCategory] = useState('הכול');
  const [q, setQ] = useState('');
  // Accordion: store the q-string of the currently open row, or null.
  // Single-open-at-a-time is standard for help FAQs (less visual noise
  // than accordions that let the user expand ten items at once).
  const [openQ, setOpenQ] = useState(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return faqData.filter((item) => {
      if (category !== 'הכול' && item.category !== category) return false;
      if (qq) {
        const hay = `${item.q} ${item.a}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [category, q]);

  const categoryCount = (cat) =>
    cat === 'הכול' ? faqData.length : faqData.filter((f) => f.category === cat).length;

  const toggleRow = (question) => {
    setOpenQ((current) => (current === question ? null : question));
  };

  return (
    <div dir="rtl" style={{
      ...FONT, padding: 28, color: DT.ink, minHeight: '100%',
      maxWidth: 960, margin: '0 auto',
    }}>
      {/* Hero card */}
      <div style={{
        background: `linear-gradient(160deg, ${DT.cream4}, ${DT.cream2})`,
        border: `1px solid ${DT.border}`,
        borderRadius: 18, padding: '32px 28px', marginBottom: 20,
        boxShadow: '0 20px 50px rgba(30,26,20,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink,
            boxShadow: '0 8px 20px rgba(180,139,76,0.28)',
          }}>
            <HelpCircle size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8, margin: 0 }}>
              איך נוכל לעזור?
            </h1>
            <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
              מרכז עזרה, שאלות נפוצות וערוצי תמיכה ישירים
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 12, padding: '0 14px', marginTop: 14,
        }}>
          <Search size={16} style={{ color: DT.muted }} aria-hidden="true" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש בשאלות נפוצות…"
            aria-label="חיפוש בשאלות נפוצות"
            style={{
              ...FONT, flex: 1, padding: '13px 10px',
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: DT.ink, minWidth: 0, textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* Category pill filter */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap',
      }}>
        {CATEGORIES.map((cat) => {
          const on = category === cat;
          const count = categoryCount(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={on}
              style={{
                ...FONT,
                background: on ? DT.ink : DT.white,
                color: on ? DT.cream : DT.ink,
                border: `1px solid ${on ? DT.ink : DT.border}`,
                padding: '8px 14px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >{cat} · {count}</button>
          );
        })}
      </div>

      {/* Accordion list */}
      <div
        data-testid="help-faq-list"
        style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, overflow: 'hidden', marginBottom: 24,
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: DT.muted }}>
            <Sparkles size={22} style={{ color: DT.gold, marginBottom: 8 }} aria-hidden="true" />
            <div style={{ fontSize: 14, fontWeight: 700, color: DT.ink, marginBottom: 4 }}>
              לא נמצאו תשובות
            </div>
            <div style={{ fontSize: 12 }}>
              נסו לחפש במילים אחרות או לפתוח כל הקטגוריות.
            </div>
          </div>
        )}
        {filtered.map((item, idx) => {
          const open = openQ === item.q;
          const isLast = idx === filtered.length - 1;
          return (
            <div
              key={item.q}
              style={{
                borderBottom: isLast ? 'none' : `1px solid ${DT.border}`,
              }}
            >
              <button
                type="button"
                onClick={() => toggleRow(item.q)}
                aria-expanded={open}
                style={{
                  ...FONT,
                  width: '100%', background: open ? DT.cream4 : DT.white,
                  border: 'none', padding: '16px 20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, textAlign: 'right', color: DT.ink,
                  fontSize: 14, fontWeight: 700,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: DT.gold,
                    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
                  }}>{item.category}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: DT.ink, textAlign: 'right' }}>
                    {item.q}
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  style={{
                    color: DT.muted, flexShrink: 0,
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 180ms ease',
                  }}
                />
              </button>
              {open && (
                <div style={{
                  padding: '0 20px 18px',
                  fontSize: 14, lineHeight: 1.8, color: DT.ink2,
                  background: DT.cream4,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contact channels card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 24,
      }}>
        <h2 style={{
          fontSize: 18, fontWeight: 800, letterSpacing: -0.4,
          margin: '0 0 6px', color: DT.ink,
        }}>
          לא מצאתם תשובה?
        </h2>
        <p style={{ fontSize: 13, color: DT.muted, margin: '0 0 18px', lineHeight: 1.7 }}>
          אנחנו כאן — בחרו את הערוץ שנוח לכם ונחזור אליכם בהקדם.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {/* WhatsApp */}
          <a
            href={`https://wa.me/${SUPPORT_PHONE_DIGITS}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="שליחת הודעה ב-WhatsApp"
            style={channelCard()}
          >
            <div style={channelIcon('rgba(21,128,61,0.12)', DT.success)}>
              <MessageCircle size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DT.ink }}>WhatsApp</div>
              <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                תשובה תוך שעות ספורות בימי עבודה
              </div>
            </div>
          </a>

          {/* Email */}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}`}
            aria-label={`שליחת אימייל ל-${SUPPORT_EMAIL}`}
            style={channelCard()}
          >
            <div style={channelIcon(DT.goldSoft, DT.gold)}>
              <Mail size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DT.ink }}>אימייל</div>
              <div style={{ fontSize: 11, color: DT.muted, marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
                {SUPPORT_EMAIL}
              </div>
            </div>
          </a>

          {/* Contact form (Sprint 5.1) */}
          <Link
            to="/contact"
            aria-label="מעבר לטופס צרו קשר"
            style={channelCard()}
          >
            <div style={channelIcon('rgba(30,26,20,0.08)', DT.ink)}>
              <Send size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: DT.ink }}>צרו קשר</div>
              <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                טופס פנייה עם היסטוריה וקבצים
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────
function channelCard() {
  return {
    ...FONT,
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px',
    background: DT.cream4, border: `1px solid ${DT.border}`,
    borderRadius: 12, textDecoration: 'none',
    color: DT.ink, cursor: 'pointer',
  };
}
function channelIcon(bg, color) {
  return {
    width: 38, height: 38, borderRadius: 10,
    background: bg, color,
    display: 'grid', placeItems: 'center', flexShrink: 0,
  };
}
