// Login — 1:1 port of the claude.ai/design bundle's DLogin + ScreenLogin
// screens (estia-new-project/project/src/desktop/screens-auth.jsx and
// estia-new-project/project/src/mobile/screens-auth.jsx). Inline styles
// and tokens mirror the bundle byte-for-byte. Only the design's
// `navigate('dashboard')` stubs are replaced with the production auth
// handlers (email/password, Google OAuth, Sign in with Apple).

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, User, Phone, Apple, ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isNative, isIOS } from '../native/platform';
import { Browser } from '@capacitor/browser';
import api from '../lib/api';

// ─── Tokens lifted verbatim from the bundle (DT / T — merged) ──
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function Login() {
  const { login, signup } = useAuth();
  const [searchParams] = useSearchParams();
  const initialSignup = searchParams.get('flow') === 'signup';
  const [mode, setMode] = useState(initialSignup ? 'signup' : 'login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const isNarrow = useMedia('(max-width: 900px)');

  const handleGoogle = async () => {
    if (isNative()) {
      const origin = window.location.origin.startsWith('http')
        ? window.location.origin
        : 'https://estia.co.il';
      await Browser.open({
        url: `${origin}/api/auth/google?native=1`,
        presentationStyle: 'popover',
      });
      return;
    }
    const here = window.location.pathname + window.location.search;
    const onLogin = window.location.pathname === '/login';
    const redirect = (onLogin || window.location.pathname === '/') ? '/dashboard' : here;
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  const handleApple = async () => {
    if (!isIOS()) return;
    try {
      setError('');
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const res = await SignInWithApple.authorize({
        clientId: 'com.estia.agent',
        redirectURI: 'https://estia.co.il/api/auth/apple/native-exchange',
        scopes: 'email name',
        state: Math.random().toString(36).slice(2),
      });
      const r = res?.response || {};
      await api.appleNativeExchange({
        identityToken: r.identityToken,
        user: r.user,
        email: r.email,
        givenName: r.givenName,
        familyName: r.familyName,
      });
      window.location.replace(`${window.location.origin}/dashboard`);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/cancel/i.test(msg) || err?.code === '1001') return;
      setError(err?.message || 'הכניסה עם Apple נכשלה');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isSignup) {
        if (form.password.length < 8) throw new Error('סיסמה חייבת להיות לפחות 8 תווים');
        await signup({
          email: form.email,
          password: form.password,
          role: 'AGENT',
          displayName: form.displayName || form.email.split('@')[0],
          phone: form.phone || undefined,
        });
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (err) {
      setError(err.message || (isSignup ? 'הרשמה נכשלה' : 'התחברות נכשלה'));
    } finally {
      setSubmitting(false);
    }
  };

  // Narrow viewports render the bundle's ScreenLogin layout (single
  // cream column). Wider ones render DLogin's split-pane (dark brand
  // gradient left, cream form right).
  if (isNarrow) return <MobileLogin {...{ mode, isSignup, form, update, showPass, setShowPass, error, submitting, handleSubmit, handleGoogle, handleApple, setMode, setError }} />;
  return <DesktopLogin {...{ mode, isSignup, form, update, showPass, setShowPass, error, submitting, handleSubmit, handleGoogle, handleApple, setMode, setError }} />;
}

function useMedia(query) {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(query);
    const h = () => setMatch(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h);
    };
  }, [query]);
  return match;
}

