// Voice-capture dialog — shared by /leads/new and /properties/new (and
// the /voice-demo page still mounts it as its whole body). Records up
// to 2 minutes, hits /api/voice/demo-ingest (Whisper + Claude Haiku
// extraction), and renders the extracted {kind, fields} with every
// field editable inline before the agent commits to a page prefill.
//
// Detection:
//   - kind === 'lead'     → "Use as lead" CTA prefills NewLead.
//   - kind === 'property' → "Use as property" CTA prefills NewProperty.
// If the extracted kind disagrees with the caller's `preferKind`, we
// surface a banner offering the right destination; confirming stashes
// the payload in sessionStorage (`estia-voice-prefill`) and navigates.
//
// Design tokens + typography match the surrounding Cream & Gold pages
// (inline DT styles — no new CSS). Focus trap + Escape close via the
// existing useFocusTrap hook.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic, Square, Loader2, Sparkles, X as XIcon, ArrowLeftRight,
  Edit3, AlertTriangle, CheckCircle2, Trash2, Plus,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast.jsx';
import useFocusTrap from '../hooks/useFocusTrap';

const MAX_SECONDS = 120;
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Hebrew labels for fields emitted by the Haiku extractor. Anything
// unlisted falls back to the raw key (the user can still see + edit).
const LEAD_LABELS = {
  name: 'שם מלא',
  phone: 'טלפון',
  email: 'דוא״ל',
  city: 'עיר',
  street: 'רחוב',
  rooms: 'חדרים',
  budget: 'תקציב (₪)',
  priceRangeLabel: 'טווח מחירים',
  lookingFor: 'חיפוש (קנייה / שכירות)',
  sector: 'מגזר',
  notes: 'הערות',
  source: 'מקור',
};
const PROPERTY_LABELS = {
  type: 'סוג נכס',
  street: 'רחוב',
  city: 'עיר',
  neighborhood: 'שכונה',
  rooms: 'חדרים',
  floor: 'קומה',
  totalFloors: 'סך קומות',
  sqm: 'מ״ר',
  marketingPrice: 'מחיר שיווק (₪)',
  owner: 'בעל הנכס',
  ownerPhone: 'טלפון בעל הנכס',
  ownerEmail: 'דוא״ל בעל הנכס',
  elevator: 'מעלית',
  parking: 'חנייה',
  notes: 'הערות',
};

const NUMERIC_KEYS = new Set([
  'rooms', 'budget', 'floor', 'totalFloors', 'sqm', 'marketingPrice',
]);
const BOOL_KEYS = new Set(['elevator']);

function labelFor(kind, key) {
  if (kind === 'lead') return LEAD_LABELS[key] || key;
  if (kind === 'property') return PROPERTY_LABELS[key] || key;
  return key;
}

