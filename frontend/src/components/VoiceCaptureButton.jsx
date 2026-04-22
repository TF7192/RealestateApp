import { useCallback, useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import useMediaRecorder from '../hooks/useMediaRecorder';
import VoiceReviewDialog from './VoiceReviewDialog';
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
// Props:
//   kind          'LEAD' | 'PROPERTY' — passed through to api.voiceLead.
//   onExtracted   (extracted) => void — receives the extracted JSON
//                 object. Caller maps it into its own form keys.

function formatMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function VoiceCaptureButton({ kind = 'LEAD', onExtracted }) {
  const toast = useToast();
  const { state, blob, error, durationMs, start, stop, reset } = useMediaRecorder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [kindState, setKindState] = useState(kind);

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
    if (state === 'recording') stop();
    else if (state === 'idle' || state === 'error') start();
  }, [state, start, stop]);

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
    </>
  );
}
