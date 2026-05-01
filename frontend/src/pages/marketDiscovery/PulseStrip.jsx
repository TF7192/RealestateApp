// PulseStrip — 4 KPI tiles at the top of /market-discovery. Each tile
// is clickable and applies a focused filter combination to the
// underlying listing list.
//
// Tiles:
//   1) חדש היום         — new listings in the last 24h, with delta vs prior day
//   2) התאמות ללידים     — open matches for this agent in the last 3d
//   3) % פרטי           — share of private posters in the last 7d, with delta
//   4) שכונות חמות       — top neighborhoods by raw count in last 3d (chip list)

import { TrendingUp, TrendingDown, Sparkles, User, Building2, MapPin } from 'lucide-react';

export default function PulseStrip({ pulse, loading, onApply }) {
  return (
    <div className="md-pulse-strip" aria-label="סיכום פעילות שוק">
      <Tile
        loading={loading}
        label="חדש ב-24 שעות"
        icon={<Sparkles size={14} />}
        value={pulse?.newLast24h?.count}
        delta={pulse?.newLast24h?.deltaPct}
        sub="לחצ/י לסינון ל-24 שעות"
        onClick={() => onApply?.({ firstSeenAfter: '24h' })}
      />
      <Tile
        loading={loading}
        label="נכסים תואמי לידים"
        icon={<User size={14} />}
        value={pulse?.matchesForMe?.count}
        sub={pulse?.matchesForMe?.count > 0 ? '3 ימים אחרונים' : 'אין התאמות חדשות'}
        onClick={() => onApply?.({ matchedOnly: true, posterType: '' })}
        emphasize={pulse?.matchesForMe?.count > 0}
      />
      <Tile
        loading={loading}
        label="פרטי השבוע"
        icon={<Building2 size={14} />}
        value={pulse?.privatePct?.value != null ? `${pulse.privatePct.value}%` : null}
        sub="חלק הפרטיים בשוק"
        // Default poster filter is already 'private'; clicking the tile
        // surfaces the "all" view so the user can compare. A second
        // click returns to private. Stateful toggle, not a no-op.
        onClick={() => onApply?.({ posterType: 'all-toggle' })}
      />
      <HotNeighborhoodsTile
        loading={loading}
        items={pulse?.hotNeighborhoods}
        onPick={(n) => onApply?.({ neighborhood: n.neighborhood, city: n.city, posterType: '' })}
      />
    </div>
  );
}

function Tile({ loading, label, icon, value, delta, deltaSuffix, sub, onClick, emphasize }) {
  // Hide the delta when it's zero — "+0% מול תקופה קודמת" is noise; if
  // the FE wants to surface "no change" it should be a different copy.
  const hasDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const dir = hasDelta ? (delta > 0 ? 'up' : 'down') : 'neutral';
  return (
    <button
      type="button"
      className="md-tile"
      onClick={onClick}
      aria-label={`${label}: ${value ?? '—'}`}
      style={emphasize ? { borderColor: 'var(--gold-border)', background: 'var(--gold-glow)' } : undefined}
    >
      <div className="md-tile-label">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {icon} {label}
        </span>
      </div>
      <div className="md-tile-value">
        {loading ? '…' : (value ?? '—')}
      </div>
      {hasDelta && (
        <div className={`md-tile-delta ${dir}`}>
          {dir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {`${delta > 0 ? '+' : ''}${delta}${deltaSuffix ? ` ${deltaSuffix}` : '%'} מול אתמול`}
        </div>
      )}
      {sub && !hasDelta && <div className="md-tile-sub">{sub}</div>}
    </button>
  );
}

function HotNeighborhoodsTile({ loading, items, onPick }) {
  const list = Array.isArray(items) ? items.slice(0, 4) : [];
  return (
    <div className="md-tile" style={{ cursor: 'default' }} aria-label="שכונות חמות בימים האחרונים">
      <div className="md-tile-label">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={14} /> שכונות חמות
        </span>
      </div>
      {loading ? (
        <div className="md-tile-value" aria-hidden>…</div>
      ) : list.length === 0 ? (
        <div className="md-tile-sub">אין נתונים מספיקים</div>
      ) : (
        <div className="md-tile-chips" style={{ marginTop: 6 }}>
          {list.map((n) => (
            <button
              key={`${n.city}|${n.neighborhood}`}
              type="button"
              className="md-tile-chip"
              onClick={() => onPick?.(n)}
              style={{ cursor: 'pointer' }}
              title={`${n.neighborhood} · ${n.city}`}
            >
              {n.neighborhood} · {n.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
