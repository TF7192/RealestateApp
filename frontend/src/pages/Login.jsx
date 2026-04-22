import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Building2, Mail, Lock, ArrowLeft, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isNative } from '../native/platform';
import { Browser } from '@capacitor/browser';
import './Login.css';

const AGENT_IMG = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=80';

const FEATURE_KEYS = ['properties', 'leads', 'marketing', 'customerView'];

export default function Login() {
  const { t } = useTranslation('auth');
  const { login, signup } = useAuth();
  const [searchParams] = useSearchParams();
  // Landing-page CTAs send `?flow=signup` so visitors arriving from the
  // marketing page land directly on the signup form, skipping the
  // Google/login choice screen.
  const initialFlow = searchParams.get('flow') === 'signup' ? 'email-signup' : null;
  const [flow, setFlow] = useState(initialFlow); // null | 'email-login' | 'email-signup'
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const role = 'AGENT';

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleGoogle = async () => {
    // Two different OAuth flows depending on the runtime:
    //
    // • Web: just navigate the WebView (or browser tab) to the start URL.
    //   Same-origin with the app bundle, cookie is set by the callback,
    //   everything works.
    //
    // • Native (Capacitor iOS/Android): the WKWebView can't run Google's
    //   consent screen — Google's "use secure browsers" policy blocks
    //   every embedded WebView by fingerprint, regardless of UA. So we
    //   launch SFSafariViewController via @capacitor/browser, pass
    //   ?native=1 so the backend redirects to our com.estia.agent://
    //   deep link with a one-time code, and an appUrlOpen listener in
    //   App.jsx catches that, calls /native-exchange, and the Set-Cookie
    //   response lands in the app's WebView.
    if (isNative()) {
      // Always resolve against the production origin — on native there
      // is no window.location meaningful for this hop; the app bundle
      // loads from estia.co.il and that's where /api lives.
      const origin = window.location.origin.startsWith('http')
        ? window.location.origin
        : 'https://estia.co.il';
      await Browser.open({
        url: `${origin}/api/auth/google?native=1`,
        presentationStyle: 'popover',
      });
      return;
    }
    // After OAuth success the backend redirects to this `redirect` param.
    // Two gotchas:
    //   - If the user starts from /login, bouncing back to /login lands
    //     on a 404 in the authenticated router.
    //   - `/` is served by the static marketing landing page (nginx),
    //     NOT the SPA — so redirecting there after login shows the
    //     landing, not the dashboard.
    // Default post-login target is /dashboard, which is an SPA alias
    // for Dashboard added exactly for this flow.
    const here = window.location.pathname + window.location.search;
    const onLogin = window.location.pathname === '/login';
    const redirect = (onLogin || window.location.pathname === '/') ? '/dashboard' : here;
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (flow === 'email-signup') {
        if (form.password.length < 8) throw new Error(t('errors.passwordTooShort'));
        await signup({
          email: form.email,
          password: form.password,
          role,
          displayName: form.displayName || form.email.split('@')[0],
          phone: form.phone || undefined,
        });
      } else {
        await login({ email: form.email, password: form.password });
      }
    } catch (err) {
      setError(err.message || t(flow === 'email-signup' ? 'errors.signupFailed' : 'errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page mode-agent">
      <div className="noise-overlay" />

      <div className="login-bg">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
      </div>

      <div className="login-container fade-in">
        <div className="login-branding">
          <div className="login-brand-bg">
            <img src={AGENT_IMG} alt="" />
            <div className="login-brand-overlay" />
          </div>

          <div className="login-brand-content">
            <div className="login-logo">
              <div className="logo-diamond">◆</div>
              <h1>Estia</h1>
            </div>

            <h2 className="login-tagline">{t('tagline')}</h2>

            <div className="login-features-list">
              {FEATURE_KEYS.map((key, i) => (
                <div
                  key={key}
                  className="login-feature-item"
                  style={{ animationDelay: `${0.4 + i * 0.1}s` }}
                >
                  <div className="feature-line" />
                  <span>{t(`features.${key}`)}</span>
                </div>
              ))}
            </div>

            <div className="login-brand-badge">
              <Building2 size={14} />
              <span>{t('badge')}</span>
            </div>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-form-header">
            <h2>{t(flow === 'email-signup' ? 'titles.signup' : 'titles.login')}</h2>
            <p>{t(flow === 'email-signup' ? 'subtitles.signup' : 'subtitles.login')}</p>
          </div>

          {!flow && (
            <div className="auth-methods">
              <button className="auth-method-btn google" onClick={handleGoogle}>
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>{t('buttons.google')}</span>
              </button>

              <div className="auth-divider">
                <span>{t('divider')}</span>
              </div>

              <button
                className="auth-method-btn phone-btn"
                onClick={() => setFlow('email-login')}
              >
                <Mail size={20} />
                <span>{t('buttons.emailLogin')}</span>
              </button>

              <button
                className="auth-method-btn signup-btn"
                onClick={() => setFlow('email-signup')}
              >
                <UserPlus size={20} />
                <span>{t('buttons.emailSignup')}</span>
              </button>

              {error && <div className="auth-error">{error}</div>}
            </div>
          )}

          {(flow === 'email-login' || flow === 'email-signup') && (
            <form onSubmit={handleSubmit} className="phone-auth-form animate-in">
              <button
                type="button"
                className="auth-back-btn"
                onClick={() => { setFlow(null); setError(''); }}
              >
                <ArrowLeft size={16} />
                {t('buttons.back')}
              </button>

              {flow === 'email-signup' && (
                <>
                  {/* A-2 — give visitors who landed directly on the signup
                      form (from a /login?flow=signup CTA on the landing)
                      a Google shortcut so they don't have to back out
                      through the method chooser to find it. Reuses the
                      same OAuth handler the login path uses. */}
                  <button
                    type="button"
                    className="auth-method-btn google signup-google-btn"
                    onClick={handleGoogle}
                  >
                    <svg width="20" height="20" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    <span>{t('buttons.googleSignup')}</span>
                  </button>
                  <div className="auth-divider">
                    <span>{t('divider')}</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('fields.displayName')}</label>
                    <input
                      type="text"
                      autoComplete="name"
                      autoCapitalize="words"
                      autoCorrect="off"
                      enterKeyHint="next"
                      className="form-input"
                      placeholder={t('placeholders.displayName')}
                      value={form.displayName}
                      onChange={(e) => update('displayName', e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('fields.phone')}</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      enterKeyHint="next"
                      dir="ltr"
                      className="form-input"
                      placeholder={t('placeholders.phone')}
                      value={form.phone}
                      onChange={(e) => update('phone', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">{t('fields.email')}</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  dir="ltr"
                  className="form-input"
                  placeholder={t('placeholders.email')}
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  required
                  autoFocus={flow === 'email-login'}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Lock size={13} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                  {t('fields.password')}{' '}
                  {flow === 'email-signup' && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {t('fields.passwordHint')}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  autoComplete={flow === 'email-signup' ? 'new-password' : 'current-password'}
                  enterKeyHint="go"
                  className="form-input"
                  placeholder={t('placeholders.password')}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  required
                  minLength={flow === 'email-signup' ? 8 : undefined}
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button
                type="submit"
                className="btn btn-primary btn-lg login-submit-btn"
                disabled={submitting}
              >
                {flow === 'email-signup' ? <UserPlus size={18} /> : <LogIn size={18} />}
                {submitting
                  ? t('shared:buttons.justAMoment')
                  : t(flow === 'email-signup' ? 'buttons.submitSignup' : 'buttons.submitLogin')}
              </button>

              <div className="auth-switch">
                {flow === 'email-login' ? (
                  <>
                    {t('switch.noAccount')}{' '}
                    <button type="button" onClick={() => { setFlow('email-signup'); setError(''); }}>
                      {t('switch.toSignup')}
                    </button>
                  </>
                ) : (
                  <>
                    {t('switch.hasAccount')}{' '}
                    <button type="button" onClick={() => { setFlow('email-login'); setError(''); }}>
                      {t('switch.toLogin')}
                    </button>
                  </>
                )}
              </div>
            </form>
          )}

          <div className="login-footer">
            <span>{t('footer')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
