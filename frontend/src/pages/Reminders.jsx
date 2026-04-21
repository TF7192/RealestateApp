import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  X as XIcon,
  Trash2,
  Plus,
  Clock,
  CheckCircle2,
  Ban,
} from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayDateTime, displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';
import './Reminders.css';

// D1 — standalone reminders page.
//
// Tabs for pending / completed / cancelled, inline create form, and
// inline row actions (complete / cancel / delete). Reuses optimistic
// update flow from lib/toast so the UI responds instantly and rolls
// back on error.

const TABS = [
  { key: 'PENDING',   label: 'פתוחות',   Icon: Clock },
  { key: 'COMPLETED', label: 'הושלמו',   Icon: CheckCircle2 },
  { key: 'CANCELLED', label: 'בוטלו',    Icon: Ban },
];

const EMPTY_FORM = { title: '', dueAt: '', notes: '' };

export default function Reminders() {
  const toast = useToast();
  const [tab, setTab] = useState('PENDING');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listReminders({ status: tab });
      setItems(res?.items || []);
    } catch {
      toast.error('שגיאה בטעינת תזכורות');
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

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
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      };
      await api.createReminder(body);
      setForm(EMPTY_FORM);
      toast.success('תזכורת נוצרה');
      if (tab !== 'PENDING') setTab('PENDING');
      else await load();
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
      await load();
    } catch { /* toast handled */ }
  };

  const handleCancel = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מבטל…',
        success: 'התזכורת בוטלה',
        onSave: () => api.cancelReminder(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const handleDelete = async (id) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מוחק…',
        success: 'התזכורת נמחקה',
        onSave: () => api.deleteReminder(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const counts = useMemo(() => ({
    [tab]: items.length,
  }), [tab, items]);

  return (
    <div className="reminders-page" dir="rtl">
      <header className="reminders-header">
        <div className="reminders-title">
          <Bell size={22} aria-hidden="true" />
          <h1>תזכורות</h1>
        </div>
        <p className="reminders-subtitle">
          כל התזכורות שלך במקום אחד — צור חדשה, סמן כבוצעה או בטל.
        </p>
      </header>

      <section className="reminders-new" aria-label="תזכורת חדשה">
        <form className="reminders-form" onSubmit={handleCreate}>
          <div className="reminders-form-row">
            <label className="reminders-field reminders-field-grow">
              <span>תיאור</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="למשל: להתקשר ללקוח"
                aria-label="תיאור תזכורת"
                required
              />
            </label>
            <label className="reminders-field">
              <span>תאריך יעד</span>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => update('dueAt', e.target.value)}
                aria-label="תאריך יעד"
              />
            </label>
          </div>
          <label className="reminders-field">
            <span>הערות</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="פרטים נוספים (לא חובה)"
              aria-label="הערות"
            />
          </label>
          <div className="reminders-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !form.title.trim()}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{saving ? 'שומר…' : 'הוסף תזכורת'}</span>
            </button>
          </div>
        </form>
      </section>

      <div className="reminders-tabs" role="tablist" aria-label="מצב תזכורות">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`reminders-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.Icon size={14} aria-hidden="true" />
            <span>{t.label}</span>
            {tab === t.key && items.length > 0 && (
              <span className="reminders-tab-badge">{counts[tab] || 0}</span>
            )}
          </button>
        ))}
      </div>

      <section
        className="reminders-list"
        aria-label={`תזכורות ${tab}`}
        aria-busy={loading ? 'true' : 'false'}
      >
        {loading && items.length === 0 ? (
          <div className="reminders-skel" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="reminders-row reminders-row-skel" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell size={40} />}
            title={tab === 'PENDING' ? 'אין תזכורות פתוחות' :
                   tab === 'COMPLETED' ? 'אין תזכורות שהושלמו' :
                   'אין תזכורות שבוטלו'}
            description={tab === 'PENDING'
              ? 'צור/י תזכורת חדשה בטופס שלמעלה'
              : ''}
          />
        ) : (
          <ul className="reminders-rows">
            {items.map((r) => (
              <li key={r.id} className="reminders-row">
                <div className="reminders-row-body">
                  <div className="reminders-row-title">{displayText(r.title)}</div>
                  {r.notes && <div className="reminders-row-notes">{r.notes}</div>}
                  <div className="reminders-row-meta">
                    {r.dueAt && <span>יעד: {displayDateTime(r.dueAt)}</span>}
                    {r.leadId && <span>ליד: {r.leadId}</span>}
                    {r.propertyId && <span>נכס: {r.propertyId}</span>}
                  </div>
                </div>
                <div className="reminders-row-actions">
                  {tab === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleComplete(r.id)}
                        aria-label={`סמן כהושלם: ${r.title}`}
                      >
                        <Check size={14} aria-hidden="true" />
                        <span>הושלם</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleCancel(r.id)}
                        aria-label={`בטל: ${r.title}`}
                      >
                        <XIcon size={14} aria-hidden="true" />
                        <span>בטל</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost reminders-delete"
                    onClick={() => handleDelete(r.id)}
                    aria-label={`מחק: ${r.title}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
