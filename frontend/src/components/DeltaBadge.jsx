// DeltaBadge — small pill that shows a rolling KPI change, e.g.
// "+3 השבוע" or "−2 החודש". Used on the Dashboard next to each stat
// card so an agent sees not just the current total but how it moved
// over the last window.
//
// Contract:
//   <DeltaBadge value={3} label="השבוע" />              → green "+3 השבוע"
//   <DeltaBadge value={-2} label="החודש" />             → red "−2 החודש"
//   <DeltaBadge value={0} label="השבוע" />              → gray "0 השבוע"
//   <DeltaBadge value={3} label="x" direction="neutral" → overrides sign
//
// Accessibility:
//   - role="status" so VoiceOver announces changes when the value
//     updates after a period switch.
//   - An sr-only sentence ("גידול של 3 לעומת השבוע הקודם") explains
//     what the sign means; the visible pill shows just the signed
//     number to keep the KPI row compact.
import './DeltaBadge.css';

function directionFromValue(v) {
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'neutral';
}

// Visual minus uses U+2212 (Unicode minus) instead of ASCII "-", which
// is thinner and visually noisy next to a digit in Hebrew display fonts.
function formatSigned(v) {
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return '0';
}

function srSentence(v, label) {
  // label is already a period word like "השבוע" / "החודש" / "הרבעון".
  // The sentence reads as "גידול של 3 לעומת השבוע הקודם", which is how
  // native Hebrew speakers phrase comparative deltas.
  const periodPrev = label
    .replace(/^ה/, 'ה') // noop — keeps the definite article
    .replace(/השבוע/, 'השבוע הקודם')
    .replace(/החודש/, 'החודש הקודם')
    .replace(/הרבעון/, 'הרבעון הקודם');
  if (v > 0) return `גידול של ${v} לעומת ${periodPrev}`;
  if (v < 0) return `ירידה של ${Math.abs(v)} לעומת ${periodPrev}`;
  return `ללא שינוי לעומת ${periodPrev}`;
}

export default function DeltaBadge({ value, label, direction }) {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  const dir = direction || directionFromValue(num);
  const visible = formatSigned(num);
  const sr = srSentence(num, label);

  return (
    <span
      className={`delta-badge delta-${dir}`}
      role="status"
      dir="rtl"
    >
      <span className="delta-num" aria-hidden="true">{visible}</span>
      <span className="delta-label" aria-hidden="true">{label}</span>
      <span className="sr-only">{sr}</span>
    </span>
  );
}
