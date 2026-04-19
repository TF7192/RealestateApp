import { useRef, useState } from 'react';
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
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { inputPropsForName } from '../lib/inputProps';
import { PhoneField } from '../components/SmartFields';
import './Profile.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const fileInput = useRef(null);

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
      </div>
    </div>
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
