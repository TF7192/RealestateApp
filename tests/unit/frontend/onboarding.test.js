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
    expect(onb).toMatch(/license:\s*licenseDigits/);
    expect(onb).toMatch(/title:\s*form\.title\s*\|\|\s*null/);
    expect(onb).toMatch(/agency:\s*form\.agency\s*\|\|\s*null/);
    expect(onb).toMatch(/phone:\s*form\.phone\s*\|\|\s*null/);
  });

  it('Onboarding submit refreshes /me then navigates to /dashboard', () => {
    expect(onb).toMatch(/await refresh\(\)/);
    expect(onb).toMatch(/navigate\(['"`]\/dashboard['"`]/);
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
