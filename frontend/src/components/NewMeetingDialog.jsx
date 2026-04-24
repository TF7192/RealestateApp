import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Calendar, MapPin, AlertCircle, Check, Info, User, Search } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import haptics from '../lib/haptics';
import useFocusTrap from '../hooks/useFocusTrap';

// Sprint 4.1 — /calendar "פגישה חדשה" CTA dialog.
//
// Mirrors LeadMeetingDialog's Cream & Gold inline styles, but starts
// from no lead context: the agent picks a lead from a dropdown over
// api.listLeads() OR types a free-text participant. On submit it
// posts to api.createAgentMeeting (which is the agent-scoped
// /api/meetings route added alongside this component) and optionally
// syncs to Google Calendar via the existing OAuth integration.
//
// Props:
//   - initialDate?    Date — preselected day (e.g. the day cell the
//                    agent had focused before clicking the CTA)
//   - onClose()       fires on Esc / backdrop / cancel
//   - onCreated(m)    fires after a successful create so the parent
//                    page can refresh the meetings list

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

const DURATION_PRESETS = [
  { value: 30, label: '30 דק׳' },
  { value: 60, label: '60 דק׳' },
  { value: 90, label: '90 דק׳' },
];

function pad2(n) { return String(n).padStart(2, '0'); }

// Format a Date as the value a <input type="datetime-local"> expects.
// The browser interprets it as local-time (no timezone) — we re-attach
// the agent's timezone via `new Date(...)` on submit.
function toInputDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function defaultStart(initialDate) {
  // Snap to the next 30-minute slot. If the user passed in an
  // initialDate (the focused day on /calendar), keep that calendar day
  // but still snap the time forward — the calendar grid focuses days
  // not hours, so "next clean 30" is the safest default.
  const base = initialDate ? new Date(initialDate) : new Date();
  const now = new Date();
  // Only force "next slot" when the focused day is today; otherwise
  // open at 09:00 on the chosen day so non-today picks land on a sane
  // working-hour default.
  const isToday = base.toDateString() === now.toDateString();
  if (isToday) {
    base.setHours(now.getHours() + 1);
    base.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  } else {
    base.setHours(9, 0, 0, 0);
  }
  return toInputDateTime(base);
}

function addMinutes(isoLocal, minutes) {
  const d = new Date(isoLocal);
  d.setMinutes(d.getMinutes() + minutes);
  return toInputDateTime(d);
}

