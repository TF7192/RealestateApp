// Profile — port of the claude.ai/design bundle with inline Cream &
// Gold styles. Identity card + editable form + public-catalog share +
// Google Calendar connection + destructive zone. No fixtures; every
// mutation goes through the existing API client.
//
// The dark-theme toggle was removed in a25afa7 — the app is Cream &
// Gold only per the port.

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
  Calendar,
  LinkIcon,
  Unlink,
  Trash2,
  X as XIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { inputPropsForName } from '../lib/inputProps';
import { PhoneField } from '../components/SmartFields';
import ShareDialog from '../components/ShareDialog';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function Profile() {
  const navigate = useNavigate();
  const { user, refresh, logout } = useAuth();
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
  // Sprint 7 — universal Share dialog for the public catalog link.
  const [shareOpen, setShareOpen] = useState(false);

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
    <div dir="rtl" style={{
      ...FONT, padding: 28, color: DT.ink, minHeight: '100%',
      background: DT.cream,
    }}>
      {/* Top toolbar — back link */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            ...FONT, background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DT.muted, fontSize: 13, fontWeight: 700, padding: 0,
          }}
        >
          <ArrowRight size={16} />
          חזרה
        </button>
      </div>

      {/* Header card — avatar + identity */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 88, height: 88, borderRadius: 99,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink, display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: 34, overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(180,139,76,0.25)',
          }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={form.displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>{previewInitials}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            title="החלף תמונה"
            style={{
              ...FONT,
              position: 'absolute', bottom: -6, insetInlineStart: -6,
              background: DT.white, border: `1px solid ${DT.border}`,
              color: DT.ink, padding: '5px 9px', borderRadius: 99,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              boxShadow: '0 2px 6px rgba(30,26,20,0.12)',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Camera size={12} />
            {uploading ? 'מעלה…' : 'שנה'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
          />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, color: DT.goldDark,
            background: DT.goldSoft, padding: '3px 10px', borderRadius: 99,
            letterSpacing: 0.3, marginBottom: 6,
          }}>
            הפרופיל שלי
          </span>
          <h1 style={{
            fontSize: 24, fontWeight: 800, letterSpacing: -0.5,
            margin: 0, color: DT.ink,
          }}>
            {form.displayName || '—'}
          </h1>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: DT.muted, marginTop: 6, flexWrap: 'wrap',
          }}>
            {form.title && <span>{form.title}</span>}
            {form.title && form.agency && <span>·</span>}
            {form.agency && <span style={{ fontWeight: 700 }}>{form.agency}</span>}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: DT.muted, marginTop: 6,
          }}>
            <Mail size={14} />
            <span>{user.email}</span>
          </div>
        </div>
      </div>

      {/* Public catalog share card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 260 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: DT.goldSoft, color: DT.goldDark,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Share2 size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: 14, fontWeight: 800, margin: '0 0 4px',
              color: DT.ink, letterSpacing: -0.2,
            }}>
              הקטלוג הציבורי שלך
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: DT.muted, lineHeight: 1.5 }}>
              הפרטים בצד זה — כולל תמונתך והתיאור — הם מה שלקוחות רואים כשאתה
              משתף איתם את הקישור הבא:
            </p>
            <code style={{
              display: 'inline-block', background: DT.cream4,
              border: `1px solid ${DT.border}`, borderRadius: 8,
              padding: '6px 10px', fontSize: 12, color: DT.ink2,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak: 'break-all', direction: 'ltr',
            }}>
              {catalogUrl}
            </code>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a
            href={catalogUrl}
            target="_blank"
            rel="noreferrer"
            style={secondaryBtn()}
          >
            <Building2 size={14} />
            תצוגה מקדימה
          </a>
          <button type="button" onClick={copyCatalog} style={secondaryBtn()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'הועתק' : 'העתק קישור'}
          </button>
          {/* Sprint 7 — universal channel picker. Opens WhatsApp / SMS /
           *  email / link-copy / OS share for the agent's public catalog. */}
          <button type="button" onClick={() => setShareOpen(true)} style={primaryBtn()}>
            <Share2 size={14} />
            שתף קטלוג
          </button>
        </div>
      </div>

      {shareOpen && (
        <ShareDialog
          kind="catalog"
          entity={{ url: catalogUrl, agentName: user.displayName }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Editable details — grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={sectionCard()} aria-label="פרטים אישיים">
          <h3 style={sectionTitle()}>
            <User size={16} /> פרטים אישיים
            <span style={sectionSubtitle()}>
              מה שמופיע ללקוחות על הקישור הציבורי
            </span>
          </h3>
          <div style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
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

        <section style={sectionCard()} aria-label="ביוגרפיה">
          <h3 style={sectionTitle()}>
            <FileText size={16} /> ביוגרפיה
            <span style={sectionSubtitle()}>
              טקסט קצר שיוצג ללקוחות מעל רשימת הנכסים
            </span>
          </h3>
          <textarea
            className="form-textarea"
            rows={6}
            maxLength={500}
            dir="auto"
            autoCapitalize="sentences"
            enterKeyHint="enter"
            value={form.bio}
            onChange={(e) => update('bio', e.target.value)}
            placeholder="ספר/י על עצמך בכמה משפטים — ניסיון, אזורי פעילות, גישה..."
            style={{
              ...FONT,
              width: '100%', boxSizing: 'border-box',
              background: DT.cream4, border: `1px solid ${DT.border}`,
              borderRadius: 10, padding: '10px 12px',
              fontSize: 14, color: DT.ink, resize: 'vertical',
              minHeight: 120, lineHeight: 1.5,
            }}
          />
          <div style={{
            marginTop: 6, fontSize: 11, color: DT.muted,
            textAlign: 'end', fontWeight: 700,
          }}>
            {form.bio.length} / 500
          </div>
        </section>

        {/* 7.1 — Google Calendar connection. Shows status + connect/disconnect
            CTA. The redirect URL is handled server-side; after OAuth the user
            lands back on /profile?calendar=connected. */}
        <CalendarSection />

        {err && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(185,28,28,0.08)', color: DT.danger,
            padding: '8px 12px', borderRadius: 10, fontSize: 13,
            alignSelf: 'flex-start',
          }}>
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              ...primaryBtn(),
              padding: '11px 20px', fontSize: 14,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={16} />
            {saving ? 'שומר…' : saved ? 'נשמר' : 'שמור שינויים'}
            {saved && <Check size={16} />}
          </button>
        </div>

        {/* A-1 — destructive surface. Lives at the bottom of Profile so
            the agent has to scroll past everything else to find it. The
            confirmation dialog is the actual guard (type-the-phrase). */}
        <section
          style={{
            ...sectionCard(),
            borderColor: 'rgba(185,28,28,0.2)',
            background: 'rgba(185,28,28,0.03)',
          }}
          aria-label="אזור מסוכן"
        >
          <h3 style={{ ...sectionTitle(), color: DT.danger }}>
            <AlertCircle size={16} /> אזור מסוכן
            <span style={sectionSubtitle()}>פעולות בלתי הפיכות</span>
          </h3>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
              <strong style={{ fontSize: 13, color: DT.ink }}>מחיקת חשבון</strong>
              <span style={{ fontSize: 12, color: DT.muted }}>
                מחיקת החשבון מסירה את כל הגישה שלך ל-Estia לצמיתות.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              style={dangerBtn()}
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
// panic-quits.
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(30,26,20,0.45)',
        display: 'grid', placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        dir="rtl"
        style={{
          ...FONT,
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 16, padding: 24, position: 'relative',
          width: '100%', maxWidth: 460, color: DT.ink,
          boxShadow: '0 20px 50px rgba(30,26,20,0.35)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          style={{
            position: 'absolute', top: 10, insetInlineStart: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 6, borderRadius: 8, color: DT.muted,
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          <XIcon size={16} />
        </button>
        <h2
          id="delete-account-title"
          style={{
            fontSize: 18, fontWeight: 800, margin: '0 0 10px',
            color: DT.ink, letterSpacing: -0.3,
          }}
        >
          מחיקת חשבון
        </h2>
        <p style={{
          margin: '0 0 14px', fontSize: 13, color: DT.muted, lineHeight: 1.5,
        }}>
          פעולה זו תמחק את חשבונך וכל הנתונים שלך לצמיתות. לא ניתן לבטל פעולה זו.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: DT.ink, fontWeight: 700 }}>
            כדי להמשיך, הקלד/י:{' '}
            <code style={{
              background: DT.cream4, border: `1px solid ${DT.border}`,
              borderRadius: 6, padding: '2px 6px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12, color: DT.ink2,
            }}>
              {CONFIRM_PHRASE}
            </code>
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
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16,
          flexWrap: 'wrap',
        }}>
          <button type="button" onClick={onClose} style={secondaryBtn()}>
            ביטול
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm || submitting}
            style={{
              ...dangerBtn(),
              opacity: !canConfirm || submitting ? 0.5 : 1,
              cursor: !canConfirm || submitting ? 'not-allowed' : 'pointer',
            }}
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
    <section style={sectionCard()} aria-label="Google Calendar">
      <h3 style={sectionTitle()}>
        <Calendar size={16} /> Google Calendar
        <span style={sectionSubtitle()}>
          תזמון פגישות עם לידים — יסתנכרן ליומן שלך
        </span>
      </h3>
      {status?.configured === false ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(180,83,9,0.08)', color: '#b45309',
          padding: '8px 12px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={14} />
          האינטגרציה לא הוגדרה בצד השרת. נא ליצור קשר עם הצוות הטכני.
        </div>
      ) : status?.connected ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(21,128,61,0.06)',
          border: `1px solid rgba(21,128,61,0.15)`,
          borderRadius: 10, padding: '12px 14px', flexWrap: 'wrap',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 99,
            background: 'rgba(21,128,61,0.15)', color: DT.success,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Check size={14} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 180 }}>
            <strong style={{ fontSize: 13, color: DT.ink }}>מחובר</strong>
            <span style={{ fontSize: 12, color: DT.muted }}>
              פגישות שתיצור מעמוד הליד יופיעו אוטומטית ביומן שלך.
            </span>
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            style={{
              ...secondaryBtn(),
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Unlink size={13} /> נתק
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: DT.cream4, border: `1px solid ${DT.border}`,
          borderRadius: 10, padding: '12px 14px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 180 }}>
            <strong style={{ fontSize: 13, color: DT.ink }}>לא מחובר</strong>
            <span style={{ fontSize: 12, color: DT.muted }}>
              התחבר כדי שפגישות שתתזמן עם לידים יוצרו אוטומטית ב-Google Calendar.
            </span>
          </div>
          <button type="button" onClick={connect} style={primaryBtn()}>
            <LinkIcon size={13} /> חבר Google Calendar
          </button>
        </div>
      )}
    </section>
  );
}

function Field({ label, icon: Icon, children, dir }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      direction: dir || undefined,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {Icon && <Icon size={12} />}
        {label}
      </span>
      {children}
    </label>
  );
}

function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2, flexWrap: 'wrap',
  };
}
function sectionSubtitle() {
  return {
    fontSize: 12, fontWeight: 500, color: DT.muted, marginInlineStart: 4,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function dangerBtn() {
  return {
    ...FONT, background: 'rgba(185,28,28,0.08)', border: `1px solid rgba(185,28,28,0.2)`,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.danger,
  };
}
