// Forgot-password entry — request a reset link via email.
// Visual match to the Cream & Gold Login page so the flow feels like
// one cohesive auth surface. Always shows the success state after a
// submit, even if the email isn't on file, so attackers can't
// enumerate registered addresses by watching the response.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import LogoMark from '../components/LogoMark';

const DT = {
  cream: '#f7f3ec', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('כתובת אימייל לא תקינה'); return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.forgotPassword(email.trim());
      // In non-prod the backend returns the token so we can deep-link
      // the reset page without an email provider wired up yet. In prod
      // the response is bare and the user waits for the email.
      if (res?.devToken) setDevToken(res.devToken);
      setSent(true);
    } catch (err) {
      setError(err?.message || 'שליחה נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" lang="he" style={{
      ...FONT, background: DT.cream, color: DT.ink, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: DT.cream4, border: `1px solid ${DT.border}`,
        borderRadius: 18, padding: '32px 28px',
        boxShadow: '0 30px 80px rgba(30,26,20,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {/* Sprint 8 brand sweep — auth card is cream, tone="ink". */}
          <LogoMark size={36} tone="ink" />
          <div style={{ fontSize: 22, fontWeight: 800 }}>Estia</div>
        </div>

        {!sent ? (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 6px' }}>
              שכחת סיסמה?
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: '0 0 20px' }}>
              מלא/י את כתובת האימייל ונשלח קישור לאיפוס.
            </p>
            <form onSubmit={submit}>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: DT.ink2, marginBottom: 6 }}>
                  אימייל
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: DT.white, border: `1px solid ${DT.border}`,
                  borderRadius: 10, padding: '0 14px',
                }}>
                  <Mail size={16} style={{ color: DT.muted }} aria-hidden="true" />
                  <input
                    type="email" inputMode="email" dir="ltr" autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.co.il"
                    required autoFocus
                    style={{
                      ...FONT, flex: 1, padding: '13px 0',
                      border: 'none', outline: 'none', background: 'transparent',
                      fontSize: 15, color: DT.ink, minWidth: 0, textAlign: 'left',
                    }}
                  />
                </div>
              </label>
              {error && (
                <div role="alert" style={{
                  background: 'rgba(185,28,28,0.08)', color: DT.danger,
                  padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12,
                }}>{error}</div>
              )}
              <button
                type="submit" disabled={submitting}
                style={{
                  ...FONT, width: '100%',
                  background: submitting ? '#d8cfbf'
                    : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                  color: DT.ink, fontWeight: 800,
                  padding: '14px 18px', borderRadius: 12, border: 'none',
                  cursor: submitting ? 'wait' : 'pointer', fontSize: 15,
                  boxShadow: submitting ? 'none'
                    : '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {submitting ? 'שולח…' : 'שליחת קישור לאיפוס'}
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
            </form>
          </>
        ) : (
          <>
            <CheckCircle2 size={42} style={{ color: DT.gold, marginBottom: 14 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' }}>
              אם הכתובת רשומה, הקישור נשלח.
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: '0 0 16px', lineHeight: 1.7 }}>
              בדוק את תיבת הדואר של <strong>{email}</strong>. הקישור תקף ל-30 דקות.
              אם לא הגיע תוך כמה דקות, כדאי לבדוק גם בתיקיית הספאם.
            </p>
            {devToken && (
              <div style={{
                background: 'rgba(180,139,76,0.12)', border: `1px dashed ${DT.gold}`,
                borderRadius: 10, padding: 12, marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, color: DT.goldDark, fontWeight: 700, marginBottom: 6 }}>
                  Dev-only · קישור ישיר:
                </div>
                <Link
                  to={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  style={{ fontSize: 12, color: DT.gold, wordBreak: 'break-all' }}
                >
                  /reset-password?token={devToken}
                </Link>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: DT.muted }}>
          <Link to="/login" style={{ color: DT.gold, fontWeight: 700, textDecoration: 'none' }}>
            ← חזרה להתחברות
          </Link>
        </div>
      </div>
    </div>
  );
}
