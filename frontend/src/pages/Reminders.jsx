// Reminders — refined to the "Estia Refined Pages" (2026-04-24) bundle.
// Cream & Gold, RTL, inline DT styles. Same CRUD contract as before:
// api.listReminders / createReminder / completeReminder / cancelReminder /
// deleteReminder. Layout:
//   - Title row with count summary + primary "הוסף תזכורת" toggle
//   - Inline create card (collapses until "הוסף תזכורת" is pressed)
//   - Three status pills (פתוחות / הושלמו / בוטלו) with live counts
//   - List of reminder cards: title + notes + due/anchor meta + row actions
//
// Each pending row is a gold card; completed/cancelled rows fade back to
// cream4 with the status surfaced as a chip. All actions flow through
// optimisticUpdate() so the UI reacts instantly and rolls back on error.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, Check, X as XIcon, Trash2, Plus, Clock, CheckCircle2, Ban,
  CalendarDays, Link2, AlertTriangle,
} from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import { useViewportMobile } from '../hooks/mobile';

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

const TABS = [
  { key: 'PENDING',   label: 'פתוחות',  Icon: Clock },
  { key: 'COMPLETED', label: 'הושלמו',  Icon: CheckCircle2 },
  { key: 'CANCELLED', label: 'בוטלו',   Icon: Ban },
];

const EMPTY_FORM = { title: '', dueAt: '', notes: '' };

// Format the due-at into a Hebrew "עוד Xש / באיחור Xש / היום 14:30" —
// makes the card meaningful at a glance without opening the reminder.
function relativeDue(iso) {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const diffMs  = due.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));
  const timeLabel = due.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const sameDay = due.toDateString() === now.toDateString();
  // Within-60-min bucket wins regardless of calendar day — a reminder
  // that crossed midnight 10 min ago still reads as "באיחור 10 דק׳"
  // rather than falling into the diffDay=0/!sameDay gap below.
  if (Math.abs(diffMin) < 60) {
    if (diffMin === 0) return { text: 'עכשיו', tone: 'urgent' };
    if (diffMin > 0)   return { text: `בעוד ${diffMin} דק׳`, tone: 'urgent' };
    return { text: `באיחור ${-diffMin} דק׳`, tone: 'overdue' };
  }
  if (sameDay)        return { text: `היום ${timeLabel}`, tone: diffMs >= 0 ? 'soon' : 'overdue' };
  if (diffDay === 1)  return { text: `מחר ${timeLabel}`, tone: 'soon' };
  if (diffDay === -1) return { text: `אתמול ${timeLabel}`, tone: 'overdue' };
  if (diffDay > 1)    return { text: `בעוד ${diffDay} ימים · ${timeLabel}`, tone: 'future' };
  if (diffDay < -1)   return { text: `באיחור ${-diffDay} ימים`, tone: 'overdue' };
  // diffDay === 0 but calendar date differs (rare near-midnight case
  // beyond the 60-min bucket above). Sign of diffMs decides so an
  // overdue reminder never reads as 'future'.
  return diffMs >= 0
    ? { text: `מחר ${timeLabel}`, tone: 'soon' }
    : { text: `אתמול ${timeLabel}`, tone: 'overdue' };
}

// Convert YYYY-MM-DDTHH:mm (datetime-local) -> ISO. The backend requires
// a `dueAt` on create, so an empty field defaults to 1 h from now.
function resolveDueAt(raw) {
  if (raw && raw.trim()) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = new Date(Date.now() + 60 * 60 * 1000);
  return fallback.toISOString();
}

