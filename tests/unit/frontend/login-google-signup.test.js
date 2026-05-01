import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A-2 — visitors who land on /login (signup or login mode) must have a
// one-tap Google shortcut so they don't have to navigate around the
// method chooser to find it.
//
// PERF-004 (commit 789538f, 2026-04-25) ripped out react-i18next and
// inlined every Hebrew string into the JSX. The prior suite asserted
// against `frontend/src/i18n/locales/he/auth.json`; that file no
// longer exists. This rewrite reads the inline copy directly.
//
// We assert on the Login.jsx source rather than a component render so
// this suite stays in the `unit-frontend` project (no React hoisting
// dance). Per-component DOM assertions live under
// tests/frontend/pages/.

const here = path.dirname(fileURLToPath(import.meta.url));
const loginJsxPath = path.join(here, '../../../frontend/src/pages/Login.jsx');
const src = readFileSync(loginJsxPath, 'utf8');

describe('A-2 — Google button on the login + signup surfaces', () => {
  it('Login.jsx defines a `handleGoogle` handler', () => {
    expect(src).toMatch(/const handleGoogle\s*=\s*async\s*\(\s*\)\s*=>/);
  });

  it('renders a "המשך עם Google" CTA wired to handleGoogle', () => {
    // Inline Hebrew copy + onClick={handleGoogle} on the same button.
    expect(src).toMatch(/המשך עם Google/);
    expect(src).toMatch(/onClick=\{handleGoogle\}/);
  });

  it('the Google button appears on both the desktop and mobile layouts', () => {
    // Login.jsx hands handleGoogle to MobileLogin and DesktopLogin
    // via prop spread; both layouts render the GhostBtn instance.
    const matches = src.match(/onClick=\{handleGoogle\}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
