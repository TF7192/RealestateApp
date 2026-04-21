import { useEffect, useState } from 'react';
import { X, Calendar, Video, MapPin, AlertCircle, Check } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import haptics from '../lib/haptics';
import './LeadMeetingDialog.css';

// 7.2 — Schedule a meeting with a lead (brief: 30-min default,
// Meet-link option, auto-invite). Falls back to calendar-less
// local record if Google Calendar isn't connected, but then shows
// a nudge to connect.

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
      if (e?.data?.error?.code === 'calendar_not_connected') {
        setErr('Google Calendar לא מחובר — אפשר לבטל את הסנכרון ולשמור מקומית, או להתחבר בעמוד הפרופיל');
      } else {
        setErr(e?.message || 'השמירה נכשלה');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="lmd-backdrop" onClick={onClose}>
        <div className="lmd-panel" onClick={(e) => e.stopPropagation()} dir="rtl">
          <header className="lmd-head">
            <div>
              <strong>תזמון פגישה</strong>
              <span>{lead?.name}</span>
            </div>
            <button className="lmd-close" onClick={onClose} aria-label="סגור"><X size={18} /></button>
          </header>

          <div className="lmd-body">
            <div className="lmd-field">
              <label>כותרת הפגישה</label>
              <input
                className="lmd-input"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                autoCapitalize="sentences"
                enterKeyHint="next"
              />
            </div>

            <div className="lmd-row">
              <div className="lmd-field">
                <label><Calendar size={12} /> תאריך ושעה</label>
                <input
                  type="datetime-local"
                  className="lmd-input"
                  value={form.startsAt}
                  onChange={(e) => update('startsAt', e.target.value)}
                />
              </div>
              <div className="lmd-field">
                <label>משך (דקות)</label>
                <select
                  className="lmd-input"
                  value={form.durationMin}
                  onChange={(e) => update('durationMin', Number(e.target.value))}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                </select>
              </div>
            </div>

            <div className="lmd-row">
              <div className="lmd-field">
                <label><MapPin size={12} /> מיקום</label>
                <input
                  className="lmd-input"
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                  placeholder="משרד / כתובת / ריק עבור Meet"
                />
              </div>
              <div className="lmd-field">
                <label>אימייל מוזמן</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  dir="ltr"
                  className="lmd-input"
                  value={form.attendeeEmail}
                  onChange={(e) => update('attendeeEmail', e.target.value)}
                  placeholder="lead@example.com"
                />
              </div>
            </div>

            <div className="lmd-field">
              <label>הערות</label>
              <textarea
                className="lmd-textarea"
                rows={3}
                dir="auto"
                autoCapitalize="sentences"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="נושאים, הכנות, קישורים…"
              />
            </div>

            <div className="lmd-opts">
              <label className="lmd-opt">
                <input
                  type="checkbox"
                  checked={form.syncToCalendar && calendarConnected !== false}
                  disabled={calendarConnected === false}
                  onChange={(e) => update('syncToCalendar', e.target.checked)}
                />
                <span>הוסף ל-Google Calendar של סוכן</span>
              </label>
              <label className="lmd-opt">
                <input
                  type="checkbox"
                  checked={form.addMeetLink && form.syncToCalendar}
                  disabled={!form.syncToCalendar || calendarConnected === false}
                  onChange={(e) => update('addMeetLink', e.target.checked)}
                />
                <span><Video size={12} /> הוסף קישור Meet אוטומטי</span>
              </label>
              {calendarConnected === false && (
                <small className="lmd-cal-warn">
                  Google Calendar לא מחובר — <a href="/profile">התחבר בעמוד הפרופיל</a> כדי לסנכרן אוטומטית.
                </small>
              )}
            </div>

            {err && <div className="lmd-err"><AlertCircle size={12} /> {err}</div>}
          </div>

          <footer className="lmd-foot">
            <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              <Check size={14} /> {busy ? 'שומר…' : 'קבע פגישה'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
