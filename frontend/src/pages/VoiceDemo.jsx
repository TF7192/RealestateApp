// /voice-demo — standalone surface that now wraps the shared
// VoiceCaptureDialog (which is also mounted from /customers/new and
// /properties/new). This page stays as a quick-access demo; the "use
// values" button navigates to whichever create form fits the
// detected kind.

import VoiceCaptureDialog from '../components/VoiceCaptureDialog';

const DT = { cream: '#f7f3ec', ink: '#1e1a14', muted: '#6b6356' };
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function VoiceDemo() {
  return (
    <div dir="rtl" style={{
      ...FONT, color: DT.ink, minHeight: '100vh',
      background: DT.cream, padding: '28px 20px 60px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6, margin: '8px 0 4px' }}>
          הקלטה חכמה
        </h1>
        <p style={{ color: DT.muted, margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }}>
          תארו/י ליד או נכס בקול חופשי (עד 2 דקות). השרת מתמלל (Whisper)
          ושולף שדות (Claude Haiku), ואפשר לערוך הכל לפני שיוצרים את הרשומה.
        </p>
        <div style={{
          background: '#fff', borderRadius: 18,
          border: '1px solid rgba(30,26,20,0.08)',
          padding: 18,
          boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
        }}>
          <VoiceCaptureDialog inline open preferKind="auto" />
        </div>
      </div>
    </div>
  );
}