export default function NewMeetingDialog({ initialDate, onClose, onCreated }) {
  const [calendarConnected, setCalendarConnected] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadQuery, setLeadQuery] = useState('');
  const [participantMode, setParticipantMode] = useState('lead'); // 'lead' | 'free'
  const [form, setForm] = useState({
    title: '',
    startsAt: defaultStart(initialDate),
    durationMin: 30,
    location: '',
    notes: '',
    leadId: '',
    attendeeName: '',
    syncToCalendar: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  useEffect(() => {
    api.calendarStatus()
      .then((s) => setCalendarConnected(!!s?.connected))
      .catch(() => setCalendarConnected(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLeadsLoading(true);
    api.listLeads()
      .then((r) => {
        if (cancelled) return;
        setLeads(Array.isArray(r?.items) ? r.items : Array.isArray(r?.leads) ? r.leads : []);
      })
      .catch(() => { if (!cancelled) setLeads([]); })
      .finally(() => { if (!cancelled) setLeadsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.phone, l.city].filter(Boolean).some((s) => String(s).includes(q))
    );
  }, [leads, leadQuery]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === form.leadId) || null,
    [leads, form.leadId]
  );

  const save = async () => {
    setErr(null);
    if (!form.title.trim()) { setErr('הכנס כותרת לפגישה'); return; }
    if (!form.startsAt)     { setErr('בחר תאריך ושעה'); return; }
    setBusy(true);
    try {
      const startsAt = new Date(form.startsAt).toISOString();
      const endsAt = new Date(addMinutes(form.startsAt, form.durationMin)).toISOString();
      const body = {
        title: form.title.trim(),
        startsAt,
        endsAt,
        notes: form.notes.trim() || undefined,
        location: form.location.trim() || undefined,
        syncToCalendar: !!(form.syncToCalendar && calendarConnected),
      };
      if (participantMode === 'lead' && form.leadId) {
        body.leadId = form.leadId;
      } else if (participantMode === 'free' && form.attendeeName.trim()) {
        body.attendeeName = form.attendeeName.trim();
      }
      const res = await api.createAgentMeeting(body);
      haptics?.press?.();
      onCreated?.(res?.meeting);
      onClose?.();
    } catch (e) {
      if (e?.data?.error?.code === 'calendar_not_connected') {
        setErr('Google Calendar לא מחובר — בטל את הסנכרון או חבר ביומן בעמוד הפרופיל');
      } else if (e?.status === 401 || e?.status === 403) {
        setErr('אין הרשאה ליצור פגישה. נסה להתחבר מחדש.');
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
          animation: 'nmd-fade 0.18s ease-out',
        }}
      >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nmd-title"
          style={{
            ...FONT,
            width: 580, maxWidth: '100%', maxHeight: '92vh',
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
              <strong id="nmd-title" style={{
                fontSize: 17, fontWeight: 800, letterSpacing: -0.2, color: DT.ink,
              }}>
                פגישה חדשה
              </strong>
              <span style={{ fontSize: 12, color: DT.muted }}>
                קבע פגישה ביומן — מקושר לליד או חופשי
              </span>
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
            {/* Calendar nudge — same copy/policy as LeadMeetingDialog */}
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
                  Google Calendar לא מחובר. הפגישה תישמר אצלך בלבד. כדי לסנכרן{' '}
                  <a
                    href="/profile"
                    style={{ color: DT.goldDark, fontWeight: 800, textDecoration: 'underline' }}
                  >חבר Google Calendar בעמוד הפרופיל</a>.
                </span>
              </div>
            )}

            {/* Title */}
            <Field label="כותרת">
              <input
                style={inputStyle()}
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="פגישת ייעוץ, ביקור בנכס, פולואפ…"
                autoCapitalize="sentences"
                enterKeyHint="next"
                dir="auto"
              />
            </Field>

            {/* Date/time + duration chips */}
            <div style={rowStyle()}>
              <Field label={<><Calendar size={12} /> תאריך ושעה</>}>
                <input
                  type="datetime-local"
                  style={inputStyle()}
                  value={form.startsAt}
                  onChange={(e) => update('startsAt', e.target.value)}
                />
              </Field>
              <Field label="משך">
                <div style={{
                  display: 'inline-flex', gap: 6,
                  background: DT.white,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 10,
                  padding: 4,
                }} role="radiogroup" aria-label="משך הפגישה">
                  {DURATION_PRESETS.map((d) => {
                    const sel = form.durationMin === d.value;
                    return (
                      <button
                        type="button"
                        key={d.value}
                        role="radio"
                        aria-checked={sel}
                        onClick={() => update('durationMin', d.value)}
                        style={{
                          ...FONT,
                          flex: 1,
                          padding: '8px 10px',
                          border: 'none',
                          borderRadius: 8,
                          background: sel
                            ? `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`
                            : 'transparent',
                          color: sel ? DT.ink : DT.muted,
                          fontSize: 13,
                          fontWeight: sel ? 800 : 600,
                          cursor: 'pointer',
                          boxShadow: sel ? '0 2px 6px rgba(180,139,76,0.25)' : 'none',
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            {/* Participant — lead picker OR free-text toggle */}
            <Field label={<><User size={12} /> משתתף</>}>
              <div style={{
                display: 'inline-flex', gap: 6,
                background: DT.white,
                border: `1px solid ${DT.border}`,
                borderRadius: 10,
                padding: 4,
                marginBottom: 8,
              }} role="radiogroup" aria-label="סוג משתתף">
                {[
                  { value: 'lead', label: 'בחר מליד קיים' },
                  { value: 'free', label: 'טקסט חופשי' },
                ].map((opt) => {
                  const sel = participantMode === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setParticipantMode(opt.value)}
                      style={{
                        ...FONT,
                        padding: '8px 14px',
                        border: 'none',
                        borderRadius: 8,
                        background: sel
                          ? `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`
                          : 'transparent',
                        color: sel ? DT.ink : DT.muted,
                        fontSize: 13,
                        fontWeight: sel ? 800 : 600,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {participantMode === 'lead' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={14}
                      style={{
                        position: 'absolute',
                        insetInlineStart: 12,
                        top: '50%', transform: 'translateY(-50%)',
                        color: DT.muted, pointerEvents: 'none',
                      }}
                    />
                    <input
                      type="search"
                      style={{
                        ...inputStyle(),
                        paddingInlineStart: 34,
                      }}
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder={leadsLoading ? 'טוען לידים…' : 'חפש לפי שם, עיר או טלפון'}
                      disabled={leadsLoading}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                  <div style={{
                    maxHeight: 180, overflowY: 'auto',
                    background: DT.white,
                    border: `1px solid ${DT.border}`,
                    borderRadius: 10,
                  }}>
                    {leadsLoading ? (
                      <div style={pickerEmpty()}>טוען…</div>
                    ) : filteredLeads.length === 0 ? (
                      <div style={pickerEmpty()}>
                        {leadQuery ? 'לא נמצאו לידים מתאימים' : 'אין עדיין לידים — אפשר לעבור לטקסט חופשי'}
                      </div>
                    ) : (
                      filteredLeads.slice(0, 50).map((l) => {
                        const sel = form.leadId === l.id;
                        return (
                          <button
                            type="button"
                            key={l.id}
                            onClick={() => {
                              update('leadId', l.id);
                              if (!form.title) update('title', `פגישה עם ${l.name || ''}`.trim());
                            }}
                            style={{
                              ...FONT,
                              display: 'flex', alignItems: 'center',
                              gap: 10, width: '100%',
                              padding: '10px 12px',
                              background: sel ? DT.goldSoft : 'transparent',
                              border: 'none',
                              borderBottom: `1px solid ${DT.border}`,
                              cursor: 'pointer',
                              textAlign: 'start',
                            }}
                          >
                            <span style={{
                              width: 28, height: 28, borderRadius: 99,
                              background: sel ? DT.gold : DT.cream2,
                              color: sel ? DT.ink : DT.muted,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, flexShrink: 0,
                            }}>
                              {(l.name || '?').charAt(0)}
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{
                                display: 'block', fontSize: 13, fontWeight: 700,
                                color: DT.ink,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>{l.name || 'ללא שם'}</span>
                              <span style={{ display: 'block', fontSize: 11, color: DT.muted }}>
                                {[l.city, l.phone].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {sel && <Check size={14} color={DT.goldDark} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                  {selectedLead && (
                    <div style={{ fontSize: 11.5, color: DT.muted }}>
                      נבחר: <strong style={{ color: DT.ink }}>{selectedLead.name}</strong>
                    </div>
                  )}
                </div>
              ) : (
                <input
                  style={inputStyle()}
                  value={form.attendeeName}
                  onChange={(e) => update('attendeeName', e.target.value)}
                  placeholder="שם המשתתף או הערה"
                  autoCapitalize="sentences"
                  dir="auto"
                />
              )}
            </Field>

            {/* Location */}
            <Field label={<><MapPin size={12} /> מיקום (לא חובה)</>}>
              <input
                style={inputStyle()}
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
                placeholder="משרד / כתובת / Zoom…"
                dir="auto"
              />
            </Field>

            {/* Notes */}
            <Field label="הערות (לא חובה)">
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

            {/* Calendar sync — hidden when not connected to keep the
                form focused. The nudge banner above already explains
                the disconnected state. */}
            {!notConnected && (
              <label style={{
                ...FONT,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 14px',
                background: DT.cream4,
                border: `1px solid ${DT.border}`,
                borderRadius: 10,
                fontSize: 13, fontWeight: 600, color: DT.ink,
                cursor: syncDisabled ? 'not-allowed' : 'pointer',
                opacity: syncDisabled ? 0.7 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={form.syncToCalendar}
                  disabled={syncDisabled}
                  onChange={(e) => update('syncToCalendar', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: DT.gold }}
                />
                <span>סנכרן עם Google Calendar</span>
              </label>
            )}

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
            <button type="button" onClick={onClose} style={ghostBtn()}>
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

function pickerEmpty() {
  return {
    ...FONT,
    padding: 14,
    fontSize: 12.5,
    color: DT.muted,
    textAlign: 'center',
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
