import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, IdCard, User, Building2, Phone } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PhoneField, SelectField } from '../components/SmartFields';
import './Onboarding.css';

// A-4 — first-login onboarding form. Agents arrive here whenever
// `profileCompletedAt` is null on the authed /me payload (the SPA route
// guard in App.jsx bounces every authed route back to /onboarding until
// the form is submitted). License number is required and validated as
// 6–8 digits client-side + server-side; the other fields are optional.
//
// The page is visually a simple single-column form — we don't reuse the
// Profile page grid because onboarding is a one-shot gate, and an
// unstyled row of inputs over the Layout wrapper felt demanding. The
// styles (Onboarding.css) give it a calmer hero-framed feel.

const TITLE_OPTIONS = [
  { value: '',           label: 'בחירה…' },
  { value: 'מתווך',       label: 'מתווך' },
  { value: 'סוכן',        label: 'סוכן' },
  { value: 'מנהל משרד',  label: 'מנהל משרד' },
  { value: 'אחר',        label: 'אחר' },
];

const LICENSE_ERROR = 'מספר רישיון חייב להיות 6 עד 8 ספרות';

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh, logout } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    license: '',
    title: '',
    agency: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const licenseDigits = form.license.replace(/\D/g, '');
  const licenseValid = /^\d{6,8}$/.test(licenseDigits);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!licenseValid) {
      setErr(LICENSE_ERROR);
      return;
    }
    setSubmitting(true);
    try {
      await api.submitOnboarding({
        license: licenseDigits,
        title: form.title || null,
        agency: form.agency || null,
        phone: form.phone || null,
      });
      // Refresh auth so `profileCompletedAt` lands in the user object
      // and the route guard stops bouncing us back here.
      await refresh();
      toast.success('ברוך הבא');
      navigate('/dashboard', { replace: true });
    } catch (e2) {
      const msg = e2?.message || 'שמירה נכשלה';
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-page" dir="rtl">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="onboarding-logo" aria-hidden="true">◆</div>
          <h1>ברוך הבא ל־Estia</h1>
          <p>
            כדי שנוכל להתאים את המערכת אליך, נבקש כמה פרטים — זה ייקח חצי דקה.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="onboarding-form" noValidate>
          <label className="onboarding-field">
            <span className="onboarding-label">
              <IdCard size={14} /> מספר רישיון
              <em>חובה</em>
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6,8}"
              autoComplete="off"
              autoFocus
              className={`form-input ${err === LICENSE_ERROR ? 'sf-invalid' : ''}`}
              placeholder="12345678"
              value={form.license}
              onChange={(e) => update('license', e.target.value.replace(/\D/g, '').slice(0, 8))}
              required
              aria-invalid={err === LICENSE_ERROR}
              aria-describedby="onboarding-license-help"
            />
            <span className="onboarding-help" id="onboarding-license-help">
              6 עד 8 ספרות — הרישיון שהתקבל ממשרד המשפטים.
            </span>
          </label>

          <label className="onboarding-field">
            <span className="onboarding-label">
              <User size={14} /> תפקיד <em>לא חובה</em>
            </span>
            <SelectField
              value={form.title}
              onChange={(v) => update('title', v)}
              options={TITLE_OPTIONS}
            />
          </label>

          <label className="onboarding-field">
            <span className="onboarding-label">
              <Building2 size={14} /> סוכנות <em>לא חובה</em>
            </span>
            <input
              type="text"
              autoComplete="organization"
              autoCapitalize="words"
              className="form-input"
              placeholder="לדוגמה: רימקס פרמיום"
              value={form.agency}
              onChange={(e) => update('agency', e.target.value)}
            />
          </label>

          <label className="onboarding-field">
            <span className="onboarding-label">
              <Phone size={14} /> טלפון <em>לא חובה</em>
            </span>
            <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
          </label>

          {err && <div className="onboarding-error" role="alert">{err}</div>}

          <div className="onboarding-actions">
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={submitting || !licenseValid}
            >
              {submitting ? 'שומר…' : 'המשך'}
            </button>
            <button
              type="button"
              className="btn btn-ghost onboarding-logout"
              onClick={async () => { try { await logout(); } catch { /* ignore */ } }}
            >
              <ArrowLeft size={14} /> יציאה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
