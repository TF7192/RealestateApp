import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, Square } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import useMediaRecorder from '../hooks/useMediaRecorder';
import VoiceReviewDialog from './VoiceReviewDialog';
import './VoiceCaptureFab.css';

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
  const navigate = useNavigate();
  const toast = useToast();
  const { state, blob, error, durationMs, start, stop, reset } = useMediaRecorder();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [kind, setKind] = useState('LEAD');

  // Surface permission / capture failures as toasts. Errors from the
  // hook come back as { code, message } — we already localise them.
  useEffect(() => {
    if (!error) return;
    toast.error(error.message || 'שגיאת הקלטה');
  }, [error, toast]);

  // After a successful stop(), blob arrives asynchronously. Kick off
  // the upload + open the review dialog in one flow. We key the effect
  // only on `blob` so the async upload body runs exactly once per
  // recording — including `uploading` in the deps would re-fire the
  // effect when we flip it, creating a double-upload loop.
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    (async () => {
      setUploading(true);
      setDialogOpen(true);
      try {
        const res = await api.voiceLead(blob, kind);
        if (!cancelled) setResult(res);
      } catch (e) {
        if (cancelled) return;
        // 422 → LLM couldn't produce JSON; dialog still renders so the
        // agent at least keeps the transcript. Other errors close the
        // dialog and surface a toast.
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
    // `kind` / `toast` / `reset` captured at start; intentional narrow deps.
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

  const handleCreated = useCallback((entity) => {
    setDialogOpen(false);
    setResult(null);
    if (!entity?.id) return;
    if (kind === 'LEAD') navigate(`/customers/${entity.id}`);
    else navigate(`/properties/${entity.id}`);
  }, [kind, navigate]);

  if (shouldHideOn(location.pathname)) return null;

  const recording = state === 'recording';
  const busy = state === 'requesting' || state === 'stopping' || uploading;
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

      {dialogOpen && (
        <VoiceReviewDialog
          kind={kind}
          onKindChange={setKind}
          loading={uploading}
          result={result}
          onClose={() => { setDialogOpen(false); setResult(null); }}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