// ═══════════════════════════════════════════════════════════════════
// Desktop · DLogin — ink/gold-dark brand pane + cream form pane
// ═══════════════════════════════════════════════════════════════════
function DesktopLogin(p) {
  const { isSignup, form, update, showPass, setShowPass, error, submitting,
    handleSubmit, handleGoogle, handleApple, setMode, setError } = p;
  return (
    <div dir="rtl" style={{
      ...FONT, width: '100%', minHeight: '100vh', display: 'flex', background: DT.cream,
    }}>
      {/* Left: brand panel */}
      <div style={{
        flex: 1, background: `linear-gradient(160deg, ${DT.ink} 0%, #2a241b 60%, ${DT.goldDark} 120%)`,
        color: DT.cream, padding: 60, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'absolute', top: -60, left: -60, width: 240, height: 240, borderRadius: 99, background: DT.goldSoft, filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: -40, right: -40, width: 200, height: 200, borderRadius: 99, background: 'rgba(217,183,116,0.15)', filter: 'blur(30px)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink, fontWeight: 900, fontSize: 22,
          }}>E</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Estia</div>
        </div>
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 12, color: DT.goldLight, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>נדל״ן · AI · בעברית</div>
          <h1 style={{
            fontSize: 48, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1,
            marginTop: 14, color: DT.cream,
          }}>
            הזמן שלך<br />
            <span style={{
              background: `linear-gradient(135deg, ${DT.goldLight}, ${DT.gold})`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>שווה יותר.</span>
          </h1>
          <div style={{ fontSize: 16, color: 'rgba(247,243,236,0.7)', lineHeight: 1.7, marginTop: 18 }}>
            Estia מחליף את Excel + WhatsApp + היומן בכלי אחד שחושב בעברית,
            מבין את השוק הישראלי ועובד איתך.
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'grid', gap: 10 }}>
            {[
              'AI שכותב תיאור נכס מקצועי בלחיצה',
              'התאמת לידים לנכסים אוטומטית',
              'סנכרון מלא בין דסקטופ ונייד',
              '30 יום Premium חינם · בלי כרטיס אשראי',
            ].map((b) => (
              <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(247,243,236,0.88)', fontSize: 14 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 99,
                  background: 'rgba(217,183,116,0.2)', color: DT.goldLight,
                  display: 'inline-grid', placeItems: 'center', flex: 'none',
                }}><Sparkles size={12} /></span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ position: 'relative', fontSize: 12, color: 'rgba(247,243,236,0.4)' }}>
          © 2026 Estia · תל אביב
        </div>
      </div>

      {/* Right: form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8, margin: 0, color: DT.ink }}>
            {isSignup ? 'צור חשבון' : 'ברוך שובך'}
          </h2>
          <div style={{ fontSize: 14, color: DT.muted, marginTop: 6 }}>
            {isSignup ? 'הצטרפו · 30 יום Premium חינם' : 'התחבר לחשבון Estia שלך'}
          </div>
          <form onSubmit={handleSubmit} style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSignup && (
              <>
                <DField label="שם מלא" placeholder="אדם ברקוביץ" value={form.displayName} onChange={(v) => update('displayName', v)} icon={<User size={15} />} />
                <DField label="טלפון (רשות)" type="tel" inputMode="tel" dir="ltr" placeholder="050-0000000" value={form.phone} onChange={(v) => update('phone', v)} icon={<Phone size={15} />} />
              </>
            )}
            <DField label="אימייל" type="email" inputMode="email" dir="ltr" placeholder="name@domain.co.il" value={form.email} onChange={(v) => update('email', v)} icon={<Mail size={15} />} />
            <DField
              label="סיסמה" type={showPass ? 'text' : 'password'} placeholder="••••••••"
              value={form.password} onChange={(v) => update('password', v)} icon={<Lock size={15} />}
              adornment={(
                <button type="button" onClick={() => setShowPass((s) => !s)}
                  style={{ background: 'transparent', border: 'none', color: DT.muted, cursor: 'pointer', padding: 4, display: 'inline-flex' }}
                  aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}>
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              )}
            />
            {!isSignup && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.muted }}>
                  <input type="checkbox" defaultChecked /> זכור אותי
                </label>
                <a href="mailto:hello@estia.co.il?subject=איפוס סיסמה"
                  style={{ color: DT.gold, fontWeight: 700, textDecoration: 'none' }}>שכחת סיסמה?</a>
              </div>
            )}
            {error && <div style={{ background: 'rgba(185,28,28,0.08)', color: DT.danger, padding: '10px 12px', borderRadius: 10, fontSize: 13 }} role="alert">{error}</div>}
            <button type="submit" disabled={submitting} style={{
              ...FONT, background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink, border: 'none', padding: 14, borderRadius: 11, fontSize: 15, fontWeight: 800,
              cursor: submitting ? 'wait' : 'pointer', marginTop: 6,
              boxShadow: '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'רק רגע…' : isSignup ? 'צור חשבון' : 'התחברות'}
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0', color: DT.muted, fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: DT.border }} /> או
              <div style={{ flex: 1, height: 1, background: DT.border }} />
            </div>
            <GhostBtn onClick={handleGoogle}><GoogleMark />המשך עם Google</GhostBtn>
            {isIOS() && (
              <GhostBtn onClick={handleApple}>
                <Apple size={17} fill="currentColor" aria-hidden="true" />
                המשך עם Apple
              </GhostBtn>
            )}
          </form>
          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: DT.muted }}>
            {isSignup ? 'יש לך כבר חשבון? ' : 'חדש ב-Estia? '}
            <button type="button" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}
              style={{ background: 'transparent', border: 'none', color: DT.gold, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {isSignup ? 'התחבר' : 'צור חשבון'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Mobile · ScreenLogin — single cream column, sticky logo, gold CTA
// ═══════════════════════════════════════════════════════════════════
function MobileLogin(p) {
  const { isSignup, form, update, showPass, setShowPass, error, submitting,
    handleSubmit, handleGoogle, handleApple, setMode, setError } = p;
  return (
    <div dir="rtl" style={{
      ...FONT, background: DT.cream, color: DT.ink, minHeight: '100vh',
      display: 'flex', flexDirection: 'column', padding: '22px 22px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          display: 'grid', placeItems: 'center', color: DT.ink, fontWeight: 900, fontSize: 17,
        }}>E</div>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Estia</div>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.12, margin: '0 0 6px' }}>
        {isSignup ? 'צור חשבון' : 'ברוכים השבים'}
      </h1>
      <p style={{ fontSize: 13.5, color: DT.muted, margin: '0 0 20px' }}>
        {isSignup ? 'הצטרפו · 30 יום Premium חינם' : 'התחברו כדי להמשיך לנהל את העסק שלכם.'}
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {isSignup && (
          <>
            <MField label="שם מלא" placeholder="אדם ברקוביץ" value={form.displayName} onChange={(v) => update('displayName', v)} icon={<User size={16} />} />
            <MField label="טלפון (רשות)" type="tel" inputMode="tel" dir="ltr" placeholder="050-0000000" value={form.phone} onChange={(v) => update('phone', v)} icon={<Phone size={16} />} />
          </>
        )}
        <MField label="אימייל" type="email" inputMode="email" dir="ltr" placeholder="name@domain.co.il" value={form.email} onChange={(v) => update('email', v)} icon={<Mail size={16} />} />
        <MField
          label="סיסמה" type={showPass ? 'text' : 'password'} placeholder="••••••••"
          value={form.password} onChange={(v) => update('password', v)} icon={<Lock size={16} />}
          rightAdorn={(
            <button type="button" onClick={() => setShowPass((s) => !s)}
              style={{ background: 'transparent', border: 'none', color: DT.muted, cursor: 'pointer', padding: 4, display: 'inline-flex' }}
              aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}>
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          )}
        />
        {!isSignup && (
          <div style={{ textAlign: 'left', marginBottom: 18 }}>
            <a href="mailto:hello@estia.co.il?subject=איפוס סיסמה" style={{ fontSize: 12, color: DT.gold, fontWeight: 600 }}>שכחתי סיסמה</a>
          </div>
        )}
        {error && <div style={{ background: 'rgba(185,28,28,0.08)', color: DT.danger, padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 12 }} role="alert">{error}</div>}
        <PrimaryBtn type="submit" disabled={submitting}>
          {submitting ? 'רק רגע…' : isSignup ? 'צור חשבון' : 'התחברות'}
          <ArrowLeft size={15} aria-hidden="true" />
        </PrimaryBtn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: DT.border }} />
          <div style={{ fontSize: 11, color: DT.muted }}>או</div>
          <div style={{ flex: 1, height: 1, background: DT.border }} />
        </div>
        <GhostBtn onClick={handleGoogle}><GoogleMark />המשך עם Google</GhostBtn>
        {isIOS() && (
          <>
            <div style={{ height: 8 }} />
            <GhostBtn onClick={handleApple}>
              <Apple size={16} fill="currentColor" aria-hidden="true" />
              המשך עם Apple
            </GhostBtn>
          </>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 24, textAlign: 'center', fontSize: 13, color: DT.muted }}>
          {isSignup ? 'יש לך כבר חשבון? ' : 'אין לכם חשבון? '}
          <button type="button" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}
            style={{ background: 'transparent', border: 'none', color: DT.gold, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            {isSignup ? 'התחבר' : 'הרשמה חינם ←'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Desktop field ───────────────────────────────────────────
function DField({ label, value, onChange, icon, adornment, ...rest }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: DT.ink2, marginBottom: 6 }}>{label}</div>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 10, padding: '0 12px',
      }}>
        {icon && <span style={{ color: DT.muted, display: 'inline-flex' }}>{icon}</span>}
        <input
          {...rest}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            ...FONT, flex: 1, padding: '12px 0',
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, color: DT.ink, minWidth: 0, textAlign: rest.dir === 'ltr' ? 'left' : 'right',
          }}
        />
        {adornment}
      </div>
    </label>
  );
}

// ─── Mobile field ────────────────────────────────────────────
function MField({ label, value, onChange, icon, rightAdorn, hint, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: DT.ink, marginBottom: 6 }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: DT.white,
        border: `1.5px solid ${focus ? DT.gold : DT.border}`,
        borderRadius: 12, padding: '0 14px',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: focus ? '0 0 0 4px rgba(180,139,76,0.12)' : 'none',
      }}>
        {icon && <span style={{ color: DT.muted, display: 'inline-flex' }}>{icon}</span>}
        <input
          {...rest}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            ...FONT, flex: 1, border: 'none', outline: 'none', background: 'transparent',
            padding: '13px 0', fontSize: 15, color: DT.ink, minWidth: 0,
            textAlign: rest.dir === 'ltr' ? 'left' : 'right',
          }}
        />
        {rightAdorn}
      </div>
      {hint && <div style={{ fontSize: 11, color: DT.muted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

// ─── Mobile primary / ghost buttons (bundle's PrimaryBtn/GhostBtn) ─
function PrimaryBtn({ children, onClick, disabled, type = 'button' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...FONT,
      background: disabled ? '#d8cfbf' : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
      color: DT.ink, fontWeight: 700, padding: '14px 18px', borderRadius: 12, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 15, width: '100%',
      boxShadow: disabled ? 'none' : '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>{children}</button>
  );
}
function GhostBtn({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...FONT, background: DT.white, color: DT.ink, fontWeight: 600,
      padding: '13px 16px', borderRadius: 12, border: `1px solid ${DT.borderStrong}`,
      cursor: 'pointer', fontSize: 14, width: '100%',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>{children}</button>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
