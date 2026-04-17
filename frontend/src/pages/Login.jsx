import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, User, Building2 } from 'lucide-react';
import './Login.css';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('agent'); // 'agent' or 'customer'
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    phone: '',
    code: '',
  });
  const [codeSent, setCodeSent] = useState(false);

  const handleAgentLogin = (e) => {
    e.preventDefault();
    onLogin('agent');
    navigate('/');
  };

  const handleCustomerLogin = (e) => {
    e.preventDefault();
    if (!codeSent) {
      setCodeSent(true);
      return;
    }
    onLogin('customer');
    navigate('/customer');
  };

  return (
    <div className="login-page">
      <div className="noise-overlay" />

      {/* Background decoration */}
      <div className="login-bg">
        <div className="login-bg-gradient" />
        <div className="login-bg-pattern" />
      </div>

      <div className="login-container">
        {/* Left side - branding */}
        <div className="login-branding">
          <div className="login-logo">
            <div className="logo-mark large">
              <span>◆</span>
            </div>
            <h1>Estia</h1>
            <p>ניהול נכסים, לידים ועסקאות</p>
          </div>
          <div className="login-features">
            <div className="login-feature">
              <div className="feature-dot" />
              <span>ניהול נכסים ובלעדיויות</span>
            </div>
            <div className="login-feature">
              <div className="feature-dot" />
              <span>מעקב לידים, קונים ועסקאות</span>
            </div>
            <div className="login-feature">
              <div className="feature-dot" />
              <span>שיווק ושיתוף נכסים</span>
            </div>
            <div className="login-feature">
              <div className="feature-dot" />
              <span>דפי נכס ללקוחות</span>
            </div>
          </div>
          <div className="login-branding-image">
            <img
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80"
              alt="Real estate"
            />
          </div>
        </div>

        {/* Right side - form */}
        <div className="login-form-side">
          <div className="login-mode-toggle">
            <button
              className={`mode-btn ${mode === 'agent' ? 'active' : ''}`}
              onClick={() => { setMode('agent'); setCodeSent(false); }}
            >
              <Building2 size={18} />
              סוכן נדל״ן
            </button>
            <button
              className={`mode-btn ${mode === 'customer' ? 'active' : ''}`}
              onClick={() => { setMode('customer'); setCodeSent(false); }}
            >
              <User size={18} />
              לקוח
            </button>
          </div>

          {mode === 'agent' ? (
            <form onSubmit={handleAgentLogin} className="login-form">
              <div className="login-form-header">
                <h2>כניסת סוכן</h2>
                <p>כניסה למערכת</p>
              </div>

              <div className="form-group">
                <label className="form-label">אימייל</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="agent@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">סיסמה</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="הזן סיסמה"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-extra">
                <label className="checkbox-item">
                  <input type="checkbox" defaultChecked />
                  <span className="checkbox-custom" />
                  זכור אותי
                </label>
                <a href="#" className="forgot-link">שכחתי סיסמה</a>
              </div>

              <button type="submit" className="btn btn-primary btn-lg login-submit">
                <LogIn size={18} />
                כניסה
              </button>
            </form>
          ) : (
            <form onSubmit={handleCustomerLogin} className="login-form">
              <div className="login-form-header">
                <h2>כניסת לקוח</h2>
                <p>
                  {codeSent
                    ? 'הזן את הקוד שנשלח אליך ב-SMS'
                    : 'הזן מספר טלפון לקבלת קוד כניסה'}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">מספר טלפון</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="050-1234567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={codeSent}
                />
              </div>

              {codeSent && (
                <div className="form-group animate-in">
                  <label className="form-label">קוד אימות</label>
                  <input
                    type="text"
                    className="form-input code-input"
                    placeholder="_ _ _ _ _ _"
                    maxLength={6}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="resend-link"
                    onClick={() => setCodeSent(true)}
                  >
                    שלח קוד מחדש
                  </button>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-lg login-submit">
                {codeSent ? (
                  <>
                    <LogIn size={18} />
                    כניסה
                  </>
                ) : (
                  'שלח קוד'
                )}
              </button>

              {codeSent && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setCodeSent(false)}
                >
                  חזרה
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
