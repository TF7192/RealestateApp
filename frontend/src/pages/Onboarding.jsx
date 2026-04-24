// Onboarding — 3-step wizard matching the claude.ai/design ScreenSignup.
// Design-match is visual; form wiring is production: POST /me/profile,
// refresh auth, route guard unblocks. License required (6–8 digits);
// city comes from a custom autocomplete backed by /lookups/cities so
// the stored value lines up with the backend's canonical registry.
// Phone is validated as an Israeli mobile when provided.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, IdCard, Phone, Building2, MapPin, Upload, Plus,
  Sparkles, LogOut, Search,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import LogoMark from '../components/LogoMark';

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

// ─── Field-level validators ──────────────────────────────────
const PHONE_RE = /^0(5\d|[23489])-?\d{3}-?\d{4}$/;
const LICENSE_RE = /^\d{6,8}$/;

function validatePhone(raw) {
  const v = (raw || '').trim();
  if (!v) return null; // optional
  return PHONE_RE.test(v.replace(/\s/g, '')) ? null : 'מספר טלפון לא תקין';
}

// Format as the user types: strip non-digits, cap at 10 digits,
// insert "-" after the 3-digit prefix (050-1234567).
function formatPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
function validateLicense(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return 'מספר רישיון הוא שדה חובה';
  return LICENSE_RE.test(digits) ? null : 'מספר רישיון חייב להיות 6 עד 8 ספרות';
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refresh, logout } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  // Pre-fill phone from the logged-in user record if it already
  // exists (it does when the agent provided a phone during signup).
  // Keeps the agent from having to type the same number twice.
  const [form, setForm] = useState(() => ({
    license: '', title: 'solo', agency: '',
    city: '',
    phone: user?.phone ? formatPhone(user.phone) : '',
  }));
  // Top up phone when the auth context loads after mount (first render
  // before /me returned may have user=null).
  useEffect(() => {
    if (user?.phone && !form.phone) setForm((p) => ({ ...p, phone: formatPhone(user.phone) }));
  }, [user?.phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const [err, setErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [cityOptions, setCityOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.cities().then((res) => {
      if (cancelled) return;
      const names = (res?.cities || [])
        .map((c) => c?.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'he'));
      setCityOptions(names);
    }).catch(() => { /* user can type freely — fall through */ });
    return () => { cancelled = true; };
  }, []);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const licenseErr = validateLicense(form.license);
  const phoneErr = validatePhone(form.phone);

  const next = () => {
    setErr(null);
    if (step === 0) {
      if (licenseErr) { setErr(licenseErr); return; }
      if (phoneErr) { setErr(phoneErr); return; }
    }
    if (step === 1) {
      if (form.title !== 'solo' && !form.agency.trim()) { setErr('נדרש שם משרד / סוכנות'); return; }
      if (!form.city.trim()) { setErr('נדרש אזור פעילות עיקרי'); return; }
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };
  const back = () => { setErr(null); setStep((s) => Math.max(0, s - 1)); };

  const finish = async (destination = '/dashboard') => {
    setErr(null);
    if (licenseErr) { setStep(0); setErr(licenseErr); return; }
    if (phoneErr) { setStep(0); setErr(phoneErr); return; }
    setSubmitting(true);
    try {
      const titleLabel = form.title === 'office' ? 'סוכן'
        : form.title === 'agency' ? 'מנהל משרד'
        : 'סוכן עצמאי';
      await api.submitOnboarding({
        license: form.license.replace(/\D/g, ''),
        title: titleLabel,
        agency: form.agency.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
      });
      toast.success('ברוך הבא');
      // Smooth exit: fade the page out first, THEN do the hard nav.
      // The hard nav is still required — using react-router's navigate
      // races against the App.jsx `<Route path="/onboarding" element=
      // {<Navigate to="/dashboard" />}>` guard which fires the moment
      // refresh() flips needsOnboarding=false, so it always wins and
      // sent every card to /dashboard. A 320ms fade + location.assign
      // lets the user see the submission settle before the new page
      // mounts.
      setExiting(true);
      setTimeout(() => { window.location.assign(destination); }, 320);
      return;
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
      display: 'flex', justifyContent: 'center', padding: 0,
      opacity: exiting ? 0 : 1,
      transform: exiting ? 'translateY(-8px)' : 'translateY(0)',
      transition: 'opacity 280ms ease, transform 280ms ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        display: 'flex', flexDirection: 'column',
        background: T.cream, paddingBottom: 28,
      }}>
        {/* Top bar */}
        <div style={{
          padding: '16px 22px 12px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, background: T.cream, zIndex: 5,
        }}>
          <button type="button"
            onClick={step === 0 ? () => logout().catch(() => {}) : back}
            aria-label={step === 0 ? 'יציאה' : 'חזרה'}
            style={{
              width: 34, height: 34, borderRadius: 99, border: 'none', background: 'transparent',
              color: T.ink, display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}>
            {step === 0 ? <LogOut size={18} /> : <ArrowLeft size={18} />}
          </button>
          {/* Sprint 8 brand sweep — onboarding sits on the cream page
              background so the ink-tile variant with the gold ◆ is
              the contrast-correct mark. */}
          <LogoMark size={30} tone="ink" />
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
                error={form.license && licenseErr}
              />
              <Field
                label="טלפון (רשות)"
                icon={<Phone size={16} />}
                type="tel"
                inputMode="tel"
                dir="ltr"
                maxLength={11}
                value={form.phone}
                onChange={(v) => setF('phone', formatPhone(v))}
                placeholder="050-0000000"
                hint="נשתמש רק להתראות קריטיות ולסנכרון WhatsApp."
                error={form.phone && phoneErr}
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
                  <button type="button" key={opt.k} onClick={() => setF('title', opt.k)} style={{
                    ...FONT, width: '100%', textAlign: 'inherit', cursor: 'pointer',
                    background: on ? `linear-gradient(160deg, ${T.cream4}, ${T.cream3})` : T.white,
                    border: `1.5px solid ${on ? T.gold : T.border}`,
                    borderRadius: 14, padding: 16, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 12, color: T.ink,
                  }}>
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
              <CityField
                label="אזור פעילות עיקרי"
                value={form.city}
                onChange={(v) => setF('city', v)}
                options={cityOptions}
                placeholder="תל אביב, רמת גן…"
              />
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
                { icon: <Upload size={18} />,    t: 'ייבוא מ-Excel', d: 'נכסים, לקוחות ובעלים במכה אחת', to: '/import' },
                { icon: <Plus size={18} />,      t: 'הוספה ידנית',   d: 'הקלדת הנכס והליד הראשון בעצמי', to: '/properties/new' },
                { icon: <ArrowLeft size={18} />, t: 'התחלה ריקה',    d: 'פשוט להתחיל, להוסיף בהדרגה',     to: '/dashboard' },
              ].map((o, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={submitting}
                  onClick={() => finish(o.to)}
                  style={{
                    ...FONT, width: '100%', textAlign: 'inherit',
                    cursor: submitting ? 'wait' : 'pointer',
                    background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
                    padding: 16, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 12,
                    color: T.ink, transition: 'border-color 140ms, transform 140ms',
                    opacity: submitting ? 0.7 : 1,
                  }}
                  onMouseOver={(e) => { if (!submitting) e.currentTarget.style.borderColor = T.gold; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = T.border; }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: T.goldSoft, color: T.gold,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>{o.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{o.t}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{o.d}</div>
                  </div>
                  <ArrowLeft size={15} aria-hidden="true" style={{ color: T.muted }} />
                </button>
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

        {/* Inline footer CTA — placed at the end of the page so it's
            always in the scroll flow. No position:fixed — that was
            hiding behind the outer Layout's overflow container. */}
        <div style={{ padding: '16px 22px 22px', borderTop: `1px solid ${T.border}`, background: T.cream }}>
          {step < TOTAL_STEPS - 1 ? (
            <PrimaryBtn onClick={next}>
              המשך
              <ArrowLeft size={15} aria-hidden="true" />
            </PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={() => finish()} disabled={submitting}>
              {submitting ? 'שומר…' : 'סיימתי — בואו נתחיל'}
              <ArrowLeft size={15} aria-hidden="true" />
            </PrimaryBtn>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Standard field ─────────────────────────────────────────
function Field({ label, value, onChange, icon, hint, error, ...rest }) {
  const [focus, setFocus] = useState(false);
  const errorShown = !focus && error;
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.white,
        border: `1.5px solid ${errorShown ? T.danger : focus ? T.gold : T.border}`,
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
      {errorShown ? (
        <div style={{ fontSize: 11, color: T.danger, marginTop: 4, fontWeight: 600 }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div>
      ) : null}
    </label>
  );
}

// ─── City autocomplete — custom dropdown (not <datalist>) so
//    filtering is predictable and renders inside any flex container.
function CityField({ label, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = (value || '').trim();
    if (!q) return options.slice(0, 12);
    const lower = q.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower)).slice(0, 12);
  }, [value, options]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.white,
        border: `1.5px solid ${focus ? T.gold : T.border}`,
        borderRadius: 12, padding: '0 14px',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: focus ? '0 0 0 4px rgba(180,139,76,0.12)' : 'none',
      }}>
        <span style={{ color: T.muted, display: 'inline-flex' }}><MapPin size={16} /></span>
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange?.(e.target.value); setOpen(true); }}
          onFocus={() => { setFocus(true); setOpen(true); }}
          onBlur={() => setFocus(false)}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            ...FONT, flex: 1, border: 'none', outline: 'none', background: 'transparent',
            padding: '13px 0', fontSize: 15, color: T.ink, minWidth: 0, textAlign: 'right',
          }}
        />
        <Search size={14} style={{ color: T.muted }} />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', insetInlineStart: 0, insetInlineEnd: 0,
          background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: '0 14px 30px rgba(30,26,20,0.12)',
          maxHeight: 260, overflowY: 'auto', zIndex: 20,
          padding: 4,
        }}>
          {filtered.map((c) => (
            <button key={c} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange?.(c); setOpen(false); }}
              style={{
                ...FONT, width: '100%', textAlign: 'right', padding: '10px 12px',
                background: c === value ? T.cream2 : 'transparent',
                color: T.ink, fontSize: 14, border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
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
