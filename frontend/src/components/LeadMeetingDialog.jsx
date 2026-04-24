import { useEffect, useRef, useState } from 'react';
import { X, Calendar, Video, MapPin, AlertCircle, Check, Info } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import haptics from '../lib/haptics';
import useFocusTrap from '../hooks/useFocusTrap';

// 7.2 — Schedule a meeting with a lead (brief: 30-min default,
// Meet-link option, auto-invite). Falls back to calendar-less
// local record if Google Calendar isn't connected, but then shows
// a nudge to connect.
//
// Sprint 3 re-skin: inline Cream & Gold DT styles (no CSS file).

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function pad2(n) { return String(n).padStart(2, '0'); }
function defaultStart() {
  // Next 30-min slot + 1h lead time.
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function addMinutes(isoLocal, minutes) {
  const d = new Date(isoLocal);
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function LeadMeetingDialog({ lead, onClose, onCreated }) {
  const [calendarConnected, setCalendarConnected] = useState(null);
  const [form, setForm] = useState({
    title: `פגישה עם ${lead?.name || ''}`,
    startsAt: defaultStart(),
    durationMin: 30,
    location: '',
    addMeetLink: true,
    attendeeEmail: lead?.email || '',
    notes: '',
    syncToCalendar: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  useEffect(() => {
    api.calendarStatus().then((s) => setCalendarConnected(!!s.connected)).catch(() => setCalendarConnected(false));
  }, []);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setErr(null);
    if (!form.title.trim()) { setErr('הכנס כותרת לפגישה'); return; }
    if (!form.startsAt)     { setErr('הכנס תאריך ושעה'); return; }
    setBusy(true);
    try {
      const startsAt = new Date(form.startsAt).toISOString();
      const endsAt = new Date(addMinutes(form.startsAt, form.durationMin)).toISOString();
      const body = {
        title: form.title,
        startsAt,
        endsAt,
        notes: form.notes || undefined,
        location: form.location || undefined,
        attendeeEmail: form.attendeeEmail || undefined,
        addMeetLink: !!(form.syncToCalendar && form.addMeetLink),
        syncToCalendar: !!form.syncToCalendar,
      };
      const res = await api.createLeadMeeting(lead.id, body);
      haptics?.press?.();
      onCreated?.(res.meeting);
      onClose?.();
    } catch (e) {
      // L-10 — the backend used to surface a bare "Not Found" when the
      // lead or the calendar endpoint was unreachable. Translate it
      // into a Hebrew-first, actionable message so agents know whether
      // to retry, reconnect their calendar, or ping support.
      if (e?.data?.error?.code === 'calendar_not_connected') {
        setErr('Google Calendar לא מחובר — אפשר לבטל את הסנכרון ולשמור מקומית, או להתחבר בעמוד הפרופיל');
      } else if (e?.status === 404 || /not\s*found/i.test(e?.message || '')) {
        setErr('לא הצלחנו לקבוע את הפגישה — רענן את הדף ונסה שוב. אם זה חוזר, צור קשר עם התמיכה.');
      } else if (e?.status === 401 || e?.status === 403) {
        setErr('אין הרשאה ליצור פגישה לליד הזה. נסה להתחבר מחדש.');
      } else {
        setErr(e?.message || 'השמירה נכשלה');
      }
    } finally {
      setBusy(false);
    }
  };

  const notConnected = calendarConnected === false;
  const syncDisabled = notConnected;

  return (
    <Portal>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 260,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
          animation: 'lmd-fade 0.18s ease-out',
        }}
      >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="תזמון פגישה"
          style={{
            ...FONT,
            width: 560, maxWidth: '100%', maxHeight: '92vh',
            display: 'flex', flexDirection: 'column',
            background: DT.cream,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            boxShadow: '0 26px 70px rgba(30,26,20,0.3)',
            overflow: 'hidden',
            color: DT.ink,
          }}
        >
          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 14px',
            borderBottom: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{
                fontSize: 17, fontWeight: 800, letterSpacing: -0.2, color: DT.ink,
              }}>
                תזמון פגישה
              </strong>
              {lead?.name && (
                <span style={{ fontSize: 12, color: DT.muted }}>{lead.name}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                ...FONT,
                width: 34, height: 34, borderRadius: 99,
                border: `1px solid ${DT.border}`, background: DT.cream4,
                color: DT.muted,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </header>

          {/* Body */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: 24,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Google Calendar nudge — shown when not connected.
                L-10: we still allow a local-only meeting record but point
                the agent at /profile for the one-click connect. */}
            {notConnected && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                background: DT.goldSoft,
                border: `1px solid ${DT.border}`,
                borderRadius: 10,
                color: DT.goldDark,
                fontSize: 12.5,
                lineHeight: 1.5,
              }}>
                <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>
                  Google Calendar לא מחובר. אפשר עדיין לקבוע פגישה מקומית — הפגישה תישמר אצלך,
                  אך לא תסונכרן ליומן. כדי לסנכרן, <a
                    href="/profile"
                    style={{ color: DT.goldDark, fontWeight: 800, textDecoration: 'underline' }}
                  >חבר Google Calendar בעמוד הפרופיל</a>.
                </span>
              </div>
            )}

            {/* Title */}
            <Field label="כותרת הפגישה">
              <input
                style={inputStyle()}
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                autoCapitalize="sentences"
                enterKeyHint="next"
              />
            </Field>

            {/* Date/time + duration */}
            <div style={rowStyle()}>
              <Field label={<><Calendar size={12} /> תאריך ושעה</>}>
                <input
                  type="datetime-local"
                  style={inputStyle()}
                  value={form.startsAt}
                  onChange={(e) => update('startsAt', e.target.value)}
                />
              </Field>
              <Field label="משך (דקות)">
                <select
                  style={inputStyle()}
                  value={form.durationMin}
                  onChange={(e) => update('durationMin', Number(e.target.value))}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                </select>
              </Field>
            </div>

            {/* Location + attendee */}
            <div style={rowStyle()}>
              <Field label={<><MapPin size={12} /> מיקום</>}>
                <input
                  style={inputStyle()}
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                  placeholder="משרד / כתובת / ריק עבור Meet"
                />
              </Field>
              <Field label="אימייל מוזמן">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  dir="ltr"
                  style={inputStyle()}
                  value={form.attendeeEmail}
                  onChange={(e) => update('attendeeEmail', e.target.value)}
                  placeholder="lead@example.com"
                />
              </Field>
            </div>

            {/* Notes */}
            <Field label="הערות">
              {/* L-11 — force RTL + the app's Hebrew body font; previously
                  this inherited the meeting dialog's mono/LTR default and
                  showed Hebrew text backwards on some macOS themes. */}
              <textarea
                rows={3}
                dir="rtl"
                lang="he"
                autoCapitalize="sentences"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="נושאים, הכנות, קישורים…"
                style={{
                  ...inputStyle(),
                  minHeight: 72,
                  resize: 'vertical',
                  textAlign: 'right',
                  unicodeBidi: 'plaintext',
                }}
              />
            </Field>

            {/* Options */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '12px 14px',
              background: DT.cream4,
              border: `1px solid ${DT.border}`,
              borderRadius: 10,
            }}>
              <label style={optStyle(syncDisabled)}>
                <input
                  type="checkbox"
                  checked={form.syncToCalendar && !notConnected}
                  disabled={syncDisabled}
                  onChange={(e) => update('syncToCalendar', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: DT.gold }}
                />
                <span>הוסף ל-Google Calendar של סוכן</span>
              </label>
              <label style={optStyle(!form.syncToCalendar || notConnected)}>
                <input
                  type="checkbox"
                  checked={form.addMeetLink && form.syncToCalendar && !notConnected}
                  disabled={!form.syncToCalendar || notConnected}
                  onChange={(e) => update('addMeetLink', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: DT.gold }}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Video size={12} /> הוסף קישור Meet אוטומטי
                </span>
              </label>
            </div>

            {err && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(185,28,28,0.08)',
                border: `1px solid rgba(185,28,28,0.2)`,
                color: DT.danger,
                fontSize: 12.5,
              }}>
                <AlertCircle size={12} /> {err}
              </div>
            )}
          </div>

          {/* Footer */}
          <footer style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: `14px 24px calc(14px + env(safe-area-inset-bottom))`,
            borderTop: `1px solid ${DT.border}`,
            background: DT.white,
          }}>
            <button
              type="button"
              onClick={onClose}
              style={ghostBtn()}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              style={{
                ...primaryBtn(),
                opacity: busy ? 0.6 : 1,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              <Check size={14} /> {busy ? 'שומר…' : 'קבע פגישה'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    ...FONT,
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
    background: DT.white,
    fontSize: 14,
    color: DT.ink,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function rowStyle() {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
  };
}

function optStyle(disabled) {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: 13, fontWeight: 600,
    color: disabled ? DT.muted : DT.ink,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
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
  };
}

function ghostBtn() {
  return {
    ...FONT,
    background: DT.white,
    border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    color: DT.ink,
    display: 'inline-flex', gap: 5, alignItems: 'center',
  };
}
