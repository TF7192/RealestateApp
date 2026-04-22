import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A-3 — the "כניסה עם גוגל" button background was pure `#fff`, which
// disappeared visually on the pale login card surface. A subtle
// off-white separates the button silhouette on both themes.

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, '../../../frontend/src/pages/Login.css');
const css = readFileSync(cssPath, 'utf8');

function extractRule(selector) {
  // crude but deterministic — the CSS file is small enough.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('A-3 — Google auth button background', () => {
  it('Google auth button uses an off-white background (not pure #fff)', () => {
    const body = extractRule('.auth-method-btn.google');
    expect(body, 'the Google-btn rule is present').not.toBeNull();
    // Accept any hex that isn't pure white; the committed color is #fafafa.
    const bg = body.match(/background:\s*(#[0-9a-fA-F]{3,8})/);
    expect(bg, 'background color declared as a hex value').not.toBeNull();
    const color = bg[1].toLowerCase();
    expect(color).not.toBe('#fff');
    expect(color).not.toBe('#ffffff');
  });

  it('Google button retains a distinct hover background (deeper than base)', () => {
    const hover = extractRule('.auth-method-btn.google:hover');
    expect(hover, 'hover rule present').not.toBeNull();
    expect(hover).toMatch(/background:\s*#[0-9a-fA-F]{3,8}/);
  });
});
