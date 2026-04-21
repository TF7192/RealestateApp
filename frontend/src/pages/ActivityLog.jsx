import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayDateTime, displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';
import './ActivityLog.css';

// H3 — global activity timeline.
//
// Lists every activity entry across the authenticated agent's entities.
// Filter chips narrow by entityType; the "limit" dropdown lets the
// agent expand the window in 50-row steps. Endpoint is owner-scoped
// on the backend.

const ENTITY_FILTERS = [
  { key: '',         label: 'הכל' },
  { key: 'PROPERTY', label: 'נכסים' },
  { key: 'LEAD',     label: 'לקוחות' },
  { key: 'DEAL',     label: 'עסקאות' },
  { key: 'OWNER',    label: 'בעלי נכסים' },
  { key: 'REMINDER', label: 'תזכורות' },
  { key: 'TAG',      label: 'תגיות' },
];

const LIMITS = [50, 100, 200, 500];

export default function ActivityLog() {
  const toast = useToast();
  const [entityType, setEntityType] = useState('');
  const [limit, setLimit] = useState(50);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const p = { limit };
    if (entityType) p.entityType = entityType;
    return p;
  }, [entityType, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listActivity(params);
      setItems(res?.items || []);
    } catch {
      toast.error('שגיאה בטעינת יומן הפעילות');
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="activity-page" dir="rtl">
      <header className="activity-header">
        <div className="activity-title">
          <Activity size={22} aria-hidden="true" />
          <h1>יומן פעילות</h1>
        </div>
        <p className="activity-subtitle">
          היסטוריית שינויים גלובלית על כל הרשומות שלך.
        </p>
      </header>

      <section className="activity-filters" aria-label="סינון לפי סוג">
        <div className="activity-chips" role="group" aria-label="סוג ישות">
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              className={`activity-chip ${entityType === f.key ? 'is-active' : ''}`}
              onClick={() => setEntityType(f.key)}
              aria-pressed={entityType === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="activity-controls">
          <label className="activity-limit">
            <span>מספר שורות</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="מספר שורות"
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={load}
            aria-label="רענן"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>רענן</span>
          </button>
        </div>
      </section>

      <section className="activity-list" aria-busy={loading ? 'true' : 'false'}>
        {loading && items.length === 0 ? (
          <div className="activity-skel" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="activity-row activity-row-skel" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Activity size={40} />}
            title="אין פעילות להצגה"
            description="כאשר תבצע שינויים ברשומות הם יופיעו כאן."
          />
        ) : (
          <ul className="activity-rows">
            {items.map((item) => (
              <li key={item.id} className="activity-row">
                <div className="activity-row-head">
                  <span className="activity-row-type">
                    {displayText(ENTITY_LABEL[item.entityType] || item.entityType)}
                  </span>
                  <span className="activity-row-action">{displayText(item.action)}</span>
                  <span className="activity-row-time">{displayDateTime(item.createdAt)}</span>
                </div>
                {item.summary && (
                  <p className="activity-row-summary">{item.summary}</p>
                )}
                {item.actorName && (
                  <span className="activity-row-actor">על ידי {item.actorName}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ENTITY_LABEL = {
  PROPERTY: 'נכס',
  LEAD:     'לקוח',
  DEAL:     'עסקה',
  OWNER:    'בעל נכס',
  REMINDER: 'תזכורת',
  TAG:      'תגית',
};
