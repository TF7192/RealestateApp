// EmailSignupModal — extracted from the original MarketDiscovery file.
// Same behavior, lighter styling: uses .btn classes and design tokens
// instead of inline DT objects.

import { useId } from 'react';
import { Mail, MailCheck, X } from 'lucide-react';
import Portal from '../../components/Portal';

export default function EmailSignupModal({
  open, onClose, emailPref, emailDraft, setEmailDraft,
  emailSaving, onSubmit, onDisable,
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <Portal>
      <div
        dir="rtl"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, zIndex: 1200,
          fontFamily: 'var(--font-body)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 440,
            maxHeight: 'calc(100dvh - 32px)',
            overflow: 'auto',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 60px rgba(30,26,20,0.25)',
            padding: 22,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--gold-glow)', color: 'var(--gold-readable)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Mail size={18} />
            </span>
            <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              רישום להתראות מייל
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="md-icon-button"
              style={{ marginInlineStart: 'auto', width: 32, height: 32 }}
            >
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
            נשלח לך מייל בכל פעם שנמצאת התאמה חדשה למתעניין פעיל — מייל אחד בלבד לכל התאמה (ללא ספאם).
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
              כתובת לקבלת ההתראות
            </span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder={emailPref?.accountEmail || 'name@example.com'}
              className="md-rail-input"
              style={{ direction: 'ltr', textAlign: 'left' }}
              autoFocus
            />
            {emailPref?.accountEmail && emailDraft !== emailPref.accountEmail && (
              <button
                type="button"
                onClick={() => setEmailDraft(emailPref.accountEmail)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                  textAlign: 'start', padding: 0,
                  textDecoration: 'underline',
                  fontFamily: 'var(--font-body)',
                }}
              >
                שחזר לכתובת ברירת המחדל ({emailPref.accountEmail})
              </button>
            )}
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {emailPref?.enabled && (
              <button
                type="button"
                onClick={onDisable}
                disabled={emailSaving}
                className="btn btn-danger btn-sm"
                style={{ marginInlineEnd: 'auto' }}
              >
                בטל רישום
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={emailSaving}
              className="btn btn-secondary btn-sm"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={emailSaving || !emailDraft}
              className="btn btn-primary btn-sm"
            >
              <MailCheck size={14} /> אשר רישום
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
