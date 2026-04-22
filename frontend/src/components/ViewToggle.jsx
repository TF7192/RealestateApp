import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import './ViewToggle.css';

// Segmented cards/table toggle. Controlled component — caller holds the
// state (usually via `useViewMode`). Hidden below 640px because tables
// are unusable on narrow screens; card view stays the only option on
// mobile.

export default function ViewToggle({ value, onChange, className = '' }) {
  return (
    <div className={`view-toggle ${className}`} role="group" aria-label="תצוגה">
      <button
        type="button"
        className={`view-toggle-btn ${value === 'cards' ? 'is-active' : ''}`}
        onClick={() => onChange('cards')}
        aria-pressed={value === 'cards'}
        title="תצוגת כרטיסים"
      >
        <LayoutGrid size={16} aria-hidden="true" />
        <span>כרטיסים</span>
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${value === 'table' ? 'is-active' : ''}`}
        onClick={() => onChange('table')}
        aria-pressed={value === 'table'}
        title="תצוגת טבלה"
      >
        <TableIcon size={16} aria-hidden="true" />
        <span>טבלה</span>
      </button>
    </div>
  );
}
