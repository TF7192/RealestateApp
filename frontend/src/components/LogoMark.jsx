// LogoMark — shared brand tile matching the claude.ai/design bundle's
// LogoMark recipe (estia-new-project/project/src/shared.jsx, lines 4-22).
// A rounded-square tile containing the "◆" glyph:
//   tone="gold" → gold gradient tile on dark/brown surfaces,  ink ◆
//   tone="ink"  → ink gradient tile on cream/white surfaces, gold ◆
//
// Tokens are inlined so the component works inside any tree — no
// reliance on CSS custom properties. Keep this in sync with the
// bundle if the gradient stops ever change.
//
// Usage:
//   <LogoMark />                     // 32px, tone="gold"
//   <LogoMark size={44} tone="ink"/> // 44px tile, ink bg, gold diamond
//
// Deliberately a single <div> — the glyph is decorative. If the mark
// stands alone (no wordmark beside it) give the parent an aria-label.

export default function LogoMark({ size = 32, tone = 'gold' }) {
  const isGold = tone === 'gold';
  const bg = isGold
    ? 'linear-gradient(135deg, #d9b774 0%, #8a6932 100%)'
    : 'linear-gradient(135deg, #1e1a14 0%, #3a3226 100%)';
  const color = isGold ? '#1e1a14' : '#d9b774';
  const shadow = isGold
    ? '0 4px 16px rgba(180,139,76,0.35), inset 0 1px 0 rgba(255,255,255,0.3)'
    : '0 4px 16px rgba(0,0,0,0.25)';
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.52,
        fontWeight: 700,
        letterSpacing: -1,
        boxShadow: shadow,
        flexShrink: 0,
        // Keep the glyph metrics stable across devices — fallback chain
        // covers browsers without the ◆ in their default font.
        fontFamily: '"Apple Color Emoji", "Segoe UI Symbol", sans-serif',
        lineHeight: 1,
      }}
    >
      ◆
    </div>
  );
}
