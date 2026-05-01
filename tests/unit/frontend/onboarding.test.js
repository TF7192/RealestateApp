import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A-4 — first-login onboarding. Gate fires when `profileCompletedAt`
// is null on the authed /me response. The form collects:
//   - license   (required, 6–8 digits, numeric only)
//   - title     (optional dropdown)
//   - agency    (optional text)
//   - phone     (optional, normalized via lib/phone on submit)
// Onboarding submit → api.submitOnboarding → server stamps
// profileCompletedAt and the SPA route guard releases the user.

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, '../../../frontend/src/App.jsx');
const onboardingPath = path.join(here, '../../../frontend/src/pages/Onboarding.jsx');
const apiPath = path.join(here, '../../../frontend/src/lib/api.js');

const app = readFileSync(appPath, 'utf8');
const onb = readFileSync(onboardingPath, 'utf8');
const api = readFileSync(apiPath, 'utf8');

describe('A-4 — onboarding page + route guard', () => {
  it('API client exposes submitOnboarding → POST /me/profile', () => {
    expect(api).toMatch(/submitOnboarding:\s*\(body\)\s*=>\s*request\(['"`]\/me\/profile['"`],\s*\{\s*method:\s*['"`]POST['"`]/);
  });

  it('Onboarding page validates license as 6–8 digits', () => {
    // Pin the regex and the Hebrew error copy.
    expect(onb).toMatch(/\/\^\\d\{6,8\}\$\//);
    expect(onb).toMatch(/מספר רישיון חייב להיות 6 עד 8 ספרות/);
  });

  it('Onboarding submit call includes license + optional title/agency/phone', () => {
    expect(onb).toMatch(/api\.submitOnboarding\(/);
    // The page no longer pre-extracts a `licenseDigits` local; the
    // digit-strip is chained inline. Title is derived from a switch
    // (office → 'סוכן', agency → 'מנהל משרד', else 'סוכן עצמאי')
    // rather than passed through directly. agency / phone use
    // .trim() to drop whitespace before the `|| null` fallback.
    expect(onb).toMatch(/license:\s*form\.license\.replace\(\/\\D\/g,/);
    expect(onb).toMatch(/title:\s*titleLabel/);
    expect(onb).toMatch(/agency:\s*form\.agency\.trim\(\)\s*\|\|\s*null/);
    expect(onb).toMatch(/phone:\s*form\.phone\.trim\(\)\s*\|\|\s*null/);
  });

  it('Onboarding submit settles via location.assign(destination)', () => {
    // refresh() + navigate() racing against the App.jsx onboarding
    // gate caused every card to bounce to /dashboard prematurely
    // (frontend/src/pages/Onboarding.jsx:148-155). The page now uses
    // setExiting(true) for a brief fade, then a hard window.location
    // .assign(destination) so the new page mounts after the
    // submission has settled. Assert that path instead.
    expect(onb).toMatch(/setExiting\(true\)/);
    expect(onb).toMatch(/window\.location\.assign\(destination\)/);
  });

  it('App.jsx route guard redirects authed agents without profileCompletedAt to /onboarding', () => {
    // Must consider (a) the user object carries profileCompletedAt
    expect(app).toMatch(/profileCompletedAt/);
    // (b) path other than /onboarding gets a <Navigate> back
    expect(app).toMatch(/pathname\s*!==\s*['"`]\/onboarding['"`]/);
    expect(app).toMatch(/Navigate to=\{?["'`]\/onboarding["'`]/);
    // (c) the guard scope is AGENT/OWNER (customers bypass)
    expect(app).toMatch(/user\.role\s*===\s*['"`]AGENT['"`]/);
  });

  it('App.jsx exposes an /onboarding route for already-onboarded agents so they bounce to /dashboard', () => {
    expect(app).toMatch(/path=["'`]\/onboarding["'`]/);
  });

  it('license input is numeric-only (strips non-digits + caps at 8)', () => {
    expect(onb).toMatch(/\.replace\(\/\\D\/g,\s*['"`]['"`]\)\.slice\(0,\s*8\)/);
  });

  it('RTL + dir="rtl" set on the onboarding page root', () => {
    expect(onb).toMatch(/dir=["']rtl["']/);
  });
});
