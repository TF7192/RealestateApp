import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A-1 — delete account. The front-end half needs to:
//   1) expose a destructive button on the Profile page,
//   2) open a confirmation dialog with role="dialog" + aria-modal="true",
//   3) require the exact phrase "מחק את החשבון שלי" before the
//      destructive CTA activates (guards stray clicks / panic-quits),
//   4) call api.deleteAccount() + logout() on confirmation,
//   5) redirect to the landing with a neutral toast.
// The real DOM render lives under tests/frontend/pages/Profile.test.*
// (can't run from this worktree without hoisted React). We assert the
// load-bearing source plumbing here via the Profile.jsx source text.

const here = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.join(here, '../../../frontend/src/pages/Profile.jsx');
const apiPath = path.join(here, '../../../frontend/src/lib/api.js');
const src = readFileSync(profilePath, 'utf8');
const apiSrc = readFileSync(apiPath, 'utf8');

describe('A-1 — delete account UI scaffolding', () => {
  it('Profile page exposes a "מחק חשבון" destructive button', () => {
    expect(src).toMatch(/מחק חשבון/);
    expect(src).toMatch(/btn-danger/);
  });

  it('confirmation dialog declares role="dialog" + aria-modal="true"', () => {
    expect(src).toMatch(/role=["']dialog["']/);
    expect(src).toMatch(/aria-modal=["']true["']/);
  });

  it('confirmation requires typing the exact phrase "מחק את החשבון שלי"', () => {
    expect(src).toMatch(/CONFIRM_PHRASE\s*=\s*['"`]מחק את החשבון שלי['"`]/);
    // The destructive button is gated on `canConfirm` derived from the phrase.
    expect(src).toMatch(/phrase\.trim\(\)\s*===\s*CONFIRM_PHRASE/);
  });

  it('destructive CTA disables itself until the phrase matches', () => {
    expect(src).toMatch(/disabled=\{[^}]*(!canConfirm|submitting)/);
  });

  it('onConfirmed calls api.deleteAccount, logout, shows toast, and navigates away', () => {
    expect(src).toMatch(/api\.deleteAccount\(\)/);
    expect(src).toMatch(/logout\(\)/);
    expect(src).toMatch(/toast\.info\(['"`]החשבון נמחק['"`]\)/);
    // Full-page nav so residual client state can't leak into the landing.
    expect(src).toMatch(/window\.location\.href\s*=\s*['"`]\/['"`]/);
  });

  it('dialog closes on ESC and on backdrop click', () => {
    expect(src).toMatch(/e\.key\s*===\s*['"`]Escape['"`]/);
    expect(src).toMatch(/e\.target\s*===\s*e\.currentTarget/);
  });

  it('api.js exposes api.deleteAccount posting to /auth/delete-account', () => {
    expect(apiSrc).toMatch(/deleteAccount:\s*\(\)\s*=>\s*request\(['"`]\/auth\/delete-account['"`]/);
  });

  it('cancel button uses the safe secondary style, not destructive', () => {
    // The dialog's Cancel (ביטול) must not be red — it's the safe default.
    const dialogStart = src.indexOf('function DeleteAccountDialog');
    const tail = src.slice(dialogStart);
    // "ביטול" appears near btn-secondary.
    const cancelIdx = tail.indexOf('ביטול');
    expect(cancelIdx).toBeGreaterThan(-1);
    const window200 = tail.slice(Math.max(0, cancelIdx - 200), cancelIdx);
    expect(window200).toMatch(/btn-secondary/);
  });
});
