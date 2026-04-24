import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import haptics from '../lib/haptics';
import { useToast } from '../lib/toast';

// Sprint 5 / AI — meeting voice summariser card.
//
// Shows the persisted summary when one exists on the meeting row, or a
// "🎙️ הקלטה" button otherwise. Uses the browser MediaRecorder API
// to capture audio/webm; on stop it POSTs the blob to
// /api/meetings/:id/summarize and renders the returned structured
// summary. While the request is in flight it shows a "מסכם…"
// placeholder so the agent knows the app is working.
//
// No fallback UI for browsers without MediaRecorder (iOS ≤14 Safari);
// the component renders a short Hebrew note instead so the agent
// knows why the button isn't there.

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function supportsMediaRecorder() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator?.mediaDevices?.getUserMedia;
}

export default function MeetingSummarizerCard({ meeting, onUpdated }) {
  const toast = useToast();
  const [state, setState] = useState('idle'); // 'idle' | 'recording' | 'uploading' | 'done' | 'error'
  const [err, setErr] = useState(null);
  const [current, setCurrent] = useState(meeting);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Keep `current` in sync when the parent passes a fresh meeting
  // object (e.g. after a calendar refresh).
  useEffect(() => { setCurrent(meeting); }, [meeting]);

  // Stop microphone tracks when the component unmounts mid-recording —
  // otherwise the browser keeps the red indicator on.
  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const hasSummary = !!(current?.summary || current?.summaryJson);
  const summaryJson = current?.summaryJson || null;
  const actionItems = Array.isArray(summaryJson?.actionItems) ? summaryJson.actionItems : [];
  const nextSteps   = Array.isArray(summaryJson?.nextSteps)   ? summaryJson.nextSteps   : [];

  const handleStart = async () => {
    setErr(null);
    if (!supportsMediaRecorder()) {
      setErr('הדפדפן הזה לא תומך בהקלטה. נסה/י בדפדפן עדכני.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => handleUpload();
      recorderRef.current = rec;
      rec.start();
      haptics?.press?.();
      setState('recording');
    } catch (e) {
      setErr(e?.message || 'ההרשאה להקלטה נדחתה');
      setState('error');
    }
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch { /* already stopped */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleUpload = async () => {
    setState('uploading');
    setErr(null);
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    // File — so the server sees a filename on the multipart part. The
    // `name` is purely cosmetic; the backend key is agent/meeting ids.
    const file = new File([blob], `meeting-${current.id}.webm`, { type: 'audio/webm' });
    try {
      const res = await api.summarizeMeeting(current.id, file);
      const updated = res?.meeting ?? null;
      if (updated) {
        setCurrent(updated);
        onUpdated?.(updated);
        toast.success('סיכום פגישה נוצר');
      }
      setState('done');
    } catch (e) {
      const code = e?.data?.error?.code;
      if (code === 'ai_not_configured') {
        setErr('שירות ה-AI לא מוגדר בסביבה הזו');
      } else if (code === 'audio_too_large') {
        setErr('קובץ ההקלטה גדול מדי');
      } else {
        setErr(e?.message || 'הסיכום נכשל. נסה/י שוב.');
      }
      setState('error');
    }
  };

  const recording = state === 'recording';
  const uploading = state === 'uploading';

  return (
    <section
      aria-label="סיכום פגישה"
      style={{
        ...FONT,
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: 20,
        color: DT.ink,
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 8,
      }}>
        <h3 style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 800, margin: 0, color: DT.ink,
          letterSpacing: -0.2,
        }}>
          <Sparkles size={14} style={{ color: DT.goldDark }} />
          סיכום פגישה
        </h3>
        {/* Record / stop / pending button — not rendered while showing
            an existing summary so the card stays read-only until the
            agent explicitly re-records. */}
        {!hasSummary && state !== 'uploading' && (
          recording ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label="עצור הקלטה"
              style={stopBtn()}
            >
              <Square size={12} /> עצור
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              style={primaryBtn()}
              aria-label="התחל הקלטה"
            >
              <Mic size={12} /> הקלטה
            </button>
          )
        )}
      </header>

      {/* Recording state */}
      {recording && (
        <div style={pendingRow(DT.goldSoft, DT.goldDark)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 99, background: DT.danger,
              animation: 'estia-pulse 1.2s ease-in-out infinite',
            }} />
            מקליט — לחץ/י "עצור" כדי לסיים
          </span>
        </div>
      )}

      {/* Uploading / summarising state */}
      {uploading && (
        <div style={pendingRow(DT.goldSoft, DT.goldDark)}>
          <Loader2 size={14} className="estia-spin" />
          מסכם…
        </div>
      )}

      {/* Error banner */}
      {err && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(185,28,28,0.08)',
          border: `1px solid rgba(185,28,28,0.2)`,
          color: DT.danger,
          fontSize: 12.5, marginBottom: hasSummary ? 12 : 0,
        }}>
          <AlertCircle size={12} /> {err}
        </div>
      )}

      {/* Persisted summary */}
      {hasSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={cream4Card()}>
            <span style={subLabel()}>סיכום</span>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.6 }}>
              {summaryJson?.summary || current?.summary}
            </p>
          </div>
          {actionItems.length > 0 && (
            <div style={cream4Card()}>
              <span style={subLabel()}>פעולות</span>
              <ul style={listStyle()}>
                {actionItems.map((item, i) => <li key={`a-${i}`}>{item}</li>)}
              </ul>
            </div>
          )}
          {nextSteps.length > 0 && (
            <div style={cream4Card()}>
              <span style={subLabel()}>צעדים להמשך</span>
              <ul style={listStyle()}>
                {nextSteps.map((item, i) => <li key={`n-${i}`}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Empty-state helper copy */}
      {!hasSummary && !recording && !uploading && !err && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: DT.muted, lineHeight: 1.6 }}>
          הקלט/י את הפגישה ותקבל/י סיכום מובנה עם משימות להמשך.
        </p>
      )}

      <style>{`
        @keyframes estia-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.85); }
        }
        .estia-spin { animation: estia-spin 0.9s linear infinite; }
        @keyframes estia-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    display: 'inline-flex', gap: 5, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
  };
}

function stopBtn() {
  return {
    ...FONT,
    background: DT.white,
    border: `1px solid ${DT.danger}`,
    color: DT.danger,
    padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    display: 'inline-flex', gap: 5, alignItems: 'center',
  };
}

function pendingRow(bg, fg) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 12px',
    background: bg, color: fg,
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
    fontSize: 13, fontWeight: 600,
  };
}

function cream4Card() {
  return {
    padding: '12px 14px',
    background: DT.cream4,
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
  };
}

function subLabel() {
  return {
    fontSize: 11, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.3,
  };
}

function listStyle() {
  return {
    margin: '6px 0 0', paddingInlineStart: 20,
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: 13, lineHeight: 1.6, color: DT.ink,
  };
}
