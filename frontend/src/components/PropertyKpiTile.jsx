import './PropertyKpiTile.css';

/**
 * PropertyKpiTile — small editorial-luxury KPI tile.
 *
 *   ┌──────────────┐
 *   │  77%         │  ← gold ring when value > 0
 *   │  שיווק       │  ← grey label
 *   │  17 / 22     │  ← optional sublabel
 *   └──────────────┘
 *
 * Props:
 *   value     — primary metric, displayed huge
 *   label     — small grey label beneath the number
 *   sublabel  — optional micro line under label (e.g. "17/22")
 *   tone      — 'gold' (default) | 'neutral' (no ring)
 *   onClick   — optional; tile becomes a button when set
 */
export default function PropertyKpiTile({ value, label, sublabel, tone = 'gold', onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  const isPositive = value !== 0 && value !== '0' && value !== '—' && value !== '';
  const ringClass = tone === 'gold' && isPositive ? 'pkt-ring' : '';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`pkt ${onClick ? 'pkt-interactive' : ''} ${ringClass} ${className}`.trim()}
    >
      <span className="pkt-value">{value}</span>
      <span className="pkt-label">{label}</span>
      {sublabel && <span className="pkt-sublabel">{sublabel}</span>}
    </Tag>
  );
}
