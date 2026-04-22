import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import './DataTable.css';

// Headless-ish data table: caller passes column definitions + rows.
// Handles click-to-sort on any column marked sortable, and renders a
// cell via `render(row)` (or falls back to `row[accessor]`).
//
// Not trying to be generic "tanstack/table"-sized — this is a small,
// RTL-first, Hebrew-heading table that matches the cards it replaces.

export default function DataTable({
  columns,
  rows,
  rowKey = (r) => r.id,
  onRowClick,
  ariaLabel,
  emptyMessage = 'אין נתונים להצגה',
}) {
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const col = columns.find((c) => c.key === sortBy);
    if (!col) return rows;
    const get = col.sortValue || ((r) => (col.accessor ? r[col.accessor] : null));
    const arr = [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), 'he');
    });
    return sortDir === 'desc' ? arr.reverse() : arr;
  }, [rows, columns, sortBy, sortDir]);

  const onHeaderClick = (col) => {
    if (!col.sortable) return;
    if (sortBy === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col.key);
      setSortDir('asc');
    }
  };

  if (!rows.length) {
    return <div className="data-table-empty">{emptyMessage}</div>;
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((col) => {
              const isActive = sortBy === col.key;
              const Arrow = !col.sortable ? null : isActive ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`${col.sortable ? 'is-sortable' : ''} ${isActive ? 'is-active' : ''} ${col.className || ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => onHeaderClick(col)}
                  aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="th-inner">
                    <span>{col.header}</span>
                    {Arrow && <Arrow size={13} aria-hidden="true" className="th-arrow" />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'is-clickable' : ''}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className || ''}>
                  {col.render ? col.render(row) : col.accessor ? row[col.accessor] : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