export default function Reminders() {
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const [tab, setTab] = useState('PENDING');
  const [itemsByTab, setItemsByTab] = useState({ PENDING: [], COMPLETED: [], CANCELLED: [] });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Fresh toast object each render — stash in a ref to keep `load`
  // stable so the mount effect doesn't re-run and flood the screen on
  // network errors. Same pattern as the original file.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Load every tab in parallel on mount so the pill counts are correct
  // immediately. Subsequent tab switches are instantaneous (already in
  // state); mutations reload all three to keep counts honest.
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, x] = await Promise.all([
        api.listReminders({ status: 'PENDING'   }),
        api.listReminders({ status: 'COMPLETED' }),
        api.listReminders({ status: 'CANCELLED' }),
      ]);
      setItemsByTab({
        PENDING:   p?.items || [],
        COMPLETED: c?.items || [],
        CANCELLED: x?.items || [],
      });
    } catch {
      toastRef.current?.error?.('שגיאה בטעינת תזכורות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const items = itemsByTab[tab] || [];
  const counts = {
    PENDING:   itemsByTab.PENDING.length,
    COMPLETED: itemsByTab.COMPLETED.length,
    CANCELLED: itemsByTab.CANCELLED.length,
  };

  const dueNowCount = useMemo(() => {
    const now = Date.now();
    return itemsByTab.PENDING.filter((r) => {
      if (!r.dueAt) return false;
      return new Date(r.dueAt).getTime() <= now;
    }).length;
  }, [itemsByTab.PENDING]);

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const title = form.title.trim();
    if (!title) {
      toast.error('נדרש תיאור לתזכורת');
      return;
    }
    setSaving(true);
    try {
      const body = {
        title,
        notes: form.notes.trim() || null,
        dueAt: resolveDueAt(form.dueAt),
      };
      await api.createReminder(body);
      setForm(EMPTY_FORM);
      setComposerOpen(false);
      toast.success('תזכורת נוצרה');
      if (tab !== 'PENDING') setTab('PENDING');
      await loadAll();
    } catch {
      toast.error('יצירת התזכורת נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מסמן כהושלם…',
        success: 'התזכורת סומנה כהושלמה',
        onSave: () => api.completeReminder(id),
      });
      await loadAll();
    } catch { /* toast handled */ }
  };

  const handleCancel = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מבטל…',
        success: 'התזכורת בוטלה',
        onSave: () => api.cancelReminder(id),
      });
      await loadAll();
    } catch { /* toast handled */ }
  };

  const handleDelete = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מוחק…',
        success: 'התזכורת נמחקה',
        onSave: () => api.deleteReminder(id),
      });
      await loadAll();
    } catch { /* toast handled */ }
  };

  return (
    <div dir="rtl" style={{
      ...FONT,
      padding: isMobile ? '18px 14px 40px' : 28,
      color: DT.ink, minHeight: '100%',
    }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: isMobile ? 14 : 18, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 1,
          }}>
            <Bell size={12} /> ESTIA · תזכורות
          </div>
          <h1 style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            letterSpacing: -0.7, margin: '4px 0 0',
          }}>תזכורות</h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4, lineHeight: 1.6 }}>
            {counts.PENDING} פתוחות · {counts.COMPLETED} הושלמו · {counts.CANCELLED} בוטלו
            {dueNowCount > 0 && (
              <>
                {' · '}
                <strong style={{ color: DT.danger, fontWeight: 700 }}>
                  {dueNowCount} דורשות טיפול עכשיו
                </strong>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((v) => !v)}
          aria-expanded={composerOpen}
          style={composerOpen ? ghostBtn() : primaryBtn()}
        >
          {composerOpen ? <XIcon size={14} /> : <Plus size={14} />}
          <span>{composerOpen ? 'סגור טופס' : 'הוסף תזכורת'}</span>
        </button>
      </div>

      {/* Composer card — collapsible to keep the page calm. */}
      {composerOpen && (
        <form
          onSubmit={handleCreate}
          aria-label="תזכורת חדשה"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 14, padding: isMobile ? 14 : 18,
            marginBottom: isMobile ? 14 : 18,
            boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 220px',
            gap: 12,
          }}>
            <FormField label="תיאור" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="למשל: להתקשר ללקוח"
                aria-label="תיאור תזכורת"
                required
                style={inputStyle()}
              />
            </FormField>
            <FormField label="תאריך יעד">
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => update('dueAt', e.target.value)}
                aria-label="תאריך יעד"
                inputMode="numeric"
                style={inputStyle()}
              />
            </FormField>
          </div>
          <div style={{ marginTop: 12 }}>
            <FormField label="הערות (לא חובה)">
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="פרטים נוספים"
                aria-label="הערות"
                style={{ ...inputStyle(), resize: isMobile ? 'none' : 'vertical', minHeight: 60 }}
              />
            </FormField>
          </div>
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            marginTop: 14, flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={() => { setForm(EMPTY_FORM); setComposerOpen(false); }}
              style={ghostBtn()}
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              style={{
                ...primaryBtn(),
                opacity: saving || !form.title.trim() ? 0.55 : 1,
                cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <Plus size={14} />
              <span>{saving ? 'שומר…' : 'צור תזכורת'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Status tabs — pills, gold-filled when active. */}
      <div
        role="tablist"
        aria-label="מצב תזכורות"
        style={{
          display: 'flex', gap: 6, marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((t) => {
          const on = tab === t.key;
          const n  = counts[t.key] || 0;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              style={{
                ...FONT,
                background: on ? DT.ink : DT.white,
                color: on ? DT.cream : DT.ink,
                border: `1px solid ${on ? DT.ink : DT.border}`,
                padding: '8px 14px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <t.Icon size={13} />
              <span>{t.label}</span>
              <span style={{
                background: on ? DT.goldLight : DT.cream3,
                color: on ? DT.ink : DT.muted,
                borderRadius: 99, padding: '1px 7px',
                fontSize: 11, fontWeight: 800,
              }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div aria-busy={loading ? 'true' : 'false'}>
        {loading && items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                height: 84, borderRadius: 14,
                background: `linear-gradient(90deg, ${DT.cream2}, ${DT.white}, ${DT.cream2})`,
                backgroundSize: '200% 100%',
                animation: 'reminders-shimmer 1.4s infinite linear',
                border: `1px solid ${DT.border}`,
              }} />
            ))}
            <style>{`
              @keyframes reminders-shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </div>
        ) : items.length === 0 ? (
          <EmptyCard tab={tab} onCompose={() => { setComposerOpen(true); setTab('PENDING'); }} />
        ) : (
          <ul style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {items.map((r) => (
              <ReminderCard
                key={r.id}
                r={r}
                tab={tab}
                isMobile={isMobile}
                onComplete={() => handleComplete(r.id)}
                onCancel={() => handleCancel(r.id)}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Reminder card ──────────────────────────────────────────
function ReminderCard({ r, tab, isMobile, onComplete, onCancel, onDelete }) {
  const due = relativeDue(r.dueAt);
  const isPending   = tab === 'PENDING';
  const isCompleted = tab === 'COMPLETED';
  const isCancelled = tab === 'CANCELLED';

  // Left edge strip conveys status at a glance — gold for pending
  // (on-track), amber for near-due, red for overdue, muted for done.
  const accent =
    isCancelled                  ? DT.cream3 :
    isCompleted                  ? DT.success :
    due?.tone === 'overdue'      ? DT.danger :
    due?.tone === 'urgent'       ? DT.danger :
    due?.tone === 'soon'         ? DT.gold :
                                   DT.goldLight;

  const baseBg =
    isCancelled || isCompleted ? DT.cream4 :
    (due?.tone === 'overdue' || due?.tone === 'urgent') ? 'rgba(185,28,28,0.04)' :
    DT.white;

  return (
    <li style={{
      display: 'flex', gap: 0,
      background: baseBg,
      border: `1px solid ${DT.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Accent strip on the inline-start edge */}
      <div style={{
        width: 4, flexShrink: 0,
        background: accent,
      }} aria-hidden />
      <div style={{
        flex: 1, minWidth: 0,
        padding: isMobile ? 12 : '14px 16px',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 10 : 14, alignItems: isMobile ? 'stretch' : 'center',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap', marginBottom: 4,
          }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: DT.ink,
              textDecoration: isCompleted ? 'line-through' : 'none',
              opacity: isCompleted || isCancelled ? 0.75 : 1,
            }}>{displayText(r.title)}</div>
            {isCompleted && <StatusChip tone="success">הושלם</StatusChip>}
            {isCancelled && <StatusChip tone="muted">בוטל</StatusChip>}
            {isPending && due?.tone === 'overdue' && (
              <StatusChip tone="danger" icon={AlertTriangle}>באיחור</StatusChip>
            )}
            {isPending && due?.tone === 'urgent' && (
              <StatusChip tone="danger" icon={Clock}>דחוף</StatusChip>
            )}
          </div>

          {r.notes && (
            <div style={{
              fontSize: 13, color: DT.muted, lineHeight: 1.55,
              marginBottom: 6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{r.notes}</div>
          )}

          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            fontSize: 12, color: DT.muted, alignItems: 'center',
          }}>
            {due && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                color: due.tone === 'overdue' || due.tone === 'urgent'
                  ? DT.danger
                  : DT.goldDark,
                fontWeight: 700,
              }}>
                <CalendarDays size={12} />
                <span>{due.text}</span>
              </span>
            )}
            {r.leadId && (
              <Link
                to={`/customers/${r.leadId}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: DT.gold, textDecoration: 'none', fontWeight: 600,
                }}
              >
                <Link2 size={12} />
                <span>ליד</span>
              </Link>
            )}
            {r.propertyId && (
              <Link
                to={`/properties/${r.propertyId}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: DT.gold, textDecoration: 'none', fontWeight: 600,
                }}
              >
                <Link2 size={12} />
                <span>נכס</span>
              </Link>
            )}
          </div>
        </div>

        {/* Row actions — adapt to tab state. */}
        <div style={{
          display: 'flex', gap: 6, flexShrink: 0,
          alignItems: 'center', justifyContent: isMobile ? 'flex-end' : 'flex-end',
          flexWrap: 'wrap',
        }}>
          {isPending && (
            <>
              <button
                type="button"
                onClick={onComplete}
                aria-label={`סמן כהושלם: ${r.title}`}
                style={primaryBtn()}
              >
                <Check size={14} />
                <span>הושלם</span>
              </button>
              <button
                type="button"
                onClick={onCancel}
                aria-label={`בטל: ${r.title}`}
                style={ghostBtn()}
              >
                <XIcon size={14} />
                <span>בטל</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`מחק: ${r.title}`}
            style={iconOnlyBtn(DT.danger)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  );
}

// ─── Empty state ────────────────────────────────────────────
function EmptyCard({ tab, onCompose }) {
  const map = {
    PENDING:   { title: 'אין תזכורות פתוחות',  body: 'צור/י תזכורת חדשה כדי לא לשכוח להתקשר, לעקוב אחרי הצעה, או לתאם פגישה.' },
    COMPLETED: { title: 'אין תזכורות שהושלמו', body: 'כשתסמן/י תזכורת כהושלמה, היא תופיע כאן להיסטוריה.' },
    CANCELLED: { title: 'אין תזכורות שבוטלו',  body: 'תזכורות שביטלת יופיעו כאן — אפשר לשחזר או למחוק סופית.' },
  };
  const { title, body } = map[tab] || map.PENDING;
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: DT.goldSoft, color: DT.goldDark,
        display: 'grid', placeItems: 'center',
        margin: '0 auto 12px',
      }}>
        <Bell size={24} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13, color: DT.muted, margin: '0 auto', maxWidth: 360, lineHeight: 1.7 }}>
        {body}
      </p>
      {tab === 'PENDING' && (
        <button type="button" onClick={onCompose} style={{ ...primaryBtn(), marginTop: 14 }}>
          <Plus size={14} />
          <span>הוסף תזכורת</span>
        </button>
      )}
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────
function FormField({ label, required, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: DT.muted }}>
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function StatusChip({ tone, icon: Icon, children }) {
  const map = {
    success: [DT.success, 'rgba(21,128,61,0.12)'],
    danger:  [DT.danger,  'rgba(185,28,28,0.12)'],
    muted:   [DT.muted,   DT.cream3],
    gold:    [DT.goldDark, DT.goldSoft],
  };
  const [c, bg] = map[tone] || map.muted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      color: c, background: bg,
      borderRadius: 99, padding: '2px 8px',
      fontSize: 10, fontWeight: 700,
    }}>
      {Icon ? <Icon size={10} /> : null}
      {children}
    </span>
  );
}

function inputStyle() {
  return {
    ...FONT,
    padding: '10px 12px',
    border: `1px solid ${DT.border}`,
    borderRadius: 10,
    background: DT.white,
    color: DT.ink,
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };
}

function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.28)',
    textDecoration: 'none',
  };
}

function ghostBtn() {
  return {
    ...FONT,
    background: DT.white, color: DT.ink,
    border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    textDecoration: 'none',
  };
}

function iconOnlyBtn(color) {
  return {
    ...FONT,
    background: 'transparent',
    border: `1px solid ${DT.border}`,
    width: 44, height: 44, borderRadius: 10, cursor: 'pointer',
    color, display: 'grid', placeItems: 'center',
  };
}
