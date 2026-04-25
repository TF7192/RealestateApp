// /voice-demo — standalone surface that now wraps the shared
// VoiceCaptureDialog (which is also mounted from /customers/new and
// /properties/new). This page stays as a quick-access demo; the "use
// values" button navigates to whichever create form fits the
// detected kind.
//
// Gated on the agent's premium flag — non-premium users get a
// teaser screen with an upgrade CTA instead of the full recording
// surface. The /api/voice/* routes are also premium-gated server-
// side; this is the client-side equivalent so a free-tier user
// can't even start a recording (which used to wait for the upload
// to fail before surfacing an error).

import { Sparkles, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import VoiceCaptureDialog from '../components/VoiceCaptureDialog';
import AiQuotaChips from '../components/AiQuotaChips';
import { useAuth } from '../lib/auth';

const DT = {
  cream: '#f7f3ec', cream4: '#fbf7f0',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  border: 'rgba(30,26,20,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function VoiceDemo() {
  const { user } = useAuth();
  const isPremium = !!user?.isPremium;

  return (
    <div dir="rtl" style={{
      ...FONT, color: DT.ink, minHeight: '100vh',
      background: DT.cream, padding: '28px 20px 60px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 4,
        }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6, margin: '8px 0 0' }}>
            הקלטה חכמה
          </h1>
          {isPremium && <AiQuotaChips kind="voice" />}
        </div>
        <p style={{ color: DT.muted, margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }}>
          תארו/י ליד או נכס בקול חופשי (עד 2 דקות). השרת מתמלל (Whisper)
          ושולף שדות (Claude Haiku), ואפשר לערוך הכל לפני שיוצרים את הרשומה.
        </p>
        {isPremium ? (
          <div style={{
            background: '#fff', borderRadius: 18,
            border: `1px solid ${DT.border}`,
            padding: 18,
            boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
          }}>
            <VoiceCaptureDialog inline open preferKind="auto" />
          </div>
        ) : (
          <PremiumLockedTeaser />
        )}
      </div>
    </div>
  );
}

function PremiumLockedTeaser() {
  return (
    <div style={{
      background: `linear-gradient(160deg, ${DT.cream4} 0%, #fff 100%)`,
      border: `1px solid ${DT.gold}`,
      borderRadius: 18,
      padding: 32,
      textAlign: 'center',
      boxShadow: '0 4px 16px rgba(180,139,76,0.12)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
        color: DT.ink,
        display: 'grid', placeItems: 'center',
        margin: '0 auto 14px',
        boxShadow: '0 6px 18px rgba(180,139,76,0.32)',
      }}>
        <Lock size={26} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: DT.ink }}>
        הקלטה חכמה זמינה למנויי Premium
      </h2>
      <p style={{ fontSize: 14, color: DT.muted, lineHeight: 1.7, margin: '0 0 18px' }}>
        תיאור קולי שמתורגם אוטומטית לטופס מלא של ליד או נכס — מהיר פי 5 מהקלדה ידנית.
        זמין במסלול Premium יחד עם Estia AI, סיכומי פגישות קוליים וניתוח הצעות.
      </p>
      <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href="mailto:hello@estia.co.il?subject=שדרוג ל-Premium"
          style={{
            ...FONT,
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink,
            padding: '11px 22px', borderRadius: 12,
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
            display: 'inline-flex', gap: 6, alignItems: 'center',
            boxShadow: '0 6px 18px rgba(180,139,76,0.32)',
          }}
        >
          <Sparkles size={15} /> שדרגו ל-Premium
        </a>
        <Link
          to="/dashboard"
          style={{
            ...FONT,
            background: '#fff', color: DT.ink,
            padding: '11px 22px', borderRadius: 12,
            border: `1px solid ${DT.border}`,
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
          }}
        >חזרה לעמוד הבית</Link>
      </div>
    </div>
  );
}
