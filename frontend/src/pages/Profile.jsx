import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Save,
  ArrowRight,
  Share2,
  Check,
  Copy,
  User,
  Building2,
  Mail,
  Phone,
  IdCard,
  FileText,
  AlertCircle,
  Sun,
  Moon,
  Palette,
  Calendar,
  LinkIcon,
  Unlink,
  Trash2,
  X as XIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useTheme } from '../lib/theme';
import { inputPropsForName } from '../lib/inputProps';
import { PhoneField } from '../components/SmartFields';
import './Profile.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, refresh, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const fileInput = useRef(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    phone: user?.phone || '',
    agency: user?.agentProfile?.agency || '',
    title: user?.agentProfile?.title || '',
    license: user?.agentProfile?.license || '',
    bio: user?.agentProfile?.bio || '',
  });
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.updateMe({
        displayName: form.displayName,
        phone: form.phone || null,
        agentProfile: {
          agency: form.agency || null,
          title: form.title || null,
          license: form.license || null,
          bio: form.bio || null,
        },
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const r = await api.uploadAvatar(file);
      setAvatarUrl(r.user?.avatarUrl || r.url);
      await refresh();
    } catch (e) {
      setErr(e.message || 'העלאת תמונה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  const catalogUrl = user.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}`
    : `${window.location.origin}/a/${user.id}`;
  const copyCatalog = () => {
    navigator.clipboard.writeText(catalogUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const previewInitials = (form.displayName || user.displayName || '?').charAt(0);

  return (
    <div className="profile-page">
      <button className="back-link profile-back" onClick={() => navigate(-1)}>
        <ArrowRight size={16} />
        חזרה
      </button>

      <div className="profile-hero animate-in">
        <div className="profile-hero-plate" aria-hidden="true" />
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={form.displayName} />
              ) : (
                <span className="profile-avatar-initials">{previewInitials}</span>
              )}
            </div>
            <button
              className="profile-avatar-edit"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              title="החלף תמונה"
            >
              <Camera size={14} />
              {uploading ? 'מעלה…' : 'שנה תמונה'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
            />
          </div>

          <div className="profile-hero-text">
            <span className="profile-hero-eyebrow">הפרופיל שלי</span>
            <h1 className="profile-hero-name">{form.displayName || '—'}</h1>
            <div className="profile-hero-meta">
              {form.title && <span>{form.title}</span>}
              {form.title && form.agency && <span className="dot">·</span>}
              {form.agency && <span className="agency">{form.agency}</span>}
            </div>
            <div className="profile-hero-row">
              <Mail size={14} />
              <span>{user.email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Public catalog share card */}
      <div className="profile-share-card animate-in animate-in-delay-1">
        <div className="profile-share-main">
          <div className="profile-share-icon"><Share2 size={18} /></div>
          <div>
            <h3>הקטלוג הציבורי שלך</h3>
            <p>
              הפרטים בצד זה — כולל תמונתך והתיאור — הם מה שלקוחות רואים כשאתה
              משתף איתם את הקישור הבא:
            </p>
            <code>{catalogUrl}</code>
          </div>
        </div>
        <div className="profile-share-actions">
          <a
            href={catalogUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            <Building2 size={14} />
            תצוגה מקדימה
          </a>
          <button className="btn btn-primary" onClick={copyCatalog}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'הועתק' : 'העתק קישור'}
          </button>
        </div>
      </div>

      {/* Editable details */}
      <div className="profile-grid animate-in animate-in-delay-2">
        <section className="profile-section">
          <div className="profile-section-head">
            <User size={16} />
            <h3>פרטים אישיים</h3>
            <span>מה שמופיע ללקוחות על הקישור הציבורי</span>
          </div>
          <div className="profile-form-grid">
            <Field label="שם מלא" icon={User}>
              <input
                className="form-input"
                value={form.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="יוסי כהן"
                {...inputPropsForName()}
              />
            </Field>
            <Field label="טלפון" icon={Phone} dir="ltr">
              <PhoneField
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </Field>
            <Field label="תפקיד" icon={IdCard}>
              <input
                autoCapitalize="words"
                autoCorrect="off"
                enterKeyHint="next"
                className="form-input"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="סוכן נדל״ן בכיר"
              />
            </Field>
            <Field label="סוכנות" icon={Building2}>
              <input
                autoCapitalize="words"
                autoCorrect="off"
                enterKeyHint="next"
                className="form-input"
                value={form.agency}
                onChange={(e) => update('agency', e.target.value)}
                placeholder="רימקס פרמיום"
              />
            </Field>
            <Field label="רישיון" icon={IdCard}>
              <input
                className="form-input"
                value={form.license}
                onChange={(e) => update('license', e.target.value)}
                placeholder="12345"
              />
            </Field>
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-section-head">
            <FileText size={16} />
            <h3>ביוגרפיה</h3>
            <span>טקסט קצר שיוצג ללקוחות מעל רשימת הנכסים</span>
          </div>
          <textarea
            className="profile-bio"
            rows={6}
            maxLength={500}
            dir="auto"
            autoCapitalize="sentences"
            enterKeyHint="enter"
            value={form.bio}
            onChange={(e) => update('bio', e.target.value)}
            placeholder="ספר/י על עצמך בכמה משפטים — ניסיון, אזורי פעילות, גישה..."
          />
          <div className="profile-bio-counter">
            {form.bio.length} / 500
          </div>
        </section>

        {/* 7.1 — Google Calendar connection. Shows status + connect/disconnect
            CTA. The redirect URL is handled server-side; after OAuth the user
            lands back on /profile?calendar=connected. */}
        <CalendarSection />

        {/* P5-M5: theme toggle reachable on mobile without needing the sidebar */}
        <section className="profile-section">
          <div className="profile-section-head">
            <Palette size={16} />
            <h3>מראה</h3>
            <span>בהיר / כהה — נשמר במכשיר</span>
          </div>
          <div className="profile-theme-row">
            <button
              type="button"
              className={`profile-theme-opt ${theme === 'light' ? 'sel' : ''}`}
              onClick={() => { if (theme !== 'light') toggleTheme(); }}
            >
              <Sun size={18} />
              <div>
                <strong>בהיר</strong>
                <small>יומי, קלאסי</small>
              </div>
            </button>
            <button
              type="button"
              className={`profile-theme-opt ${theme === 'dark' ? 'sel' : ''}`}
              onClick={() => { if (theme !== 'dark') toggleTheme(); }}
            >
              <Moon size={18} />
              <div>
                <strong>כהה</strong>
                <small>לילה, נוח לעיניים</small>
              </div>
            </button>
          </div>
        </section>

        {err && (
          <div className="profile-error">
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <div className="profile-save-bar">
          <button
            className="btn btn-primary btn-lg"
            onClick={save}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'שומר…' : saved ? 'נשמר' : 'שמור שינויים'}
            {saved && <Check size={16} />}
          </button>
        </div>

        {/* A-1 — destructive surface. Lives at the bottom of Profile so
            the agent has to scroll past everything else to find it. The
            confirmation dialog is the actual guard (type-the-phrase). */}
        <section className="profile-section profile-danger-zone">
          <div className="profile-section-head">
            <AlertCircle size={16} />
            <h3>אזור מסוכן</h3>
            <span>פעולות בלתי הפיכות</span>
          </div>
          <div className="profile-danger-row">
            <div className="profile-danger-text">
              <strong>מחיקת חשבון</strong>
              <span>
                מחיקת החשבון מסירה את כל הגישה שלך ל-Estia לצמיתות.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={14} /> מחק חשבון
            </button>
          </div>
        </section>
      </div>

      {deleteOpen && (
        <DeleteAccountDialog
          onClose={() => setDeleteOpen(false)}
          onConfirmed={async () => {
            try {
              await api.deleteAccount();
            } catch {
              // Even on failure we still sign the user out + send them to
              // the landing; the server call is idempotent and the UI's
              // obligation is "act like the account is gone".
            }
            try { await logout(); } catch { /* ignore */ }
            toast.info('החשבון נמחק');
            // Full navigation so any cached state from the previous
            // session doesn't leak into the landing shell.
            window.location.href = '/';
          }}
        />
      )}
    </div>
  );
}

// A-1 — scary confirmation dialog. Require typing the exact phrase
// "מחק את החשבון שלי" before enabling the destructive CTA. Blocks
// pocket-taps, muscle-memory clicks, and "I'll just click through"
// panic-quits. The destructive button styling is .btn-danger.
const CONFIRM_PHRASE = 'מחק את החשבון שלי';

function DeleteAccountDialog({ onClose, onConfirmed }) {
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canConfirm = phrase.trim() === CONFIRM_PHRASE;

  const confirm = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await onConfirmed();
    } finally {
      setSubmitting(false);
    }
  };

  // Close on ESC. Enter doesn't fire the destructive action — we don't
  // want a stray Enter keypress after typing the phrase to trigger
  // deletion; the user must aim at the button.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="profile-delete-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="profile-delete-dialog" dir="rtl">
        <button
          type="button"
          className="profile-delete-close"
          onClick={onClose}
          aria-label="סגור"
        >
          <XIcon size={16} />
        </button>
        <h2 id="delete-account-title">מחיקת חשבון</h2>
        <p className="profile-delete-warning">
          פעולה זו תמחק את חשבונך וכל הנתונים שלך לצמיתות. לא ניתן לבטל פעולה זו.
        </p>
        <label className="profile-delete-confirm">
          <span>
            כדי להמשיך, הקלד/י: <code>{CONFIRM_PHRASE}</code>
          </span>
          <input
            type="text"
            className="form-input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label="אישור מחיקה"
            autoFocus
          />
        </label>
        <div className="profile-delete-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={confirm}
            disabled={!canConfirm || submitting}
          >
            {submitting ? 'מוחק…' : 'מחק לצמיתות'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 7.1 — Google Calendar connection widget.
function CalendarSection() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.calendarStatus().then(setStatus).catch(() => setStatus({ connected: false, configured: false }));
  };

  useEffect(() => { refresh(); }, []);

  // Handle the callback bounce from backend — clears the ?calendar=…
  // param and refreshes the status.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('calendar')) {
      sp.delete('calendar');
      const next = window.location.pathname + (sp.toString() ? `?${sp.toString()}` : '');
      window.history.replaceState({}, '', next);
      refresh();
    }
  }, []);

  // F-20 — tab-visibility refetch. If the agent connects Calendar in a
  // second tab (common OAuth UX) this tab would otherwise show the
  // stale "not connected" state until a hard reload.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const connect = () => {
    // Full-page navigation so the OAuth cookie state is set in the
    // same-origin request the backend expects.
    window.location.href = '/api/integrations/calendar/connect';
  };
  const disconnect = async () => {
    setBusy(true);
    try { await api.calendarDisconnect(); } catch { /* ignore */ }
    setBusy(false);
    refresh();
  };

  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <Calendar size={16} />
        <h3>Google Calendar</h3>
        <span>תזמון פגישות עם לידים — יסתנכרן ליומן שלך</span>
      </div>
      {status?.configured === false ? (
        <div className="profile-cal-row profile-cal-warn">
          האינטגרציה לא הוגדרה בצד השרת. נא ליצור קשר עם הצוות הטכני.
        </div>
      ) : status?.connected ? (
        <div className="profile-cal-row profile-cal-ok">
          <Check size={14} />
          <div className="profile-cal-text">
            <strong>מחובר</strong>
            <span>פגישות שתיצור מעמוד הליד יופיעו אוטומטית ביומן שלך.</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={disconnect} disabled={busy}>
            <Unlink size={13} /> נתק
          </button>
        </div>
      ) : (
        <div className="profile-cal-row">
          <div className="profile-cal-text">
            <strong>לא מחובר</strong>
            <span>התחבר כדי שפגישות שתתזמן עם לידים יוצרו אוטומטית ב-Google Calendar.</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={connect}>
            <LinkIcon size={13} /> חבר Google Calendar
          </button>
        </div>
      )}
    </section>
  );
}

function Field({ label, icon: Icon, children, dir }) {
  return (
    <label className="profile-field" style={dir ? { direction: dir } : {}}>
      <span className="profile-field-label">
        {Icon && <Icon size={12} />}
        {label}
      </span>
      {children}
    </label>
  );
}
