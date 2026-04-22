import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Square } from 'lucide-react';
import { useToast } from '../lib/toast';
import useMediaRecorder from '../hooks/useMediaRecorder';
import ConfirmDialog from './ConfirmDialog';
import './VoiceCaptureFab.css';

// Voice-to-lead is a premium feature. Until billing wiring lands, we
// gate the AI-extraction step behind a "contact support" dialog. The
// recording itself still runs so the agent gets the same affordance —
// we only intercept the upload, replacing it with the upgrade prompt.
const SUPPORT_EMAIL = 'support@estia.app';
const PREMIUM_SUBJECT = 'הפעלת פיצ׳ר הקלטה קולית — Estia';
const PREMIUM_BODY =
  'היי, אני רוצה להפעיל את פיצ׳ר הקלטת הליד הקולי בחשבון שלי.';

// H3 — voice-to-lead FAB.
//
// Always-visible, opposite corner from QuickCreateFab. Tap once starts
// recording (mic permission prompt on first use), tap again stops and
// uploads the audio to /ai/voice-lead. The response feeds the
// VoiceReviewDialog which the agent uses to confirm or tweak before
// the entity is persisted.
//
// Hidden on the same route families as QuickCreateFab (login, public
// portals, transient agent previews) — the agents never use the FAB
// there anyway and the CTA would fight nearby actions.

const HIDDEN_EXACT = new Set(['/login', '/prospect']);
const HIDDEN_PREFIXES = [
  { regex: /^\/agents\// },
  { regex: /^\/public\// },
  { regex: /^\/a\// },
  { regex: /^\/p\// },
];

function shouldHideOn(pathname) {
  if (HIDDEN_EXACT.has(pathname)) return true;
  return HIDDEN_PREFIXES.some((p) => p.regex.test(pathname));
}

function formatMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function VoiceCaptureFab() {
  const location = useLocation();
  const toast = useToast();
  const { state, blob, error, durationMs, start, stop, reset } = useMediaRecorder();

  const [premiumOpen, setPremiumOpen] = useState(false);

  // Surface permission / capture failures as toasts. Errors from the
  // hook come back as { code, message } — we already localise them.
  useEffect(() => {
    if (!error) return;
    toast.error(error.message || 'שגיאת הקלטה');
  }, [error, toast]);

  // Premium gate: when the recording finishes (blob arrives), instead
  // of uploading to the AI extraction endpoint, surface the
  // "פיצ׳ר פרימיום" upgrade dialog. Reset the recorder so a future tap
  // starts cleanly.
  useEffect(() => {
    if (!blob) return;
    setPremiumOpen(true);
    reset();
    // `reset` is a stable callback from the hook — no need to depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const onClick = useCallback(() => {
    if (state === 'recording') {
      stop();
    } else if (state === 'idle' || state === 'error') {
      start();
    }
  }, [state, start, stop]);

  // Keyboard shortcut — Cmd/Ctrl+Shift+R. R alone would clash with the
  // browser's reload; the triple combo is otherwise free (shortcuts.js
  // uses plain letters + Cmd+K). Ignored while typing into inputs.
  useEffect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key !== 'R' && e.key !== 'r') return;
      const el = document.activeElement;
      const tag = (el?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;
      e.preventDefault();
      onClick();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClick]);

  const handleContactSupport = useCallback(() => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(PREMIUM_SUBJECT)}&body=${encodeURIComponent(PREMIUM_BODY)}`;
    try { window.location.href = url; } catch { /* ignore */ }
    setPremiumOpen(false);
  }, []);

  if (shouldHideOn(location.pathname)) return null;

  const recording = state === 'recording';
  const busy = state === 'requesting' || state === 'stopping';
  const label = recording ? 'עצור הקלטה' : 'הקלטת ליד';

  return (
    <>
      <button
        type="button"
        className={`vc-fab ${recording ? 'is-recording' : ''}`}
        aria-label={label}
        aria-pressed={recording ? 'true' : 'false'}
        title="הקלטה → ליד"
        onClick={onClick}
        disabled={busy && !recording}
      >
        {recording ? (
          <>
            <Square size={18} aria-hidden="true" fill="currentColor" />
            <span className="vc-fab-timer" aria-live="polite">{formatMMSS(durationMs)}</span>
          </>
        ) : (
          <Mic size={22} aria-hidden="true" />
        )}
      </button>

      {premiumOpen && (
        <ConfirmDialog
          title="פיצ׳ר פרימיום"
          message={
            'הקלטת ליד קולית והפקת פרטי הליד באמצעות AI זמינה במסלולי פרימיום בלבד. ' +
            'נשמח להפעיל את זה עבורך — צור/י קשר עם התמיכה ונחבר אותך מיד.'
          }
          confirmLabel="צור קשר עם התמיכה"
          cancelLabel="סגור"
          onConfirm={handleContactSupport}
          onClose={() => setPremiumOpen(false)}
        />
      )}
    </>
  );
}
