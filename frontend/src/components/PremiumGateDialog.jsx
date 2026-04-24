// Sprint 5.1 — Premium gate dialog.
//
// Mounted once at the App root and opened via the `estia:premium-gate`
// window event — fired by the global 402 interceptor in lib/api.js
// whenever the backend's `requirePremium` middleware rejects a call.
// Passing the feature label through the event lets the same dialog
// cover every gated endpoint ("Estia AI", "סיכום פגישות", …) without
// the route-level code knowing anything about the UI.
//
// Visual style matches ForgotPassword / the Cream & Gold auth shell:
// inline DT palette, Assistant/Heebo font, gold primary button, ghost
// secondary. Trap focus inside the dialog while it's open and close
// on Escape or backdrop click.

import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Sparkles, ArrowLeft } from 'lucide-react';
import Portal from './Portal';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function PremiumGateDialog({ featureName, onClose }) {
  const titleId = useId();
  const descId  = useId();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);

  // Lock body scroll while the dialog is open so the page behind the
  // backdrop can't scroll under it — same pattern the notes dialog
  // uses (see PropertyNotesDialog.jsx).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Autofocus the primary CTA on open so keyboard users land on the
  // "צרו קשר" action rather than the close button. preventScroll is
  // defensive — the dialog is portaled to <body> so focus shouldn't
  // re-center the page, but older browsers ignore Portal placement.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = primaryRef.current;
      if (!el) return;
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }, 40);
    return () => clearTimeout(t);
  }, []);

  // Escape closes, and Tab / Shift+Tab is trapped inside the dialog
  // so keyboard users can't tab "behind" the modal into obscured page
  // content. Same approach as the Office dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        dir="rtl"
        lang="he"
        role="presentation"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{
          ...FONT,
          position: 'fixed', inset: 0, zIndex: 10_000,
          background: 'rgba(30,26,20,0.42)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 440,
            background: DT.cream4, color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 18, padding: '28px 26px 24px',
            boxShadow: '0 30px 80px rgba(30,26,20,0.22)',
            position: 'relative',
          }}
        >
          {/* Close (ghost) — top-start per RTL reading order. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              ...FONT, position: 'absolute', top: 12, insetInlineStart: 12,
              width: 32, height: 32, borderRadius: 10,
              background: 'transparent', border: `1px solid ${DT.border}`,
              color: DT.muted, cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>

          {/* Gold sparkle — same shape as the Estia mark on auth pages. */}
          <div style={{
            width: 56, height: 56, borderRadius: 14, marginBottom: 18,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink,
            boxShadow: '0 10px 26px rgba(180,139,76,0.28)',
          }}>
            <Sparkles size={24} aria-hidden="true" />
          </div>

          <h2
            id={titleId}
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 8px' }}
          >
            שדרגו כדי להשתמש ב-{featureName}
          </h2>
          <p
            id={descId}
            style={{ fontSize: 14, lineHeight: 1.7, color: DT.muted, margin: '0 0 22px' }}
          >
            היכולת הזאת שייכת לחבילת ה-Premium של Estia. צרו איתנו קשר
            ואנחנו נפתח לכם את הגישה תוך זמן קצר.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Primary — gold "צרו קשר" link that navigates to /contact
                and closes the dialog on activation. */}
            <Link
              ref={primaryRef}
              to="/contact"
              onClick={onClose}
              style={{
                ...FONT, flex: '1 1 auto',
                textDecoration: 'none',
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, fontWeight: 800,
                padding: '13px 18px', borderRadius: 12,
                fontSize: 15, textAlign: 'center',
                boxShadow: '0 8px 20px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              צרו קשר
              <ArrowLeft size={15} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              style={{
                ...FONT, flex: '0 1 auto',
                background: 'transparent', color: DT.muted,
                border: `1px solid ${DT.border}`,
                padding: '13px 18px', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
