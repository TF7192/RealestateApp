import { useCallback, useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import useMediaRecorder from '../hooks/useMediaRecorder';
import VoiceReviewDialog from './VoiceReviewDialog';
import ConfirmDialog from './ConfirmDialog';
import './VoiceCaptureButton.css';

// H3 — inline voice-capture button.
//
// Lives at the top of NewLead / NewProperty. Drives the same
// useMediaRecorder hook as the FAB, but on success it calls the
// provided onExtracted(extracted) so the caller can hydrate its
// existing form state — agents who opened the blank form still see
// the voice shortcut, but the resulting fields flow into the form
// they were already filling instead of opening the review dialog.
//
// N-16 — voice capture is a PREMIUM feature. Before this change the
// gate existed only on <VoiceCaptureFab>; NewLead AND NewProperty
// embed this component directly, so tapping here would bypass the
// upgrade dialog and send audio straight to the AI endpoint. The same
// "contact support" dialog from the FAB now runs here too — the
// recording never starts until product decides to flip the flag per-user.
//
// Props:
//   kind          'LEAD' | 'PROPERTY' — passed through to api.voiceLead.
//   onExtracted   (extracted) => void — receives the extracted JSON
//                 object. Caller maps it into its own form keys.

const SUPPORT_EMAIL = 'support@estia.app';
const PREMIUM_SUBJECT = 'הפעלת פיצ׳ר הקלטה קולית — Estia';
const PREMIUM_BODY =
  'היי, אני רוצה להפעיל את פיצ׳ר הקלטת הליד הקולי בחשבון שלי.';

function formatMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function VoiceCaptureButton({ kind = 'LEAD', onExtracted }) {
  const toast = useToast();
  // `start` intentionally omitted — N-16 premium gate intercepts the click
  // before any recording can begin. Keeping it in scope would drift the
  // contract from the FAB, which also doesn't start until the gate clears.
  const { state, blob, error, durationMs, stop, reset } = useMediaRecorder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [kindState, setKindState] = useState(kind);
  // N-16 — shared premium gate (same copy as <VoiceCaptureFab>).
  const [premiumOpen, setPremiumOpen] = useState(false);

  useEffect(() => { setKindState(kind); }, [kind]);

  useEffect(() => {
    if (!error) return;
    toast.error(error.message || 'שגיאת הקלטה');
  }, [error, toast]);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    (async () => {
      setUploading(true);
      setDialogOpen(true);
      try {
        const res = await api.voiceLead(blob, kindState);
        if (!cancelled) setResult(res);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 422 && e?.data) {
          setResult({
            transcript: e.data?.transcript || '',
            extracted: {},
            mode: 'draft',
            traceId: e.data?.traceId || null,
          });
        } else {
          toast.error(e?.message || 'העלאת ההקלטה נכשלה');
          setDialogOpen(false);
        }
      } finally {
        if (!cancelled) {
          setUploading(false);
          reset();
        }
      }
    })();
    return () => { cancelled = true; };
    // Narrow deps on purpose — see VoiceCaptureFab for the why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const onClick = useCallback(() => {
    if (state === 'recording') {
      stop();
      return;
    }
    // N-16 — never start a recording for a non-premium agent. The same
    // "contact support" dialog the FAB shows fires here so the gate is
    // consistent whether the agent taps the floating mic or the inline
    // button at the top of NewLead / NewProperty.
    if (state === 'idle' || state === 'error') {
      setPremiumOpen(true);
    }
  }, [state, stop]);

  const handleContactSupport = useCallback(() => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(PREMIUM_SUBJECT)}&body=${encodeURIComponent(PREMIUM_BODY)}`;
    try { window.location.href = url; } catch { /* ignore */ }
    setPremiumOpen(false);
  }, []);

  // Closing the dialog without saving still hydrates the caller form
  // when we have extracted fields — the agent's voice work shouldn't
  // go to waste because they preferred the manual form.
  const handleClose = useCallback(() => {
    if (result?.extracted && onExtracted) onExtracted(result.extracted);
    setDialogOpen(false);
    setResult(null);
  }, [result, onExtracted]);

  // When the dialog saves, pipe through both the extracted fields and
  // the created entity (if any) so the caller can decide whether to
  // navigate or just update its own state.
  const handleCreated = useCallback((entity) => {
    if (result?.extracted && onExtracted) onExtracted(result.extracted);
    setDialogOpen(false);
    setResult(null);
    if (entity?.id) {
      // Parent form decides navigation; passing the entity lets it
      // show a success toast or route if it wants.
      onExtracted?.({ __created: entity });
    }
  }, [result, onExtracted]);

  const recording = state === 'recording';
  const busy = state === 'requesting' || state === 'stopping' || uploading;
  const label = recording
    ? 'עצור הקלטה'
    : kind === 'PROPERTY'
      ? 'דבר במקום להקליד — נכס'
      : 'דבר במקום להקליד — ליד';

  return (
    <>
      <button
        type="button"
        className={`vc-inline-btn ${recording ? 'is-recording' : ''}`}
        onClick={onClick}
        aria-label={label}
        aria-pressed={recording ? 'true' : 'false'}
        disabled={busy && !recording}
      >
        <span className="vc-inline-icon" aria-hidden="true">
          {recording ? <Square size={14} fill="currentColor" /> : <Mic size={14} />}
        </span>
        <span>
          {recording
            ? 'עצור'
            : kind === 'PROPERTY'
              ? 'דבר במקום להקליד 🎙️'
              : 'דבר במקום להקליד 🎙️'}
        </span>
        {recording && (
          <span className="vc-inline-btn-timer" aria-live="polite">
            {formatMMSS(durationMs)}
          </span>
        )}
      </button>

      {dialogOpen && (
        <VoiceReviewDialog
          kind={kindState}
          onKindChange={setKindState}
          loading={uploading}
          result={result}
          onClose={handleClose}
          onCreated={handleCreated}
        />
      )}

      {/* N-16 — premium-gate dialog. Copy matches <VoiceCaptureFab>. */}
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
