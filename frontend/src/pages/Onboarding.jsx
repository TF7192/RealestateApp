// Onboarding — 1:1 port of the bundle's ScreenSignup wizard
// (estia-new-project/project/src/mobile/screens-auth.jsx). Three-step
// flow with a pill-progress indicator, radio-card role picker, and
// a gold Premium note on the final step. The production hookup
// keeps the real `submitOnboarding` API call that the App.jsx route
// guard depends on (profileCompletedAt flips to non-null after POST).
// License number remains required — enforced on step 1 "next" and
// echoed in the server zod.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, IdCard, User, Phone, Building2, MapPin, Upload, Plus,
  Sparkles, LogOut,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const T = {
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

const TOTAL_STEPS = 3;

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh, logout } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    license: '',
    title: 'solo',   // radio-card role: solo | office | agency
    agency: '',
    city: '',
    phone: '',
  });
  const [err, setErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cityOptions, setCityOptions] = useState([]);

  // Canonical Israeli city list — same source the rest of the app
  // normalizes against (backend /lookups/cities). Rendered as a
  // native <datalist> so the agent gets autocomplete but can still
  // type a city not in the list (e.g. new localities).
  useEffect(() => {
    let cancelled = false;
    api.cities().then((res) => {
      if (cancelled) return;
      const names = (res?.cities || []).map((c) => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
      setCityOptions(names);
    }).catch(() => { /* fallthrough — user can type freely */ });
    return () => { cancelled = true; };
  }, []);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const licenseDigits = form.license.replace(/\D/g, '');
  const licenseValid = /^\d{6,8}$/.test(licenseDigits);

  const canAdvance = () => {
    if (step === 0) return licenseValid;
    if (step === 1) return form.title && (form.title === 'solo' || form.agency.trim()) && form.city.trim();
    return true;
  };

  const next = () => {
    setErr(null);
    if (step === 0 && !licenseValid) { setErr('מספר רישיון חייב להיות 6 עד 8 ספרות'); return; }
    if (step === 1 && form.title !== 'solo' && !form.agency.trim()) { setErr('נדרש שם משרד / סוכנות'); return; }
    if (step === 1 && !form.city.trim()) { setErr('נדרש אזור פעילות עיקרי'); return; }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };
  const back = () => { setErr(null); setStep((s) => Math.max(0, s - 1)); };

  const finish = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      // Map the design's role radio into the server's `title` string
      // + agency free-text. Keeps the existing submitOnboarding shape.
      const titleLabel = form.title === 'office' ? 'סוכן'
        : form.title === 'agency' ? 'מנהל משרד'
        : 'סוכן עצמאי';
      await api.submitOnboarding({
        license: licenseDigits,
        title: titleLabel,
        agency: form.agency.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
      });
      await refresh();
      toast.success('ברוך הבא');
      navigate('/dashboard', { replace: true });
    } catch (e) {
      const msg = e?.message || 'שמירה נכשלה';
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" lang="he" style={{
      ...FONT, background: T.cream, color: T.ink, minHeight: '100vh',
      // Natural page scroll; sticky footer pins to the viewport bottom
      // so the primary CTA is always reachable (previous layout used
      // inner overflow with no container height, so step 3 hid the
      // submit below the fold).
      display: 'flex', justifyContent: 'center', padding: '0 0 96px',
    }}>
      <div style={{
        width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column',
        background: T.cream,
      }}>
        {/* Top bar */}
        <div style={{
          padding: '16px 22px 12px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: 'none', position: 'sticky', top: 0, background: T.cream, zIndex: 5,
        }}>
          <button type="button" onClick={step === 0 ? () => logout().catch(() => {}) : back}
            style={{
              width: 34, height: 34, borderRadius: 99, border: 'none', background: 'transparent',
              color: T.ink, display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
            aria-label={step === 0 ? 'יציאה' : 'חזרה'}>
            {step === 0 ? <LogOut size={18} /> : <ArrowLeft size={18} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>הרשמה חינם</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>שלב {step + 1} מתוך {TOTAL_STEPS}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{
                width: 22, height: 3, borderRadius: 99,
                background: i <= step ? T.gold : T.cream3,
              }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 22px 20px' }}>
          {step === 0 && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.15, margin: '0 0 6px' }}>
                בואו נכיר.
              </h1>
              <p style={{ fontSize: 14, color: T.muted, margin: '0 0 24px' }}>
                כמה פרטים לצורך הפעלת החשבון — חצי דקה, מבטיחים.
              </p>
              <Field
                label="מספר רישיון תיווך"
                hint="6 עד 8 ספרות — הרישיון ממשרד המשפטים"
                icon={<IdCard size={16} />}
                value={form.license}
                onChange={(v) => setF('license', v.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
                inputMode="numeric"
                required
                autoFocus
              />
              <Field
                label="טלפון (רשות)"
                icon={<Phone size={16} />}
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={form.phone}
                onChange={(v) => setF('phone', v)}
                placeholder="050-0000000"
                hint="נשתמש רק להתראות קריטיות ולסנכרון WhatsApp."
              />
            </>
          )}

          {step === 1 && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.15, margin: '0 0 6px' }}>
                מה המבנה שלכם?
              </h1>
              <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>
                בוחרים עכשיו — אפשר לשנות בכל רגע.
              </p>
              {[
                { k: 'solo',   t: 'סוכן/ת נדל״ן עצמאי/ת', d: 'עובד/ת לבד, בלי משרד' },
                { k: 'office', t: 'חלק ממשרד תיווך',       d: 'עם מנהל ועוד סוכנים' },
                { k: 'agency', t: 'בעל/ת סוכנות',          d: 'מנהל/ת צוות של סוכנים' },
              ].map((opt) => {
                const on = form.title === opt.k;
                return (
                  <button
                    type="button"
                    key={opt.k}
                    onClick={() => setF('title', opt.k)}
                    style={{
                      ...FONT,
                      width: '100%', textAlign: 'inherit', cursor: 'pointer',
                      background: on ? `linear-gradient(160deg, ${T.cream4}, ${T.cream3})` : T.white,
                      border: `1.5px solid ${on ? T.gold : T.border}`,
                      borderRadius: 14, padding: 16, marginBottom: 10,
                      display: 'flex', alignItems: 'center', gap: 12, color: T.ink,
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                      border: `2px solid ${on ? T.gold : T.borderStrong}`,
                      background: on ? T.gold : 'transparent',
                      display: 'grid', placeItems: 'center',
                    }}>
                      {on && <span style={{ width: 8, height: 8, borderRadius: 99, background: T.ink }} />}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{opt.t}</span>
                      <span style={{ display: 'block', fontSize: 12, color: T.muted, marginTop: 2 }}>{opt.d}</span>
                    </span>
                  </button>
                );
              })}
              {form.title !== 'solo' && (
                <Field
                  label="שם הסוכנות / משרד"
                  icon={<Building2 size={16} />}
                  value={form.agency}
                  onChange={(v) => setF('agency', v)}
                  placeholder="לדוגמה: סוכנות אבני"
                />
              )}
              <Field
                label="אזור פעילות עיקרי"
                icon={<MapPin size={16} />}
                value={form.city}
                onChange={(v) => setF('city', v)}
                placeholder="תל אביב, רמת גן…"
                list="onboarding-cities"
              />
              <datalist id="onboarding-cities">
                {cityOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.15, margin: '0 0 6px' }}>
                אחרון לפני שנתחיל.
              </h1>
              <p style={{ fontSize: 14, color: T.muted, margin: '0 0 20px' }}>
                בוחרים איך להתחיל — אפשר לדלג ולהוסיף מאוחר יותר.
              </p>
              {[
                { icon: <Upload size={18} />, t: 'ייבוא מ-Excel',    d: 'נכסים, לקוחות ובעלים במכה אחת' },
                { icon: <Plus size={18} />,   t: 'הוספה ידנית',      d: 'הקלדת הנכס והליד הראשון בעצמי' },
                { icon: <ArrowLeft size={18} />, t: 'התחלה ריקה',   d: 'פשוט להתחיל, להוסיף בהדרגה' },
              ].map((o, i) => (
                <div key={i} style={{
                  background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
                  padding: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: T.goldSoft, color: T.gold,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>{o.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{o.t}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{o.d}</div>
                  </div>
                  <ArrowLeft size={15} style={{ color: T.muted }} />
                </div>
              ))}
              <div style={{
                background: T.goldSoft, border: `1px solid ${T.gold}`, borderRadius: 12,
                padding: 12, marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <Sparkles size={18} style={{ color: T.gold, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.goldDark }}>30 יום Premium חינם</div>
                  <div style={{ fontSize: 12, color: T.ink, marginTop: 2 }}>
                    גישה מלאה ל-AI ולכל התכונות. ביטול בכל רגע, בלי כרטיס אשראי.
                  </div>
                </div>
              </div>
            </>
          )}

          {err && (
            <div role="alert" style={{
              background: 'rgba(185,28,28,0.08)', color: T.danger,
              padding: '10px 12px', borderRadius: 10, fontSize: 13, marginTop: 12,
            }}>{err}</div>
          )}
        </div>

        {/* Sticky footer CTA — pins to viewport bottom so the primary
            button is always reachable regardless of step length. */}
        <div style={{
          padding: '12px 22px 22px', borderTop: `1px solid ${T.border}`,
          background: T.cream,
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxWidth: 520, margin: '0 auto', zIndex: 10,
        }}>
          {step < TOTAL_STEPS - 1 ? (
            <PrimaryBtn onClick={next} disabled={!canAdvance()}>
              המשך
              <ArrowLeft size={15} aria-hidden="true" />
            </PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={finish} disabled={submitting}>
              {submitting ? 'שומר…' : 'סיימתי — בואו נתחיל'}
              <ArrowLeft size={15} aria-hidden="true" />
            </PrimaryBtn>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, icon, hint, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.white,
        border: `1.5px solid ${focus ? T.gold : T.border}`,
        borderRadius: 12, padding: '0 14px',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: focus ? '0 0 0 4px rgba(180,139,76,0.12)' : 'none',
      }}>
        {icon && <span style={{ color: T.muted, display: 'inline-flex' }}>{icon}</span>}
        <input
          {...rest}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            ...FONT, flex: 1, border: 'none', outline: 'none', background: 'transparent',
            padding: '13px 0', fontSize: 15, color: T.ink, minWidth: 0,
            textAlign: rest.dir === 'ltr' ? 'left' : 'right',
          }}
        />
      </div>
      {hint && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...FONT,
      background: disabled ? '#d8cfbf' : `linear-gradient(180deg, ${T.goldLight}, ${T.gold})`,
      color: T.ink, fontWeight: 800, padding: '14px 18px', borderRadius: 12, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 15, width: '100%',
      boxShadow: disabled ? 'none' : '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      opacity: disabled ? 0.7 : 1,
    }}>{children}</button>
  );
}