// Coerce an input-string back into the right primitive when the agent
// edits a numeric/boolean field.
function coerce(key, value) {
  if (BOOL_KEYS.has(key)) return value === true || value === 'true' || value === 'כן';
  if (NUMERIC_KEYS.has(key)) {
    if (value === '' || value == null) return null;
    const n = Number(String(value).replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return value;
}

// Small helper — the /voice-demo page wraps us as a full page, so the
// caller may want the same dialog inline instead of floating. Render
// style switches based on `inline` prop.
export default function VoiceCaptureDialog({
  open,
  onClose,
  preferKind = 'auto',      // 'lead' | 'property' | 'auto'
  onUse,                     // ({ kind, fields }) => void — prefills caller's form
  inline = false,            // true => render without the modal chrome
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const panelRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [overrideKind, setOverrideKind] = useState(null); // user-forced kind
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const stopAtRef = useRef(null);

  useFocusTrap(panelRef, { onEscape: inline ? undefined : onClose });

  // Keep editedFields in sync whenever a new extraction lands.
  useEffect(() => {
    if (result?.fields) setEditedFields({ ...result.fields });
    else setEditedFields({});
    setOverrideKind(null);
  }, [result]);

  // Release mic + timers on unmount / close.
  const cleanup = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (stopAtRef.current) clearTimeout(stopAtRef.current);
    tickRef.current = null;
    stopAtRef.current = null;
    try {
      recorderRef.current?.stream?.getTracks?.().forEach((t) => t.stop());
    } catch { /* noop */ }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Reset transient state on open/close so reopening the dialog never
  // shows the previous run's transcript.
  useEffect(() => {
    if (!open && !inline) {
      cleanup();
      setRecording(false);
      setSeconds(0);
      setBusy(false);
      setResult(null);
      setError('');
    }
  }, [open, inline, cleanup]);

  const start = async () => {
    setError('');
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        await upload(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      stopAtRef.current = setTimeout(() => stop(), MAX_SECONDS * 1000);
    } catch {
      setError('לא הצלחנו לגשת למיקרופון — אשר/י הרשאה בדפדפן');
    }
  };

  const stop = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (stopAtRef.current) clearTimeout(stopAtRef.current);
    tickRef.current = null;
    stopAtRef.current = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  };

  const upload = async (blob) => {
    setBusy(true);
    try {
      const data = await api.voiceIngest(blob);
      setResult(data);
      if (data?.kind === 'unclear') {
        toast?.info?.('קשה לזהות — נסו להקליט שוב או לערוך ידנית');
      } else {
        toast?.success?.('התמלול והשליפה הסתיימו');
      }
    } catch (e) {
      setError(e?.message || 'שגיאה לא צפויה');
      toast?.error?.(e?.message || 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  // The "active kind" is either what the user picked to override, or
  // whatever Haiku extracted. Determines which set of labels we use
  // and which "Use in form" CTA surfaces.
  const activeKind = overrideKind || result?.kind || 'unclear';
  const kindMismatch =
    preferKind !== 'auto' && activeKind !== 'unclear' && activeKind !== preferKind;

  const fieldKeys = useMemo(() => {
    const keys = Object.keys(editedFields || {});
    // Stable order — known labels first, anything else alphabetical.
    const known = activeKind === 'lead' ? LEAD_LABELS : activeKind === 'property' ? PROPERTY_LABELS : {};
    const priority = Object.keys(known);
    return keys.slice().sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [editedFields, activeKind]);

  const updateField = (key, rawValue) => {
    setEditedFields((prev) => ({ ...prev, [key]: coerce(key, rawValue) }));
  };
  const dropField = (key) => {
    setEditedFields((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  };
  const [newFieldKey, setNewFieldKey] = useState('');
  const addField = () => {
    const k = newFieldKey.trim();
    if (!k) return;
    setEditedFields((prev) => ({ ...prev, [k]: '' }));
    setNewFieldKey('');
  };

  const handleUse = () => {
    const kind = activeKind === 'unclear' ? preferKind : activeKind;
    const payload = { kind, fields: editedFields };
    // Route-level case: no matching parent form (inline auto-mode on
    // /voice-demo, or the top-bar "AI" quick-create button). Always
    // stash + navigate so the right create page picks up the payload.
    const parentCanAccept =
      typeof onUse === 'function' &&
      (kind === 'lead' || kind === 'property') &&
      kind === preferKind;
    if (parentCanAccept) {
      onUse(payload);
      onClose?.();
      return;
    }
    // Cross-page flow: stash + redirect so the target page picks up
    // the payload on mount. Only valid when we actually know the kind.
    if (kind !== 'lead' && kind !== 'property') return;
    try {
      sessionStorage.setItem('estia-voice-prefill', JSON.stringify(payload));
    } catch { /* noop */ }
    onClose?.();
    navigate(kind === 'lead' ? '/customers/new' : '/properties/new');
  };

  // ─── Render ───────────────────────────────────────────────────────
  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, '0');

  if (!inline && !open) return null;

  // The dialog body — inlined rather than wrapped in a nested Chrome
  // component. Declaring Chrome inside the parent made it a new
  // component type on every render, so React unmounted + remounted
  // the whole subtree on every keystroke (agents couldn't edit the
  // extracted fields — the input lost focus + scroll reset after
  // every character). Inline JSX re-uses the same DOM tree so typing
  // works normally.
  const body = (
    <>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: inline ? '0 0 14px' : '18px 22px 14px',
        gap: 12,
        borderBottom: inline ? 'none' : `1px solid ${DT.border}`,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 1,
          }}>
            <Sparkles size={11} /> ESTIA AI · הקלטה
          </div>
          <h2 style={{
            fontSize: 20, fontWeight: 800, margin: '4px 0 2px',
            letterSpacing: -0.4,
          }}>
            דברו — אנחנו נמלא את הטופס
          </h2>
          <p style={{ fontSize: 13, color: DT.muted, margin: 0, lineHeight: 1.55 }}>
            {preferKind === 'lead'
              ? 'תארו/י את הליד. אנחנו מזהים שם, טלפון, עיר, תקציב, חדרים ועוד.'
              : preferKind === 'property'
              ? 'תארו/י את הנכס. אנחנו מזהים סוג, כתובת, מ״ר, מחיר, בעלים ועוד.'
              : 'תארו/י ליד או נכס — אנחנו נזהה מה מדובר ונמלא את הטופס המתאים.'}
          </p>
        </div>
        {!inline && (
          <button
            type="button"
            onClick={() => { if (!busy && !recording) onClose?.(); }}
            disabled={busy || recording}
            aria-label="סגור"
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: 10,
              border: 'none', background: DT.cream3, color: DT.ink,
              cursor: busy || recording ? 'not-allowed' : 'pointer',
              display: 'grid', placeItems: 'center',
              opacity: busy || recording ? 0.5 : 1,
            }}
          ><XIcon size={16} /></button>
        )}
      </div>

      {/* Record strip — big centered mic button with the timer + status
          directly underneath. Previous layout put the button + timer in
          the same row which read as cramped and unbalanced in RTL. */}
      <div style={{
        padding: inline ? '6px 0 0' : '18px 22px 0',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, padding: '22px 18px',
          background: DT.cream4,
          border: `1px solid ${DT.border}`, borderRadius: 16,
          position: 'relative',
        }}>
          {!recording ? (
            <button
              type="button"
              onClick={start}
              disabled={busy}
              aria-label={result ? 'הקלט שוב' : 'התחל הקלטה'}
              style={{
                ...FONT,
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 28px', borderRadius: 999, border: 'none',
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, fontSize: 15, fontWeight: 800,
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.55 : 1,
                boxShadow: '0 6px 18px rgba(180,139,76,0.32)',
                minWidth: 200,
                justifyContent: 'center',
              }}
            >
              <Mic size={18} />
              <span>{result ? 'הקלט/י שוב' : 'התחל/י הקלטה'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              aria-label="עצור הקלטה"
              style={{
                ...FONT,
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 28px', borderRadius: 999, border: 'none',
                background: DT.danger, color: DT.white,
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(185,28,28,0.28)',
                minWidth: 200, justifyContent: 'center',
              }}
            >
              <Square size={18} fill="currentColor" /> <span>עצור/י</span>
            </button>
          )}

          {/* Timer + status row — directionally neutral (numeric LTR is
              forced with a BDI) so the "00:00 / 2:00" never flips in RTL. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            color: DT.muted, fontSize: 13, fontWeight: 600,
          }}>
            <bdi style={{
              direction: 'ltr',
              color: recording ? DT.danger : DT.ink,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 15, fontWeight: 800,
              letterSpacing: 0.5,
            }}>{mm}:{ss}</bdi>
            <span aria-hidden style={{ color: DT.muted, opacity: 0.6 }}>/</span>
            <bdi style={{
              direction: 'ltr',
              color: DT.muted, fontVariantNumeric: 'tabular-nums',
              fontSize: 13, fontWeight: 600,
            }}>{Math.floor(MAX_SECONDS / 60)}:00</bdi>
            {recording && (
              <span
                aria-label="מקליט"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: DT.danger, fontSize: 12, fontWeight: 800,
                  marginInlineStart: 6,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 99,
                  background: DT.danger,
                  animation: 'vcd-pulse 1.1s infinite',
                }} />
                מקליט
              </span>
            )}
            {busy && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: DT.goldDark, fontSize: 12, fontWeight: 700,
                marginInlineStart: 6,
              }}>
                <Loader2 size={13} style={{ animation: 'vcd-spin 1s linear infinite' }} />
                מתמלל ושולף…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          margin: inline ? '12px 0 0' : '14px 22px 0',
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(185,28,28,0.06)',
          border: `1px solid ${DT.danger}`, color: DT.danger,
          fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          padding: inline ? '14px 0 0' : '14px 22px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* Auto-detected banner */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            padding: '10px 12px', borderRadius: 10,
            background: activeKind === 'unclear' ? DT.cream3 : DT.goldSoft,
            border: `1px solid ${activeKind === 'unclear' ? DT.border : DT.gold}`,
          }}>
            <Sparkles size={14} style={{ color: DT.goldDark }} />
            <strong style={{ fontSize: 13, color: DT.ink }}>
              {activeKind === 'lead' && 'זוהה ליד'}
              {activeKind === 'property' && 'זוהה נכס'}
              {activeKind === 'unclear' && 'לא זוהה אוטומטית'}
            </strong>
            {typeof result.confidence === 'number' && activeKind !== 'unclear' && (
              <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>
                ביטחון {Math.round(result.confidence * 100)}%
              </span>
            )}
            {/* Manual override — always available */}
            <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
              <OverrideBtn
                active={activeKind === 'lead'}
                onClick={() => setOverrideKind('lead')}
              >ליד</OverrideBtn>
              <OverrideBtn
                active={activeKind === 'property'}
                onClick={() => setOverrideKind('property')}
              >נכס</OverrideBtn>
            </span>
          </div>

          {/* kind-mismatch banner */}
          {kindMismatch && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(180,139,76,0.12)',
              border: `1px solid ${DT.gold}`,
              fontSize: 13, color: DT.ink, lineHeight: 1.55,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <ArrowLeftRight size={14} style={{ marginTop: 2, color: DT.goldDark }} />
              <div>
                זיהינו <strong>{activeKind === 'lead' ? 'ליד' : 'נכס'}</strong>,
                אבל אתם/ן בדף {preferKind === 'lead' ? 'יצירת ליד' : 'יצירת נכס'}.
                לחיצה על «השתמש בערכים» תעביר אתכם/ן לדף המתאים עם השדות מוכנים.
              </div>
            </div>
          )}

          {/* Transcript */}
          <div>
            <div style={{
              fontSize: 11, color: DT.goldDark, fontWeight: 700,
              letterSpacing: 0.8, marginBottom: 4,
            }}>תמלול</div>
            <div style={{
              fontSize: 13, color: DT.ink, lineHeight: 1.65,
              padding: 12, borderRadius: 10,
              background: DT.cream4, border: `1px solid ${DT.border}`,
              whiteSpace: 'pre-wrap',
            }}>
              {result.transcript || <em style={{ color: DT.muted }}>אין תמלול</em>}
            </div>
          </div>

          {/* Notes */}
          {result.notes_he && (
            <div style={{ fontSize: 12, color: DT.muted, lineHeight: 1.6 }}>
              <CheckCircle2 size={11} style={{ verticalAlign: '-2px', marginInlineEnd: 4, color: DT.success }} />
              {result.notes_he}
            </div>
          )}

          {/* Editable fields */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 11, color: DT.goldDark, fontWeight: 700,
              letterSpacing: 0.8, marginBottom: 6,
            }}>
              <span><Edit3 size={11} style={{ verticalAlign: '-1px' }} /> שדות שזוהו · עריכה ידנית</span>
              <span style={{ color: DT.muted, fontWeight: 500, letterSpacing: 0 }}>
                {fieldKeys.length} שדות
              </span>
            </div>
            {fieldKeys.length === 0 ? (
              <div style={{
                fontSize: 12, color: DT.muted, fontStyle: 'italic',
                padding: 12, borderRadius: 10,
                background: DT.cream4, border: `1px dashed ${DT.border}`,
              }}>
                לא זוהו שדות — אפשר להוסיף ידנית או להקליט שוב.
              </div>
            ) : (
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}>
                {fieldKeys.map((k) => (
                  <FieldEditor
                    key={k}
                    name={k}
                    label={labelFor(activeKind, k)}
                    value={editedFields[k]}
                    onChange={(v) => updateField(k, v)}
                    onRemove={() => dropField(k)}
                  />
                ))}
              </div>
            )}

            {/* Missing hint */}
            {result.missing?.length > 0 && (
              <div style={{
                marginTop: 8, fontSize: 11, color: DT.muted,
                fontStyle: 'italic',
              }}>
                שדות חסרים לפי Estia AI: {result.missing.join(', ')}
              </div>
            )}

            {/* Add field */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }}
                placeholder="הוסף שדה (מפתח באנגלית, למשל: email)"
                style={{
                  ...FONT,
                  flex: 1, minWidth: 180,
                  padding: '8px 10px', fontSize: 12,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 8, background: DT.white, color: DT.ink,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={addField}
                disabled={!newFieldKey.trim()}
                style={{
                  ...FONT,
                  background: DT.white, color: DT.ink,
                  border: `1px solid ${DT.border}`,
                  padding: '8px 12px', borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  cursor: newFieldKey.trim() ? 'pointer' : 'not-allowed',
                  opacity: newFieldKey.trim() ? 1 : 0.55,
                  display: 'inline-flex', gap: 4, alignItems: 'center',
                }}
              >
                <Plus size={12} /> שדה
              </button>
            </div>
          </div>

          {/* Action strip */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            flexWrap: 'wrap', marginTop: 4,
          }}>
            {!inline && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  ...FONT, background: DT.white, color: DT.ink,
                  border: `1px solid ${DT.border}`,
                  padding: '10px 16px', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >ביטול</button>
            )}
            <button
              type="button"
              onClick={handleUse}
              disabled={activeKind === 'unclear' || fieldKeys.length === 0}
              style={{
                ...FONT,
                background: activeKind === 'unclear' || fieldKeys.length === 0
                  ? DT.cream3
                  : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, border: 'none',
                padding: '10px 18px', borderRadius: 10,
                fontSize: 13, fontWeight: 800,
                cursor: activeKind === 'unclear' || fieldKeys.length === 0 ? 'not-allowed' : 'pointer',
                opacity: activeKind === 'unclear' || fieldKeys.length === 0 ? 0.55 : 1,
                display: 'inline-flex', gap: 6, alignItems: 'center',
                boxShadow: activeKind === 'unclear' || fieldKeys.length === 0
                  ? 'none'
                  : '0 4px 12px rgba(180,139,76,0.28)',
              }}
            >
              <Sparkles size={13} />
              {kindMismatch
                ? (activeKind === 'lead' ? 'פתח טופס ליד עם הערכים' : 'פתח טופס נכס עם הערכים')
                : 'מלא את הטופס עם הערכים'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes vcd-spin { to { transform: rotate(360deg); } }
        @keyframes vcd-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </>
  );

  if (inline) {
    return (
      <div ref={panelRef} style={{ ...FONT, color: DT.ink }}>
        {body}
      </div>
    );
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="הקלטה חכמה"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && !recording) onClose?.();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(30,26,20,0.55)',
        display: 'grid', placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        style={{
          ...FONT, color: DT.ink, background: DT.white,
          borderRadius: 18, maxWidth: 720, width: '100%',
          maxHeight: '92vh', overflow: 'auto',
          border: `1px solid ${DT.border}`,
          boxShadow: '0 20px 40px rgba(30,26,20,0.25)',
        }}
      >
        {body}
      </div>
    </div>
  );
}

function OverrideBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...FONT,
        background: active ? DT.ink : DT.white,
        color: active ? DT.cream : DT.ink,
        border: `1px solid ${active ? DT.ink : DT.border}`,
        padding: '4px 10px', borderRadius: 99,
        fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// Inline field editor — renders a labeled input + remove button.
// Auto-picks an input type for booleans vs numerics vs strings.
function FieldEditor({ name, label, value, onChange, onRemove }) {
  const isBool = BOOL_KEYS.has(name);
  const isNumeric = NUMERIC_KEYS.has(name);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '8px 10px', borderRadius: 10,
      background: DT.white, border: `1px solid ${DT.border}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          fontSize: 10, color: DT.muted, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>{label}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`הסר ${label}`}
          style={{
            border: 'none', background: 'transparent', color: DT.muted,
            cursor: 'pointer', padding: 2, borderRadius: 6,
            display: 'inline-grid', placeItems: 'center',
          }}
        ><Trash2 size={11} /></button>
      </div>
      {isBool ? (
        <select
          value={value === true ? 'true' : value === false ? 'false' : ''}
          onChange={(e) => onChange(e.target.value === 'true')}
          style={{
            ...FONT, fontSize: 13, padding: '6px 8px',
            border: `1px solid ${DT.border}`, borderRadius: 8,
            background: DT.white, color: DT.ink, outline: 'none',
          }}
        >
          <option value="">—</option>
          <option value="true">כן</option>
          <option value="false">לא</option>
        </select>
      ) : (
        <input
          type={isNumeric ? 'number' : 'text'}
          value={value == null ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={isNumeric ? 'numeric' : undefined}
          style={{
            ...FONT, fontSize: 13, padding: '6px 8px',
            border: `1px solid ${DT.border}`, borderRadius: 8,
            background: DT.white, color: DT.ink, outline: 'none',
            direction: isNumeric ? 'ltr' : 'rtl',
          }}
        />
      )}
    </div>
  );
}
