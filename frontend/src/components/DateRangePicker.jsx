import './DateRangePicker.css';

// E2 — Reusable date-range picker (controlled component).
//
// A dumb, controlled pair of <input type="date"> inputs plus a row of
// quick-range chips ("7 ימים", "חודש", "רבעון", "שנה"). Emits ISO dates
// (YYYY-MM-DD) through onChange so callers can forward straight to
// report endpoints.
//
// Usage:
//   const [from, setFrom] = useState(null);
//   const [to, setTo]   = useState(null);
//   <DateRangePicker
//     from={from}
//     to={to}
//     onChange={({ from, to }) => { setFrom(from); setTo(to); }}
//   />

const QUICK_RANGES = [
  { key: '7d',  label: '7 ימים',  days: 7 },
  { key: '30d', label: 'חודש',    days: 30 },
  { key: '90d', label: 'רבעון',  days: 90 },
  { key: '1y',  label: 'שנה',     days: 365 },
];

function toISODate(d) {
  // Format as YYYY-MM-DD in local time (matches <input type="date">).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DateRangePicker({
  from = '',
  to = '',
  onChange,
  'aria-label': ariaLabel = 'טווח תאריכים',
}) {
  const handleFrom = (v) => onChange?.({ from: v || '', to });
  const handleTo   = (v) => onChange?.({ from, to: v || '' });

  const applyQuick = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    onChange?.({ from: toISODate(start), to: toISODate(end) });
  };

  const clear = () => onChange?.({ from: '', to: '' });

  return (
    <div className="drp-root" role="group" aria-label={ariaLabel} dir="rtl">
      <div className="drp-fields">
        <label className="drp-field">
          <span className="drp-label">מתאריך</span>
          <input
            type="date"
            value={from || ''}
            onChange={(e) => handleFrom(e.target.value)}
            className="drp-input"
            aria-label="מתאריך"
          />
        </label>
        <label className="drp-field">
          <span className="drp-label">עד תאריך</span>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => handleTo(e.target.value)}
            className="drp-input"
            aria-label="עד תאריך"
          />
        </label>
      </div>
      <div className="drp-chips" role="group" aria-label="טווחים מהירים">
        {QUICK_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className="drp-chip"
            onClick={() => applyQuick(r.days)}
          >
            {r.label}
          </button>
        ))}
        {(from || to) && (
          <button
            type="button"
            className="drp-chip drp-chip-clear"
            onClick={clear}
            aria-label="נקה טווח"
          >
            נקה
          </button>
        )}
      </div>
    </div>
  );
}
