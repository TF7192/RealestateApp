import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Building2, Phone, Mail, ArrowLeft } from 'lucide-react';
import './Login.css';

const AGENT_IMG = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&q=80';
const CUSTOMER_IMG = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80';

const agentFeatures = [
  'ניהול נכסים ובלעדיויות',
  'מעקב לידים, קונים ועסקאות',
  'שיווק ושיתוף נכסים',
  'דפי נכס ללקוחות',
];

const customerFeatures = [
  'צפייה בנכסים זמינים',
  'חיפוש לפי מיקום וקרבה',
  'יצירת קשר ישירה עם הסוכן',
  'שמירת נכסים מועדפים',
];

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('agent');
  const [authMethod, setAuthMethod] = useState(null); // null | 'google' | 'phone'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const isAgent = mode === 'agent';

  const switchMode = (newMode) => {
    if (newMode === mode) return;
    setTransitioning(true);
    setTimeout(() => {
      setMode(newMode);
      setAuthMethod(null);
      setCodeSent(false);
      setPhone('');
      setCode('');
      setTransitioning(false);
    }, 300);
  };

  const handleGoogleLogin = () => {
    // Mock Google login
    onLogin(mode);
    navigate(isAgent ? '/' : '/customer');
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    if (!codeSent) {
      setCodeSent(true);
      return;
    }
    onLogin(mode);
    navigate(isAgent ? '/' : '/customer');
  };

  const features = isAgent ? agentFeatures : customerFeatures;
  const heroImg = isAgent ? AGENT_IMG : CUSTOMER_IMG;

  return (
    <div className={`login-page ${isAgent ? 'mode-agent' : 'mode-customer'}`}>
      <div className="noise-overlay" />

      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
      </div>

      <div className={`login-container ${transitioning ? 'fade-out' : 'fade-in'}`}>
        {/* Branding panel */}
        <div className="login-branding">
          <div className="login-brand-bg">
            <img src={heroImg} alt="" key={heroImg} />
            <div className="login-brand-overlay" />
          </div>

          <div className="login-brand-content">
            <div className="login-logo">
              <div className="logo-diamond">◆</div>
              <h1>Estia</h1>
            </div>

            <h2 className="login-tagline">
              {isAgent ? 'מערכת ניהול נדל״ן' : 'הנכס הבא שלך מחכה'}
            </h2>

            <div className="login-features-list">
              {features.map((f, i) => (
                <div
                  key={f}
                  className="login-feature-item"
                  style={{ animationDelay: `${0.4 + i * 0.1}s` }}
                >
                  <div className="feature-line" />
                  <span>{f}</span>
                </div>
              ))}
            </div>

            <div className="login-brand-badge">
              {isAgent ? (
                <>
                  <Building2 size={14} />
                  <span>ממשק סוכנים</span>
                </>
              ) : (
                <>
                  <User size={14} />
                  <span>ממשק לקוחות</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="login-form-panel">
          {/* Role toggle */}
          <div className="login-role-toggle">
            <button
              className={`role-tab ${isAgent ? 'active' : ''}`}
              onClick={() => switchMode('agent')}
            >
              <Building2 size={18} />
              <span>סוכן נדל״ן</span>
            </button>
            <button
              className={`role-tab ${!isAgent ? 'active' : ''}`}
              onClick={() => switchMode('customer')}
            >
              <User size={18} />
              <span>לקוח</span>
            </button>
            <div
              className="role-tab-indicator"
              style={{ transform: isAgent ? 'translateX(0)' : 'translateX(-100%)' }}
            />
          </div>

          {/* Form header */}
          <div className="login-form-header">
            <h2>{isAgent ? 'כניסה למערכת' : 'כניסה לאזור האישי'}</h2>
            <p>
              {isAgent
                ? 'נהל את הנכסים, הלידים והעסקאות שלך'
                : 'צפה בנכסים שנבחרו עבורך'}
            </p>
          </div>

          {/* Auth method selection */}
          {!authMethod && (
            <div className="auth-methods">
              <button className="auth-method-btn google" onClick={handleGoogleLogin}>
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>כניסה עם Google</span>
              </button>

              <div className="auth-divider">
                <span>או</span>
              </div>

              <button
                className="auth-method-btn phone-btn"
                onClick={() => setAuthMethod('phone')}
              >
                <Phone size={20} />
                <span>כניסה עם מספר טלפון</span>
              </button>
            </div>
          )}

          {/* Phone auth flow */}
          {authMethod === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="phone-auth-form animate-in">
              <button
                type="button"
                className="auth-back-btn"
                onClick={() => { setAuthMethod(null); setCodeSent(false); setPhone(''); setCode(''); }}
              >
                <ArrowLeft size={16} />
                חזרה
              </button>

              <div className="form-group">
                <label className="form-label">מספר טלפון</label>
                <div className="phone-input-wrapper">
                  <span className="phone-prefix">+972</span>
                  <input
                    type="tel"
                    className="form-input phone-field"
                    placeholder="50-1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={codeSent}
                    autoFocus
                  />
                </div>
              </div>

              {codeSent && (
                <div className="form-group animate-in">
                  <label className="form-label">קוד אימות</label>
                  <div className="code-boxes">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`code-box ${code.length > i ? 'filled' : ''} ${code.length === i ? 'current' : ''}`}
                      >
                        {code[i] || ''}
                      </div>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="code-hidden-input"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="resend-link"
                    onClick={() => {}}
                  >
                    שלח קוד מחדש
                  </button>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-lg login-submit-btn">
                <LogIn size={18} />
                {codeSent ? 'כניסה' : 'שלח קוד'}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="login-footer">
            <span>© 2025 Estia</span>
          </div>
        </div>
      </div>
    </div>
  );
}
