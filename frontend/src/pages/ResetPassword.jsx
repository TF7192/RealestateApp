// Reset-password — consumes the token from ?token= and submits a new
// password. On success redirects to /login. Server enforces token
// single-use + 30-minute expiry, so all client-side checks are just
// UX: empty password, too short, mismatch.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react';
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

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => navigate('/login', { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [done, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!token) { setError('חסר טוקן איפוס'); return; }
    if (password.length < 8) { setError('סיסמה חייבת להיות לפחות 8 תווים'); return; }
    if (password !== confirm) { setError('הסיסמאות לא תואמות'); return; }
    setError('');
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err?.message || 'האיפוס נכשל — ייתכן שהקישור פג תוקף');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" lang="he" style={{
      ...FONT, background: DT.cream, color: DT.ink, minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      paddingTop: 'calc(24px + env(safe-area-inset-top))',
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

        {!done ? (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 6px' }}>
              איפוס סיסמה
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: '0 0 20px' }}>
              בחר/י סיסמה חדשה — לפחות 8 תווים.
            </p>
            <form onSubmit={submit}>
              <PasswordField
                label="סיסמה חדשה" icon={<Lock size={16} />}
                value={password} onChange={setPassword}
                show={showPass} onToggleShow={() => setShowPass((s) => !s)}
                autoFocus
              />
              <PasswordField
                label="אימות סיסמה" icon={<Lock size={16} />}
                value={confirm} onChange={setConfirm}
                show={showConfirm} onToggleShow={() => setShowConfirm((s) => !s)}
              />
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
                {submitting ? 'שומר…' : 'שמירת סיסמה חדשה'}
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
            </form>
          </>
        ) : (
          <>
            <CheckCircle2 size={42} style={{ color: DT.gold, marginBottom: 14 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' }}>
              הסיסמה עודכנה.
            </h1>
            <p style={{ fontSize: 14, color: DT.muted, margin: 0 }}>
              מיד תועברו להתחברות…
            </p>
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

function PasswordField({ label, icon, value, onChange, show, onToggleShow, autoFocus }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: DT.ink2, marginBottom: 6 }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 10, padding: '0 14px',
      }}>
        {icon && <span style={{ color: DT.muted, display: 'inline-flex' }}>{icon}</span>}
        <input
          type={show ? 'text' : 'password'} autoComplete="new-password"
          value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••" required autoFocus={autoFocus}
          minLength={8}
          style={{
            ...FONT, flex: 1, padding: '13px 0',
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 15, color: DT.ink, minWidth: 0, textAlign: 'right',
          }}
        />
        <button
          type="button" onClick={onToggleShow}
          aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'}
          style={{
            background: 'transparent', border: 'none', color: DT.muted,
            cursor: 'pointer', padding: 8, display: 'inline-flex',
          }}
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}
