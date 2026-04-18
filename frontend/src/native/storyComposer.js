// StoryComposer — build a 1080×1920 image from a property cover photo
// and a Hebrew caption. Used for Instagram Story shares (and reusable by
// any future "render a story" feature).
//
// Design choices:
//   - Cover photo fills the full 1080×1920 as a blurred/darkened backdrop
//   - A centered rounded card sits over the middle third with the caption
//   - Hebrew text drawn right-aligned using canvas textAlign:'right' (the
//     browser's direction property is unreliable for manually wrapped text)
//   - Word-wrap is done by us, splitting on spaces/newlines and walking
//     the measured width, so the caption always fits inside the card
//
// Returns a Blob (PNG) the caller can share, upload, or save.

const WIDTH = 1080;
const HEIGHT = 1920;
const CARD_MARGIN_X = 80;
const CARD_INNER_PAD_X = 56;
const CARD_INNER_PAD_Y = 48;
const CARD_RADIUS = 40;
const TEXT_COLOR = '#1e1a14';
const TEXT_COLOR_SECONDARY = '#8a7a5c';
const GOLD = '#c9a96e';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    // Resolve relative URLs against current origin
    const src = url?.startsWith('/') ? window.location.origin + url : url;
    img.src = src;
  });
}

// Simple greedy Hebrew-friendly wrapper.
// Splits explicit newlines first, then spaces within each line.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text || '').split(/\r?\n/)) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let current = '';
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

/**
 * Compose a story image.
 *
 * @param {object} opts
 * @param {string} opts.coverUrl  — URL (or relative path) of the hero image
 * @param {string} opts.caption   — main Hebrew text that sits in the card
 * @param {string} [opts.footer]  — small line under the caption (e.g. agent name)
 * @param {string} [opts.badge]   — single-line chip over the card (e.g. "למכירה")
 * @returns {Promise<Blob>} PNG blob, ready for Share.share / upload / saveAs.
 */
export async function composeStoryImage({ coverUrl, caption, footer, badge } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // ── 1. Backdrop: cover photo, object-fit: cover + dark gradient ──
  if (coverUrl) {
    try {
      const img = await loadImage(coverUrl);
      const ratio = Math.max(WIDTH / img.width, HEIGHT / img.height);
      const dw = img.width  * ratio;
      const dh = img.height * ratio;
      const dx = (WIDTH  - dw) / 2;
      const dy = (HEIGHT - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);

      // Vignette + darken so the caption card reads clearly
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0,   'rgba(0,0,0,0.35)');
      gradient.addColorStop(0.5, 'rgba(0,0,0,0.15)');
      gradient.addColorStop(1,   'rgba(0,0,0,0.55)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } catch {
      // Fallback — warm paper tone
      ctx.fillStyle = '#1a1409';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  } else {
    ctx.fillStyle = '#1a1409';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // ── 2. Caption card (centered, ~60% height) ──
  const cardX = CARD_MARGIN_X;
  const cardW = WIDTH - 2 * CARD_MARGIN_X;

  // Measure caption at a base size; if it overflows, step the font down
  const TITLE_MAX = 66;
  const TITLE_MIN = 40;
  let fontSize = TITLE_MAX;
  let lines = [];
  let lineHeight = 0;
  for (; fontSize >= TITLE_MIN; fontSize -= 4) {
    ctx.font = `800 ${fontSize}px "Frank Ruhl Libre", "Heebo", system-ui, sans-serif`;
    lineHeight = Math.round(fontSize * 1.35);
    lines = wrapText(ctx, caption || '', cardW - 2 * CARD_INNER_PAD_X);
    if (lines.length <= 9) break;
  }

  const footerFont = `600 30px "Heebo", "Frank Ruhl Libre", system-ui, sans-serif`;
  const badgeFont  = `800 28px "Heebo", system-ui, sans-serif`;
  const hasFooter  = !!footer;
  const hasBadge   = !!badge;

  const badgeH = hasBadge ? 68 : 0;
  const badgeGap = hasBadge ? 28 : 0;
  const footerH = hasFooter ? 50 : 0;
  const footerGap = hasFooter ? 28 : 0;
  const cardContentH = badgeH + badgeGap + lines.length * lineHeight + footerGap + footerH;
  const cardH = cardContentH + 2 * CARD_INNER_PAD_Y;
  const cardY = Math.round((HEIGHT - cardH) / 2);

  // Soft shadow behind the card
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = 'rgba(255, 250, 244, 0.98)';
  roundedRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS);
  ctx.fill();
  ctx.restore();

  // Gold hairline border
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  roundedRect(ctx, cardX + 12, cardY + 12, cardW - 24, cardH - 24, CARD_RADIUS - 10);
  ctx.stroke();

  // ── 3. Content: badge + caption + footer (all RTL, right-aligned) ──
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const rightX = cardX + cardW - CARD_INNER_PAD_X;
  let y = cardY + CARD_INNER_PAD_Y;

  if (hasBadge) {
    // Badge pill: gold fill, body font, auto-width
    ctx.font = badgeFont;
    const metrics = ctx.measureText(badge);
    const pillW = metrics.width + 40;
    const pillH = badgeH;
    const pillX = rightX - pillW;
    const pillY = y;
    ctx.fillStyle = GOLD;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = '#1a1409';
    ctx.fillText(badge, rightX - 20, pillY + (pillH - 28) / 2 + 4);
    y += badgeH + badgeGap;
  }

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `800 ${fontSize}px "Frank Ruhl Libre", "Heebo", system-ui, sans-serif`;
  for (const line of lines) {
    ctx.fillText(line, rightX, y);
    y += lineHeight;
  }

  if (hasFooter) {
    y += footerGap;
    ctx.fillStyle = TEXT_COLOR_SECONDARY;
    ctx.font = footerFont;
    ctx.fillText(footer, rightX, y);
  }

  // ── 4. Estia watermark at the bottom (subtle brand cue) ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 32px "Frank Ruhl Libre", system-ui, sans-serif';
  ctx.fillText('◆ Estia', WIDTH / 2, HEIGHT - 80);

  // ── 5. Serialize ──
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('toBlob returned null')),
      'image/png',
      0.95
    );
  });
}
