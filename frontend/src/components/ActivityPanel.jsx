import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
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
    // P-9 — prior to this fix, missing entityType/entityId silently
    // returned early WITHOUT clearing the loading flag. That left the
    // tab stuck on its spinner forever whenever the parent forgot to
    // wire props (see PropertyDetail before it was patched to pass
    // entityType="PROPERTY" + entityId={property.id}). Now we short-
    // circuit to the empty state with loading=false so the UX degrades
    // to "no data" instead of "eternal spinner".
    if (!entityType || !entityId) {
      setLoading(false);
      setItems([]);
      return;
    }
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
          {/* P-9 — inline retry. Cheap to offer, prevents "refresh the
              whole page" as the only recovery path. */}
          <button type="button" className="btn btn-ghost btn-sm ap-retry" onClick={load}>
            נסה שוב
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="filtered"
          title="אין פעילות עדיין"
          description="עדכונים אוטומטיים יופיעו כאן ככל שהלקוח מתקדם."
        />
      ) : (
        <>
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
          {/* Sprint 7 — full-page timeline for leads. Only render the
              deep-link when we're actually scoped to a lead; the panel
              is generic (also used on PropertyDetail etc.) so the link
              would be a dead-end on other surfaces. */}
          {entityType === 'Lead' && entityId && (
            <div className="ap-footer">
              <Link to={`/customers/${entityId}/history`} className="ap-more">
                היסטוריה מלאה
                {/* RTL: an arrow that reads "→" visually at the end of
                    the line uses the left-pointing glyph. */}
                <ArrowLeft size={12} aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
