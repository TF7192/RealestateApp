import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, AlertCircle, Building2, User } from 'lucide-react';
import api from '../lib/api';
import EmptyState from './EmptyState';
import { displayPrice, displayText } from '../lib/display';
import './MatchingList.css';

// ──────────────────────────────────────────────────────────────────
// MatchingList — read-only score + reasons list.
//
// Works for both directions:
//   - leadId  → listing matching properties (property link per row)
//   - propertyId → listing matching customers (lead link per row)
//
// Data shape (from the backend matching engine):
//   { items: [{ id, score, reasons: string[], property?: {...}, lead?: {...} }] }
// ──────────────────────────────────────────────────────────────────
export default function MatchingList({
  leadId,
  propertyId,
  limit = 10,
  title,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const direction = leadId ? 'lead' : propertyId ? 'property' : null;
  const resolvedTitle = title || (direction === 'lead' ? 'נכסים תואמים' : 'לקוחות תואמים');

  const load = useCallback(async () => {
    // L-9 (same shape as P-9): if neither anchor prop was passed we
    // can't load anything — drop out of the loading state so the UI
    // shows the empty state instead of an infinite spinner.
    if (!direction) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = direction === 'lead'
        ? await api.leadMatches(leadId)
        : await api.propertyMatchingCustomers(propertyId);
      const raw = res?.items || [];
      setItems(limit ? raw.slice(0, limit) : raw);
    } catch (e) {
      setError(e?.message || 'טעינת התאמות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [direction, leadId, propertyId, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="matching-list" aria-label={resolvedTitle} dir="rtl">
      <header className="ml-header">
        <h3 className="ml-title">
          <Sparkles size={16} aria-hidden />
          {resolvedTitle}
          {items.length > 0 && <span className="ml-count">{items.length}</span>}
        </h3>
      </header>

      {loading ? (
        <div className="ml-loading" role="status">
          <Loader2 size={16} className="y2-spin" aria-hidden />
          <span>מחשב התאמות…</span>
        </div>
      ) : error ? (
        <div className="ml-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
          {/* L-9 — inline retry so an agent whose first load failed
              doesn't have to navigate away and back. */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={load}
            style={{ marginInlineStart: 'auto' }}
          >
            נסה שוב
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="filtered"
          title="אין התאמות כרגע"
          description={direction === 'lead'
            ? 'נסה להרחיב את פרופיל החיפוש או להוסיף עיר נוספת.'
            : 'נסה לעדכן את טווח המחיר או החדרים בנכס.'}
        />
      ) : (
        <ul className="ml-list">
          {items.map((m) => (
            <MatchRow key={m.id || `${direction}-${Math.random()}`} match={m} direction={direction} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchRow({ match, direction }) {
  const score = Math.round(Number(match.score || 0));
  const reasons = Array.isArray(match.reasons) ? match.reasons : [];
  const entity = direction === 'lead' ? match.property : match.lead;
  const name = entity?.name || entity?.title || entity?.address || displayText(null);
  const href = direction === 'lead'
    ? (entity?.id ? `/properties/${entity.id}` : null)
    : (entity?.id ? `/customers/${entity.id}` : null);
  const Icon = direction === 'lead' ? Building2 : User;

  const body = (
    <>
      <span className={`ml-score ${scoreTone(score)}`}>
        <strong>{score}</strong>
        <span className="ml-score-pct" aria-hidden>%</span>
      </span>
      <span className="ml-body">
        <span className="ml-name">
          <Icon size={12} aria-hidden />
          {name}
        </span>
        {direction === 'lead' && entity?.price != null && (
          <span className="ml-sub">{displayPrice(entity.price)}</span>
        )}
        {direction === 'property' && entity?.phone && (
          <span className="ml-sub">{entity.phone}</span>
        )}
        {reasons.length > 0 && (
          <ul className="ml-reasons">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </span>
    </>
  );

  return (
    <li className="ml-row">
      {href ? (
        <Link to={href} className="ml-row-link">{body}</Link>
      ) : (
        <div className="ml-row-link ml-row-static">{body}</div>
      )}
    </li>
  );
}

function scoreTone(score) {
  if (score >= 80) return 'ml-score-hot';
  if (score >= 50) return 'ml-score-warm';
  return 'ml-score-cold';
}
