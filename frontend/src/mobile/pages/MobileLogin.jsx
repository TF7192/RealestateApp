import { useState } from 'react';
import { Mail, Lock, User, ArrowLeft, Fingerprint, Building2, UserCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { haptics, setItem, Keys } from '../../native';

export default function MobileLogin() {
  const { login, signup, loginWithGoogle } = useAuth();
  const [role, setRole] = useState('AGENT');
  const [mode, setMode] = useState('welcome'); // 'welcome' | 'signin' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const u = (f, v) => setForm((p) => ({ ...p, [f]: v }));

  const onGoogle = async () => {
    haptics.press();
    setErr(''); setBusy(true);
    try {
      await loginWithGoogle(role);
      await setItem(Keys.AUTH_USER, { role });
    } catch (e) {
      haptics.err();
      setErr(e.message || 'שגיאת התחברות');
    } finally { setBusy(false); }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = mode === 'signin'
        ? { email: form.email, password: form.password }
        : { ...form, role };
      mode === 'signin' ? await login(data) : await signup(data);
      haptics.success();
      await setItem(Keys.AUTH_USER, { role });
    } catch (e) {
      haptics.err();
      setErr(e.message || 'שגיאה. נסה שוב.');
    } finally { setBusy(false); }
  };

  return (
    <div className="m-login">
      <div className="m-login-backdrop" />
      <div className="m-login-noise" />

      {mode === 'welcome' ? (
        <div className="m-login-welcome m-stagger">
          <div className="m-login-brand">
            <span className="m-login-diamond">◆</span>
            <span>Estia</span>
          </div>
          <h1 className="m-login-title">ניהול נדל״ן.<br />בגובה היד.</h1>
          <p className="m-login-sub">פייפליין נכסים ולידים, בלחיצה אחת.</p>

          <div className="m-login-role">
            <button
              className={`m-login-role-btn ${role === 'AGENT' ? 'active' : ''}`}
              onClick={() => { haptics.select(); setRole('AGENT'); }}
            >
              <Building2 size={18} />
              <div>
                <div>סוכן נדל״ן</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  כלי העבודה היומיומי
                </div>
              </div>
              {role === 'AGENT' && <UserCheck size={16} style={{ color: 'var(--gold)', marginRight: 'auto' }} />}
            </button>
            <button
              className={`m-login-role-btn ${role === 'CUSTOMER' ? 'active' : ''}`}
              onClick={() => { haptics.select(); setRole('CUSTOMER'); }}
            >
              <User size={18} />
              <div>
                <div>לקוח / מתעניין</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  מצא את הבית הבא
                </div>
              </div>
              {role === 'CUSTOMER' && <UserCheck size={16} style={{ color: 'var(--gold)', marginRight: 'auto' }} />}
            </button>
          </div>

          <button className="m-login-google" onClick={onGoogle} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2L31 33.2c-2 1.5-4.4 2.4-7 2.4-5.2 0-9.7-3.3-11.3-8H6l-.1.1C9.2 39.5 15.9 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.4 4.9C42.5 35.3 44 30 44 24c0-1.3-.1-2.5-.4-3.5z"/>
            </svg>
            המשך עם Google
          </button>

          <div className="m-login-divider"><span>או</span></div>

          <button className="m-login-mail" onClick={() => { haptics.tap(); setMode('signin'); }}>
            <Mail size={16} />
            התחבר עם אימייל
          </button>
          <button className="m-login-signup" onClick={() => { haptics.tap(); setMode('signup'); }}>
            אין חשבון? <strong>הרשמה חינם</strong>
          </button>

          {err && <div className="m-login-err">{err}</div>}
        </div>
      ) : (
        <form className="m-login-form m-stagger" onSubmit={onSubmit}>
          <button type="button" className="m-login-back" onClick={() => { haptics.tap(); setMode('welcome'); }}>
            <ArrowLeft size={16} /> חזרה
          </button>
          <h2 className="m-login-heading">
            {mode === 'signin' ? 'שלום שוב' : 'ברוך הבא ל-Estia'}
          </h2>
          <p className="m-login-sub-sm">
            {mode === 'signin' ? 'הזן את פרטי החשבון שלך' : 'הקמת חשבון חדשה לוקחת דקה'}
          </p>

          {mode === 'signup' && (
            <div className="m-field">
              <label className="m-label">שם מלא</label>
              <div className="m-input-wrap">
                <User size={16} />
                <input className="m-input" value={form.displayName} onChange={(e) => u('displayName', e.target.value)} required autoFocus autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
              </div>
            </div>
          )}

          <div className="m-field">
            <label className="m-label">אימייל</label>
            <div className="m-input-wrap">
              <Mail size={16} />
              <input type="email" inputMode="email" autoComplete="email" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="next" className="m-input" value={form.email} onChange={(e) => u('email', e.target.value)} required dir="ltr" style={{ textAlign: 'right' }} />
            </div>
          </div>

          {mode === 'signup' && (
            <div className="m-field">
              <label className="m-label">טלפון</label>
              <div className="m-input-wrap">
                <input type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" className="m-input" value={form.phone} onChange={(e) => u('phone', e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
            </div>
          )}

          <div className="m-field">
            <label className="m-label">סיסמה</label>
            <div className="m-input-wrap">
              <Lock size={16} />
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} enterKeyHint="go" className="m-input" value={form.password} onChange={(e) => u('password', e.target.value)} required minLength={6} />
            </div>
          </div>

          {err && <div className="m-login-err">{err}</div>}

          <button type="submit" className="m-action-bar-btn primary" disabled={busy} style={{ marginTop: 14 }}>
            {busy ? '…' : (mode === 'signin' ? 'התחבר' : 'צור חשבון')}
          </button>

          <button
            type="button"
            className="m-login-alt"
            onClick={() => { haptics.tap(); setMode(mode === 'signin' ? 'signup' : 'signin'); }}
          >
            {mode === 'signin' ? 'אין חשבון? הירשם' : 'יש חשבון? התחבר'}
          </button>
        </form>
      )}

      <style>{`
        .m-login {
          min-height: 100dvh; padding: calc(var(--m-safe-top) + 40px) 24px calc(var(--m-safe-bottom) + 24px);
          position: relative; overflow: hidden; color: var(--text-primary);
        }
        .m-login-backdrop {
          position: absolute; inset: 0; z-index: 0;
          background:
            radial-gradient(60% 40% at 90% -5%, rgba(201,169,110,0.22), transparent 55%),
            radial-gradient(55% 45% at 0% 100%, rgba(201,169,110,0.14), transparent 55%),
            var(--bg-primary);
        }
        .m-login-noise {
          position: absolute; inset: 0; z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.03; pointer-events: none;
        }
        .m-login-welcome, .m-login-form { position: relative; z-index: 2; }
        .m-login-brand {
          display: inline-flex; align-items: center; gap: 10px;
          font-family: var(--font-display); font-size: 22px;
          color: var(--gold-light); margin-bottom: 34px;
          letter-spacing: -0.5px;
        }
        .m-login-diamond {
          display: grid; place-items: center; width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--gold-light), var(--gold-dim));
          color: var(--bg-primary); font-size: 18px;
        }
        .m-login-title {
          font-family: var(--font-display); font-size: 42px; line-height: 1.05;
          letter-spacing: -1px; font-weight: 400; color: var(--text-primary);
        }
        .m-login-sub {
          margin-top: 10px; font-size: 15px; color: var(--text-secondary);
          line-height: 1.6;
        }
        .m-login-role { display: flex; flex-direction: column; gap: 10px; margin-top: 30px; }
        .m-login-role-btn {
          display: flex; align-items: center; gap: 14px;
          padding: 16px 18px; background: var(--bg-card);
          border: 1px solid var(--m-hairline); color: var(--text-primary);
          border-radius: var(--m-radius-md); font-family: var(--font-body);
          font-size: 15px; font-weight: 500; cursor: pointer;
          text-align: right; transition: all 0.2s;
        }
        .m-login-role-btn.active {
          border-color: var(--m-ring);
          box-shadow: 0 4px 20px rgba(201,169,110,0.15);
          background: linear-gradient(135deg, rgba(201,169,110,0.08), transparent 60%), var(--bg-card);
        }
        .m-login-role-btn svg:first-child {
          width: 34px; height: 34px; padding: 8px; flex-shrink: 0;
          border-radius: 10px; background: rgba(201,169,110,0.12); color: var(--gold);
        }
        .m-login-google {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          margin-top: 22px; padding: 14px; border-radius: var(--m-radius-md);
          background: white; color: #000; border: none;
          font-family: var(--font-body); font-size: 15px; font-weight: 500;
          cursor: pointer; width: 100%;
        }
        .m-login-google:active { transform: scale(0.98); }
        .m-login-divider {
          display: flex; align-items: center; gap: 12px; margin: 16px 0;
          color: var(--text-muted); font-size: 11px; letter-spacing: 1px;
          text-transform: uppercase;
        }
        .m-login-divider::before, .m-login-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--m-hairline);
        }
        .m-login-mail {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 14px; width: 100%; border-radius: var(--m-radius-md);
          background: transparent; color: var(--text-primary);
          border: 1px solid var(--m-hairline); font-size: 14px; cursor: pointer;
          font-family: var(--font-body); font-weight: 500;
        }
        .m-login-signup {
          margin-top: 18px; background: transparent; border: none;
          color: var(--text-muted); font-size: 13px; font-family: var(--font-body);
          cursor: pointer; width: 100%;
        }
        .m-login-signup strong { color: var(--gold); font-weight: 500; }
        .m-login-err {
          margin-top: 14px; padding: 10px 14px;
          border-radius: var(--m-radius-sm);
          background: rgba(248,113,113,0.1); color: var(--danger);
          border: 1px solid rgba(248,113,113,0.25); font-size: 13px;
        }
        .m-login-back {
          background: transparent; border: none; color: var(--text-muted);
          padding: 6px 0; display: inline-flex; align-items: center; gap: 4px;
          font-family: var(--font-body); font-size: 13px; cursor: pointer;
          margin-bottom: 18px;
        }
        .m-login-heading {
          font-family: var(--font-display); font-size: 34px; letter-spacing: -0.8px;
          color: var(--text-primary); line-height: 1.1;
        }
        .m-login-sub-sm {
          font-size: 13px; color: var(--text-muted); margin-top: 8px; margin-bottom: 22px;
        }
        .m-input-wrap {
          display: flex; align-items: center; gap: 10px;
          background: var(--bg-input); border: 1px solid var(--m-hairline);
          border-radius: var(--m-radius-sm); padding: 0 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .m-input-wrap:focus-within {
          border-color: var(--gold);
          box-shadow: 0 0 0 4px var(--gold-glow);
        }
        .m-input-wrap svg { color: var(--text-muted); flex-shrink: 0; }
        .m-input-wrap .m-input {
          border: none; background: transparent; padding: 13px 0; flex: 1;
        }
        .m-login-alt {
          margin-top: 14px; background: transparent; border: none;
          color: var(--text-muted); font-size: 12.5px; cursor: pointer;
          font-family: var(--font-body);
        }
      `}</style>
    </div>
  );
}
