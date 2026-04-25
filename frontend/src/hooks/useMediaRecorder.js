import { useCallback, useEffect, useRef, useState } from 'react';

// H3 (voice-to-lead) — thin hook around MediaRecorder + getUserMedia.
//
// State machine:
//   idle  → requesting → recording → stopping → idle (with blob)
//   any   → error      (permission denied / hardware missing / unsupported)
//
// The 3-minute cap comes from the backend extraction pipeline budget — no
// point streaming 10-minute monologues to an LLM that will drop 80% of it.
// When the cap hits we auto-stop and surface the blob like a manual stop.
//
// Exposes:
//   start()         — ask for mic permission, begin capture
//   stop()          — end capture; `blob` resolves async via state
//   reset()         — clear last blob/error so the UI can start over
//   state           — 'idle' | 'requesting' | 'recording' | 'stopping' | 'error'
//   blob            — Blob | null (final audio chunk after stop)
//   error           — { code, message } | null
//   durationMs      — running timer (updates ~4x/sec while recording)
//   permission      — 'unknown' | 'granted' | 'denied' | 'unsupported'

const MAX_DURATION_MS = 3 * 60 * 1000;

// Pick the first supported mime the browser advertises. Safari (iOS) only
// speaks `audio/mp4`; Chrome/Edge prefer `audio/webm;codecs=opus`. The
// backend accepts both — we just pass through what we got.
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* ignore */ }
  }
  return '';
}

export function useMediaRecorder({ maxDurationMs = MAX_DURATION_MS } = {}) {
  const [state, setState] = useState('idle');
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState(null);
  // VC-3 — info-level signal (not an error) for benign events like the
  // 3-minute max-duration auto-stop. Consumers can show a toast without
  // confusing it with a recording failure.
  const [notice, setNotice] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [permission, setPermission] = useState('unknown');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const capTimeoutRef = useRef(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (capTimeoutRef.current) { clearTimeout(capTimeoutRef.current); capTimeoutRef.current = null; }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      } catch { /* ignore */ }
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting' || state === 'stopping') return;
    setBlob(null);
    setError(null);
    setNotice(null);
    setDurationMs(0);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported');
      setError({ code: 'UNSUPPORTED', message: 'הדפדפן לא תומך בהקלטת שמע' });
      setState('error');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setPermission('unsupported');
      setError({ code: 'UNSUPPORTED', message: 'הדפדפן לא תומך בהקלטת שמע' });
      setState('error');
      return;
    }

    setState('requesting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // NotAllowedError / SecurityError → permission denied; others → hardware.
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        setPermission('denied');
        // VC-1 — explicit guidance for both surfaces. iOS users in the
        // Capacitor shell can't grant permission from the in-page
        // dialog (system-level), so we point them at iOS Settings.
        setError({
          code: 'PERMISSION_DENIED',
          message: 'אין גישה למיקרופון. באפליקציה: הגדרות → Estia → מיקרופון. בדפדפן: אשר/י את ההרשאה.',
        });
      } else {
        setError({ code: 'CAPTURE_FAILED', message: 'לא הצלחנו לגשת למיקרופון — נסה/י שוב' });
      }
      setState('error');
      return;
    }

    setPermission('granted');
    streamRef.current = stream;
    const mimeType = pickMimeType();
    let rec;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      // Safari sometimes rejects explicit mimeType — retry default.
      try {
        rec = new MediaRecorder(stream);
      } catch {
        setError({ code: 'CAPTURE_FAILED', message: 'לא הצלחנו לאתחל את ההקלטה' });
        setState('error');
        cleanup();
        return;
      }
    }
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      setError({ code: 'CAPTURE_FAILED', message: 'שגיאה במהלך ההקלטה' });
      setState('error');
      cleanup();
    };
    rec.onstop = () => {
      const type = mimeType || chunksRef.current[0]?.type || 'audio/webm';
      const finalBlob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setBlob(finalBlob);
      setState('idle');
      cleanup();
    };

    try { rec.start(); } catch {
      setError({ code: 'CAPTURE_FAILED', message: 'לא הצלחנו להתחיל את ההקלטה' });
      setState('error');
      cleanup();
      return;
    }
    startedAtRef.current = Date.now();
    setState('recording');

    // Tick the timer ~4x/sec so the UI shows smooth MM:SS.
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current);
    }, 250);

    // Hard cap — auto-stop when the budget runs out.
    capTimeoutRef.current = setTimeout(() => {
      try { rec.state !== 'inactive' && rec.stop(); } catch { /* ignore */ }
      // VC-3 — surface a Hebrew info-level notice so the UI can toast
      // "ההקלטה הגיעה למקסימום של 3 דקות" instead of leaving the agent
      // wondering why recording stopped on its own.
      setNotice({ code: 'MAX_DURATION', message: 'ההקלטה הגיעה למקסימום של 3 דקות' });
    }, maxDurationMs);
  }, [state, maxDurationMs, cleanup]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'inactive') return;
    setState('stopping');
    try { rec.stop(); } catch {
      setError({ code: 'CAPTURE_FAILED', message: 'עצירת ההקלטה נכשלה' });
      setState('error');
      cleanup();
    }
  }, [cleanup]);

  const reset = useCallback(() => {
    setBlob(null);
    setError(null);
    setNotice(null);
    setDurationMs(0);
    setState('idle');
  }, []);

  return { state, blob, error, notice, durationMs, permission, start, stop, reset };
}

export default useMediaRecorder;
