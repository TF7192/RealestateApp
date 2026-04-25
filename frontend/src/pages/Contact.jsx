// Sprint 5.1 — Contact page.
//
// Public "צרו קשר" form — referenced from the PremiumGateDialog's
// primary CTA and from the landing footer. Posts to /api/contact,
// which ships mail to talfuks1234@gmail.com via SES.
//
// Visual style matches ForgotPassword / the rest of the auth surface:
// inline Cream & Gold tokens, Assistant/Heebo font, gold primary
// submit, success state that replaces the form after a successful
// send.
//
// SEC-044 — captcha is not yet wired on this form. Abuse is mitigated
// by the per-IP sliding-window rate limit on the backend (5 / hour, see
// SEC-033 in backend/src/routes/contact.ts). Add hCaptcha or a
// honeypot field if SES bounces start indicating bot traffic.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, User, MessageSquare, ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import api from '../lib/api';
import LogoMark from '../components/LogoMark';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function Contact() {
  const [form, setForm] = useState({
    fromName:  '',
    fromEmail: '',
    subject:   '',
    body:      '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent]             = useState(false);
  const [error, setError]           = useState('');

  // Shared destructuring setter — matches the pattern every form in
  // the app uses (see NewLead / NewProperty). Keeps one-line writes
  // at each input.
  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const subject = form.subject.trim();
    const body    = form.body.trim();
    if (!subject) return setError('אנא כתבו נושא להודעה');
    if (!body)    return setError('אנא כתבו את תוכן ההודעה');
    if (form.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.fromEmail.trim())) {
      return setError('כתובת האימייל לא תקינה');
    }

    setSubmitting(true);
    try {
      await api.sendContact({
        subject,
        body,
        fromName:  form.fromName.trim()  || null,
        fromEmail: form.fromEmail.trim() || null,
      });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'שליחה נכשלה — נסו שוב');
    } finally {
      setSubmitting(false);
    }
  };

  const inputWrap = {
    display: 'flex', alignItems: 'center', gap: 8,
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 10, padding: '0 14px',
  };
  const inputStyle = {
    ...FONT, flex: 1, padding: '13px 0',
    border: 'none', outline: 'none', background: 'transparent',
    fontSize: 15, color: DT.ink, minWidth: 0,
  };
  const labelTitle = { fontSize: 12, fontWeight: 700, color: DT.ink2, marginBottom: 6 };

  return (
    <div dir="rtl" lang="he" style={{
      ...FONT, background: DT.cream, color: DT.ink, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
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
              צרו קשר
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: '0 0 22px', lineHeight: 1.7 }}>
              שלחו לנו הודעה ונחזור אליכם בהקדם. צוות Estia קורא כל פנייה.
            </p>

            <form onSubmit={submit} noValidate>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={labelTitle}>שם מלא (לא חובה)</div>
                <div style={inputWrap}>
                  <User size={16} style={{ color: DT.muted }} aria-hidden="true" />
                  <input
                    type="text"
                    value={form.fromName}
                    onChange={(e) => update('fromName', e.target.value)}
                    placeholder="ישראל ישראלי"
                    autoComplete="name"
                    style={inputStyle}
                  />
                </div>
              </label>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={labelTitle}>אימייל לתשובה (לא חובה)</div>
                <div style={inputWrap}>
                  <Mail size={16} style={{ color: DT.muted }} aria-hidden="true" />
                  <input
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    autoComplete="email"
                    value={form.fromEmail}
                    onChange={(e) => update('fromEmail', e.target.value)}
                    placeholder="name@domain.co.il"
                    style={{ ...inputStyle, textAlign: 'left' }}
                  />
                </div>
              </label>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={labelTitle}>נושא</div>
                <div style={inputWrap}>
                  <MessageSquare size={16} style={{ color: DT.muted }} aria-hidden="true" />
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => update('subject', e.target.value)}
                    placeholder="שאלה על המערכת"
                    required
                    style={inputStyle}
                  />
                </div>
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={labelTitle}>הודעה</div>
                <textarea
                  value={form.body}
                  onChange={(e) => update('body', e.target.value)}
                  rows={7}
                  required
                  placeholder="ספרו לנו איך נוכל לעזור…"
                  style={{
                    ...FONT, width: '100%', padding: '12px 14px',
                    background: DT.white, border: `1px solid ${DT.border}`,
                    borderRadius: 10, fontSize: 15, color: DT.ink,
                    resize: 'vertical', minHeight: 140, outline: 'none',
                  }}
                />
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
                {submitting ? 'שולח…' : 'שליחה'}
                <Send size={15} aria-hidden="true" />
              </button>
            </form>
          </>
        ) : (
          <>
            <CheckCircle2 size={48} style={{ color: DT.gold, marginBottom: 14 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' }}>
              ההודעה נשלחה — תודה!
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: '0 0 16px', lineHeight: 1.7 }}>
              קיבלנו את הפנייה שלכם וניצור קשר בהקדם.
              {form.fromEmail ? <> נענה לכתובת <strong dir="ltr">{form.fromEmail}</strong>.</> : null}
            </p>
          </>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: DT.muted }}>
          <Link to="/" style={{ color: DT.gold, fontWeight: 700, textDecoration: 'none' }}>
            <ArrowLeft size={13} style={{ display: 'inline', verticalAlign: 'middle' }} aria-hidden="true" />
            {' '}חזרה לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
