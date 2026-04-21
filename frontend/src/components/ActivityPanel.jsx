import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import EmptyState from './EmptyState';
import { relativeTime, absoluteTime } from '../lib/time';
import './ActivityPanel.css';

// ──────────────────────────────────────────────────────────────────
// ActivityPanel — read-only activity-log list for any entity.
//
// Backend returns entries shaped like:
//   { id, kind, action, actorName?, createdAt, summary? }
// The list sorts newest-first server-side; we just render. When both
// entityType + entityId are passed, the feed is scoped to that entity.
// ──────────────────────────────────────────────────────────────────
export default function ActivityPanel({
  entityType,
  entityId,
  limit = 20,
  title = 'יומן פעילות',
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listActivity({ entityType, entityId, limit });
      setItems(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת הפעילות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="activity-panel" aria-label={title} dir="rtl">
      <header className="ap-header">
        <h3 className="ap-title">
          <History size={16} aria-hidden />
          {title}
        </h3>
      </header>

      {loading ? (
        <div className="ap-loading" role="status">
          <Loader2 size={16} className="y2-spin" aria-hidden />
          <span>טוען…</span>
        </div>
      ) : error ? (
        <div className="ap-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="filtered"
          title="אין פעילות עדיין"
          description="עדכונים אוטומטיים יופיעו כאן ככל שהלקוח מתקדם."
        />
      ) : (
        <ul className="ap-list">
          {items.map((ev) => (
            <li key={ev.id} className="ap-item">
              <div className="ap-dot" aria-hidden />
              <div className="ap-body">
                <div className="ap-line">
                  {ev.actorName && <span className="ap-actor">{ev.actorName}</span>}
                  <span className="ap-action">{ev.summary || ev.action || ev.kind}</span>
                </div>
                {ev.createdAt && (
                  <time className="ap-time" dateTime={ev.createdAt} title={absoluteTime(ev.createdAt)}>
                    {relativeTime(ev.createdAt)}
                  </time>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
