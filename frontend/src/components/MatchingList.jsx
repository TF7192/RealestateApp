import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, Building2, User } from 'lucide-react';
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
// Lead-direction surfaces a 2-source picker:
//   - 'system'      → api.leadMatches (internal scoring, default)
//   - 'yad2'        → api.listMarketListings filtered by lead profile
//
// Data shape (from the backend matching engine):
//   { items: [{ id, score, reasons: string[], property?: {...}, lead?: {...} }] }
// ──────────────────────────────────────────────────────────────────
const SOURCE_OPTIONS = [
  { k: 'system', label: 'מהמערכת' },
  { k: 'yad2', label: 'מיד 2' },
];

export default function MatchingList({
  leadId,
  propertyId,
  lead,
  limit = 10,
  title,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('system');

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
      let raw = [];
      if (direction === 'property') {
        const res = await api.propertyMatchingCustomers(propertyId);
        raw = res?.items || [];
      } else if (source === 'system') {
        const res = await api.leadMatches(leadId);
        raw = res?.items || [];
      } else if (source === 'yad2') {
        // Yad 2 / market-discovery feed: filter the prod MarketListing
        // table by what we know about the lead (budget + first city +
        // room range). Returns the same item shape but no `score` —
        // we render a "n/a" tone instead.
        const params = paramsFromLead(lead);
        const res = await api.listMarketListings(params);
        const list = res?.items || [];
        raw = list.map((l) => ({
          id: `yad2-${l.id}`,
          score: 0,
          reasons: [],
          property: {
            id: l.id,
            street: l.street || l.address || null,
            city: l.city || null,
            price: l.price ?? null,
          },
          // Yad2 listings link out to /market-discovery/listings/:id
          // (a snapshot card inside our app), not /properties.
          _yad2: true,
        }));
      }
      setItems(limit ? raw.slice(0, limit) : raw);
    } catch (e) {
      setError(e?.message || 'טעינת התאמות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [direction, leadId, propertyId, limit, source, lead]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="matching-list" aria-label={resolvedTitle} dir="rtl">
      <header className="ml-header">
        <h3 className="ml-title">
          {direction === 'lead'
            ? <Building2 size={16} aria-hidden />
            : <User size={16} aria-hidden />}
          {resolvedTitle}
          {items.length > 0 && <span className="ml-count">{items.length}</span>}
        </h3>
        {direction === 'lead' && (
          <div role="radiogroup" aria-label="מקור ההתאמות" className="ml-sources">
            {SOURCE_OPTIONS.map((o) => (
              <button
                key={o.k}
                type="button"
                role="radio"
                aria-checked={source === o.k}
                className={`ml-source-pill ${source === o.k ? 'sel' : ''}`}
                onClick={() => setSource(o.k)}
              >{o.label}</button>
            ))}
          </div>
        )}
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

// Build /market-discovery/listings query params from a Lead. Used
// by the "מיד 2" tab so the Yad2 feed is pre-filtered to what
// this lead actually wants (first city, room range, budget cap).
function paramsFromLead(lead) {
  if (!lead) return { limit: 12 };
  const params = { limit: 12 };
  const city = (lead.cities && lead.cities[0]) || lead.city;
  if (city) params.city = city;
  if (lead.minRoom != null) params.minRooms = lead.minRoom;
  if (lead.maxRoom != null) params.maxRooms = lead.maxRoom;
  if (lead.minBudget != null) params.minPrice = lead.minBudget;
  if (lead.maxBudget != null) params.maxPrice = lead.maxBudget;
  if (lead.lookingFor === 'BUY') params.kind = 'forsale';
  if (lead.lookingFor === 'RENT') params.kind = 'rent';
  return params;
}

// Hebrew labels for the backend's snake_case reason tokens. The
// backend used to surface raw keys ("asset_class", "deal_type") —
// fixed here so the reason list reads as plain Hebrew.
const REASON_LABELS = {
  asset_class: 'סוג נכס תואם',
  deal_type:   'סוג עסקה תואם',
  city:        'עיר תואמת',
  price:       'תקציב תואם',
  rooms:       'מספר חדרים תואם',
};
function reasonLabel(key) {
  if (typeof key !== 'string') return null;
  return REASON_LABELS[key] || key;
}

function MatchRow({ match, direction }) {
  const score = Math.round(Number(match.score || 0));
  // Scores come back as 0..1 in some paths, 0..100 in others. Renormalise
  // so the "%" chip never shows "1%" for a full match.
  const scorePct = score > 0 && score <= 1
    ? Math.round(Number(match.score) * 100)
    : score;
  const reasons = Array.isArray(match.reasons) ? match.reasons : [];
  const entity = direction === 'lead' ? match.property : match.lead;
  // For a property the useful display is "street, city" — the
  // previous `name || title || address` fallback missed all three
  // fields on Property so the row rendered an em-dash.
  const name =
    (direction === 'lead'
      ? [entity?.street, entity?.city].filter(Boolean).join(', ')
      : (entity?.name || entity?.displayName))
    || entity?.title
    || entity?.address
    || displayText(null);
  const href = direction === 'lead'
    ? (match._yad2
        ? (entity?.id ? `/market-discovery/listings/${encodeURIComponent(entity.id)}` : null)
        : (entity?.id ? `/properties/${entity.id}` : null))
    : (entity?.id ? `/customers/${entity.id}` : null);
  const Icon = direction === 'lead' ? Building2 : User;

  const body = (
    <>
      <span className={`ml-score ${scoreTone(scorePct)}`}>
        <strong>{scorePct}</strong>
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
              <li key={i}>{reasonLabel(r)}</li>
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
