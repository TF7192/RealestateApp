// Font-family stack lookup for per-section font overrides.
//
// Each named enum value maps to a CSS font-family string. Fonts
// that aren't in the bundled-or-self-hosted set are pulled from
// Google Fonts on demand — `ensureFont(name)` injects a stylesheet
// link the first time a font is needed and caches the result so a
// landing page with the same font on 4 sections still only ships
// one <link>.

const STACKS = {
  DEFAULT:          null, // inherit global
  HEEBO:            "'Heebo', 'Assistant', system-ui, sans-serif",
  RUBIK:            "'Rubik', 'Assistant', system-ui, sans-serif",
  ASSISTANT:        "'Assistant', system-ui, sans-serif",
  FRANK_RUHL_LIBRE: "'Frank Ruhl Libre', 'Playfair Display', Georgia, serif",
  PLAYFAIR_DISPLAY: "'Playfair Display', Georgia, serif",
  NOTO_SERIF_HEBREW:"'Noto Serif Hebrew', Georgia, serif",
  SYSTEM_SANS:      'system-ui, -apple-system, "Segoe UI", sans-serif',
  SYSTEM_SERIF:     'Georgia, "Times New Roman", serif',
};

// Google Fonts URL fragments — only set for fonts that aren't
// already in the bundled woff2 set (Assistant) or are pure system
// stacks. Subset to Hebrew + Latin so the file size stays small.
const GFONT_FAMILIES = {
  HEEBO:            'Heebo:wght@400;500;700',
  RUBIK:            'Rubik:wght@400;500;700',
  FRANK_RUHL_LIBRE: 'Frank+Ruhl+Libre:wght@400;500;700',
  PLAYFAIR_DISPLAY: 'Playfair+Display:wght@400;500;700',
  NOTO_SERIF_HEBREW:'Noto+Serif+Hebrew:wght@400;500;700',
};

export const FONT_OPTIONS = [
  { value: 'DEFAULT',          label: 'ברירת מחדל' },
  { value: 'HEEBO',            label: 'Heebo' },
  { value: 'ASSISTANT',        label: 'Assistant' },
  { value: 'RUBIK',            label: 'Rubik' },
  { value: 'FRANK_RUHL_LIBRE', label: 'Frank Ruhl Libre' },
  { value: 'PLAYFAIR_DISPLAY', label: 'Playfair Display' },
  { value: 'NOTO_SERIF_HEBREW',label: 'Noto Serif Hebrew' },
  { value: 'SYSTEM_SANS',      label: 'מערכת — sans' },
  { value: 'SYSTEM_SERIF',     label: 'מערכת — serif' },
];

export function fontStack(name) {
  if (!name) return null;
  return STACKS[name] || null;
}

const injected = new Set();

export function ensureFont(name) {
  if (typeof document === 'undefined') return;
  if (!name || injected.has(name)) return;
  const family = GFONT_FAMILIES[name];
  if (!family) {
    // System or bundled — nothing to load.
    injected.add(name);
    return;
  }
  // Add a preconnect once (cheap idempotent — browsers de-dupe).
  if (!document.querySelector('link[data-est-gfont-preconnect]')) {
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.gstatic.com';
    pre.crossOrigin = 'anonymous';
    pre.setAttribute('data-est-gfont-preconnect', '1');
    document.head.appendChild(pre);
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap&subset=hebrew,latin`;
  link.setAttribute('data-est-gfont', name);
  document.head.appendChild(link);
  injected.add(name);
}
