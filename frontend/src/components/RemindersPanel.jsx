import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Plus, Check, X, Trash2, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import EmptyState from './EmptyState';
import { displayDate } from '../lib/display';
import './RemindersPanel.css';

// ──────────────────────────────────────────────────────────────────
// RemindersPanel — entity-agnostic reminder list.
//
// Anchors via exactly one of `leadId`, `propertyId`, `customerId`. The
// panel loads open reminders for that anchor, lets the agent compose a
// new one inline, and surfaces per-row complete / cancel / delete
// actions. No modal — the compose form drops into a disclosure region
// so the common case (1-2 reminders on a detail page) stays one click.
// ──────────────────────────────────────────────────────────────────
export default function RemindersPanel({
  leadId,
  propertyId,
  customerId,
  title = 'תזכורות',
  compact = false,
}) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [draft, setDraft] = useState({ title: '', dueAt: '', notes: '' });

  const anchor = useMemo(() => {
    if (leadId) return { leadId };
    if (propertyId) return { propertyId };
    if (customerId) return { customerId };
    return null;
  }, [leadId, propertyId, customerId]);

  const refresh = useCallback(async () => {
    if (!anchor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listReminders(anchor);
      setItems(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת תזכורות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      toast.error('הוסף כותרת לתזכורת');
      return;
    }
    setComposeBusy(true);
    try {
      const body = {
        title: draft.title.trim(),
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        notes: draft.notes.trim() || null,
        ...anchor,
      };
      await api.createReminder(body);
      setDraft({ title: '', dueAt: '', notes: '' });
      setComposeOpen(false);
      toast.success('התזכורת נוספה');
      await refresh();
    } catch (err) {
      toast.error(err?.message || 'יצירת התזכורת נכשלה');
    } finally {
      setComposeBusy(false);
    }
  };

  const complete = async (rem) => {
    try {
      await api.completeReminder(rem.id);
      toast.success('התזכורת סומנה כהושלמה');
      await refresh();
    } catch (e) { toast.error(e?.message || 'שמירה נכשלה'); }
  };
  const cancel = async (rem) => {
    try {
      await api.cancelReminder(rem.id);
      toast.info('התזכורת בוטלה');
      await refresh();
    } catch (e) { toast.error(e?.message || 'שמירה נכשלה'); }
  };
  const remove = async (rem) => {
    try {
      await api.deleteReminder(rem.id);
      toast.info('התזכורת נמחקה');
      await refresh();
    } catch (e) { toast.error(e?.message || 'מחיקה נכשלה'); }
  };

  return (
    <section className={`reminders-panel ${compact ? 'is-compact' : ''}`} aria-label={title} dir="rtl">
      <header className="rp-header">
        <h3 className="rp-title">
          <Bell size={16} aria-hidden />
          {title}
          {items.length > 0 && <span className="rp-count" aria-label={`${items.length} תזכורות`}>{items.length}</span>}
        </h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setComposeOpen((v) => !v)}
          aria-expanded={composeOpen}
        >
          <Plus size={14} aria-hidden />
          {composeOpen ? 'סגור' : 'תזכורת חדשה'}
        </button>
      </header>

      {composeOpen && (
        <form onSubmit={submit} className="rp-compose" aria-label="תזכורת חדשה">
          <div className="form-group">
            <label className="form-label" htmlFor="rp-title">כותרת</label>
            <input
              id="rp-title"
              className="form-input"
              dir="auto"
              enterKeyHint="next"
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="להתקשר בחמישי בבוקר"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rp-due">תאריך יעד</label>
            <input
              id="rp-due"
              type="datetime-local"
              className="form-input"
              value={draft.dueAt}
              onChange={(e) => setDraft((p) => ({ ...p, dueAt: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rp-notes">הערות</label>
            <textarea
              id="rp-notes"
              className="form-textarea"
              dir="auto"
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div className="rp-compose-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={composeBusy}>
              {composeBusy ? <Loader2 size={14} className="y2-spin" aria-hidden /> : <Check size={14} aria-hidden />}
              שמור
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setComposeOpen(false); setDraft({ title: '', dueAt: '', notes: '' }); }}
            >
              ביטול
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rp-loading" role="status">
          <Loader2 size={16} className="y2-spin" aria-hidden />
          <span>טוען תזכורות…</span>
        </div>
      ) : error ? (
        <div className="rp-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="filtered"
          title="אין תזכורות פתוחות"
          description="הוסף תזכורת כדי לא לשכוח לחזור ללקוח."
        />
      ) : (
        <ul className="rp-list">
          {items.map((r) => (
            <li key={r.id} className={`rp-item rp-status-${(r.status || 'PENDING').toLowerCase()}`}>
              <div className="rp-item-main">
                <div className="rp-item-title">{r.title}</div>
                {r.dueAt && (
                  <div className="rp-item-due" title={r.dueAt}>
                    {displayDate(r.dueAt)}
                  </div>
                )}
                {r.notes && <div className="rp-item-notes">{r.notes}</div>}
              </div>
              <div className="rp-item-actions">
                {r.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => complete(r)}
                    aria-label={`סמן "${r.title}" כהושלם`}
                  >
                    <Check size={14} aria-hidden />
                  </button>
                )}
                {r.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => cancel(r)}
                    aria-label={`בטל "${r.title}"`}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(r)}
                  aria-label={`מחק "${r.title}"`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
