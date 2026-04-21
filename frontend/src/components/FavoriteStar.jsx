import { useState } from 'react';
import { Star } from 'lucide-react';
import './FavoriteStar.css';

// Sprint 7 / MLS parity — Task B4. Reusable star-toggle for any entity
// (lead, property, owner, …). The parent owns the active state and
// provides onToggle(nextActive); the component is presentational so
// the same instance works equally well on a card, a row, a header.
//
// Why a button (not an input/checkbox):
// - We want the full pressed/unpressed a11y semantics via aria-pressed.
// - A checkbox would carry a <label> that competes with the parent
//   card's own click target on mobile (customer row tap → detail page).
//
// The component stops click propagation — favoriting a card should
// never also navigate the card's link. Hosts that actually want the
// bubble can wrap the star in a non-clickable span.
export default function FavoriteStar({
  active = false,
  onToggle,
  size = 16,
  className = '',
  labelActive = 'הסר ממועדפים',
  labelInactive = 'הוסף למועדפים',
}) {
  const [busy, setBusy] = useState(false);
  const label = active ? labelActive : labelInactive;

  const handleClick = async (e) => {
    // Stop the click from bubbling to the row/card click handler.
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      // Pass the next desired state so the caller can mirror its own
      // optimistic update without recomputing `!active` in every host.
      await onToggle?.(!active);
    } catch {
      // Errors are the host's responsibility — we surface them via the
      // toast system there, not from this primitive.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`fav-star ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={handleClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-busy={busy || undefined}
    >
      <Star
        size={size}
        strokeWidth={active ? 2 : 1.75}
        aria-hidden="true"
        fill={active ? 'currentColor' : 'none'}
      />
    </button>
  );
}
