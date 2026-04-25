// Sprint 7 — /inbox placeholder.
//
// Gives the "WhatsApp Business Inbox" sidebar entry a real route to
// point at. The integration itself is deferred: Meta requires the
// app to be approved as a Tech Provider before we can host WhatsApp
// Business conversations on behalf of agents. Until that approval
// lands, outbound messaging continues through wa.me / SMS deep-links
// and this page serves as a premium preview + early-access CTA.
//
// Visual style matches the rest of the Cream & Gold surface (DT
// tokens inline, Assistant/Heebo, gold primary CTA). No backend
// calls — this is a purely informational page.
//
// The CTA points to /contact, the same destination the
// PremiumGateDialog uses for early-access requests, so inbound
// interest lands in the existing contact-form inbox.
//
// A-4 context: this page is mounted inside the authed Layout, so
// the sidebar + topbar render around it automatically.

import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import WhatsAppIcon from '../components/WhatsAppIcon';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', successSoft: 'rgba(21,128,61,0.12)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Feature preview list. `state: 'shipped'` means the capability
// already exists elsewhere in the app (call-recording lives on the
// lead detail page, SMS/WhatsApp deep-links ship from every lead
// row). `state: 'pending'` marks the bits that wait on Meta.
const FEATURES = [
  { label: 'תיבה אחת לכל השיחות',              state: 'pending' },
  { label: 'סנכרון דו-כיווני עם WhatsApp',     state: 'pending' },
  { label: 'תבניות מאושרות ומעקב קריאה',         state: 'pending' },
  { label: 'הקלטת פגישות + סיכום AI',           state: 'shipped' },
];

export default function Inbox() {
  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Hero card — large WhatsApp glyph in gold + title + subtitle. */}
      <div style={{
        maxWidth: 720, margin: '0 auto',
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 18, padding: '36px 32px',
        boxShadow: '0 12px 40px rgba(30,26,20,0.06)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          display: 'grid', placeItems: 'center', color: DT.ink,
          boxShadow: '0 10px 26px rgba(180,139,76,0.28)',
          marginBottom: 20,
        }}>
          <WhatsAppIcon size={38} />
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 800, letterSpacing: -0.8,
          margin: '0 0 8px',
        }}>
          WhatsApp Business Inbox
        </h1>
        <p style={{
          fontSize: 15, lineHeight: 1.7, color: DT.muted,
          margin: '0 0 28px', maxWidth: 560,
        }}>
          התיבה המאוחדת של כל ההודעות מהלידים, בתוך Estia.
        </p>

        {/* Feature preview list. Shipped items get a green check +
            a small "כבר פעיל" tag; pending items get a muted clock
            icon + "בקרוב" tag. Same two-state pattern the Help page
            uses for ready/planned channels. */}
        <ul style={{
          listStyle: 'none', padding: 0, margin: '0 0 28px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {FEATURES.map((f) => {
            const shipped = f.state === 'shipped';
            return (
              <li key={f.label} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: DT.cream4,
                border: `1px solid ${DT.border}`,
                borderRadius: 12, padding: '14px 16px',
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: shipped ? DT.successSoft : DT.goldSoft,
                  color: shipped ? DT.success : DT.gold,
                  display: 'grid', placeItems: 'center',
                }}>
                  {shipped
                    ? <CheckCircle2 size={15} aria-hidden="true" />
                    : <Clock size={15} aria-hidden="true" />}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: DT.ink }}>
                  {f.label}
                </span>
                <span style={{
                  background: shipped ? DT.successSoft : DT.goldSoft,
                  color: shipped ? DT.success : DT.goldDark,
                  fontSize: 11, fontWeight: 700,
                  padding: '3px 9px', borderRadius: 99,
                  whiteSpace: 'nowrap',
                }}>
                  {shipped ? 'כבר פעיל' : 'בקרוב'}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Gold primary CTA → /contact — reuses the early-access
            funnel the PremiumGateDialog already pipes interest into. */}
        <Link
          to="/contact"
          style={{
            ...FONT, display: 'inline-flex', alignItems: 'center', gap: 8,
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink, fontWeight: 800,
            padding: '14px 22px', borderRadius: 12,
            fontSize: 15, textDecoration: 'none',
            boxShadow: '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          בקרוב — צרו קשר לקבלת גישה מוקדמת
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>

        {/* Footer — italic note explaining *why* the feature is
            gated, and where to keep messaging leads in the meantime. */}
        <p style={{
          fontStyle: 'italic', fontSize: 12, lineHeight: 1.7,
          color: DT.muted, margin: '22px 0 0',
          maxWidth: 560,
        }}>
          התכונה תופעל כאשר Meta יאשר את Estia כ-Tech Provider. כרגע שליחת
          הודעות נעשית דרך קישורי WhatsApp / SMS ישירים.
        </p>
      </div>
    </div>
  );
}
