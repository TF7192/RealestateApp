import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A-2 — visitors who land on /login?flow=signup (the signup CTAs on the
// marketing landing page send them there) must see a Google shortcut at
// the top of the signup form so they don't have to back out through the
// method chooser to find Google auth.
//
// We assert on the Login.jsx source rather than a component render so
// this suite can run inside the `unit-frontend` project — which doesn't
// need the React bundle to be hoisted into the worktree node_modules.
// The per-component DOM assertions live under tests/frontend/pages/.

const here = path.dirname(fileURLToPath(import.meta.url));
const loginJsxPath = path.join(here, '../../../frontend/src/pages/Login.jsx');
const heAuth = path.join(here, '../../../frontend/src/i18n/locales/he/auth.json');
const src = readFileSync(loginJsxPath, 'utf8');
const auth = JSON.parse(readFileSync(heAuth, 'utf8'));

describe('A-2 — Google button inside the signup form', () => {
  it('exposes a `buttons.googleSignup` translation in Hebrew', () => {
    expect(auth.buttons?.googleSignup).toBeDefined();
    // Imperative masculine singular per the Hebrew style guide.
    expect(auth.buttons.googleSignup).toMatch(/הירשם/);
  });

  it('Login.jsx renders the googleSignup button inside the email-signup branch', () => {
    // Locate the conditional block `flow === 'email-signup' && ( <> … </> )`
    // and check the Google button markup is nested inside it.
    const signupBranchStart = src.indexOf("flow === 'email-signup' && (");
    expect(signupBranchStart, 'email-signup branch exists').toBeGreaterThan(-1);
    const tail = src.slice(signupBranchStart);
    // The button uses t('buttons.googleSignup'); assert both the key and
    // the onClick wiring to the same handler the login-side Google
    // button uses (handleGoogle).
    expect(tail).toMatch(/buttons\.googleSignup/);
    expect(tail).toMatch(/onClick=\{handleGoogle\}/);
  });

  it('Login.jsx still renders the login-side Google button for flow === null', () => {
    // Regression guard — A-2 must not remove the method-chooser Google.
    expect(src).toMatch(/buttons\.google'/);
  });
});
