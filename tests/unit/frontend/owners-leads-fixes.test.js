import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Sub-5 — source-level assertions for the Owners + Leads punch-list.
// These are deliberately regex-based rather than full component mounts
// so they run fast in CI and don't depend on the worktree having
// `posthog-js` installed (see pre-existing api.test.js failure).

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) =>
  readFileSync(path.join(here, '../../..', rel), 'utf8');

describe('O-3 — OwnerPicker close button has explicit styling', () => {
  const css = read('frontend/src/components/OwnerPicker.css');
  it('.owner-picker-close has explicit size + background + color', () => {
    const block = css.match(/\.owner-picker-close\s*\{[^}]*\}/);
    expect(block, '.owner-picker-close rule exists').not.toBeNull();
    expect(block[0]).toMatch(/width:\s*32px/);
    expect(block[0]).toMatch(/height:\s*32px/);
    // Explicit background + color so it doesn't rely on .btn-ghost
    expect(block[0]).toMatch(/background:/);
    expect(block[0]).toMatch(/color:/);
  });
  it('.owner-picker-close has a :focus-visible rule (a11y)', () => {
    expect(css).toMatch(/\.owner-picker-close:focus-visible\s*\{/);
  });
});

describe('O-7 — owner phone display uses formatPhone', () => {
  it('Owners.jsx imports formatPhone', () => {
    const src = read('frontend/src/pages/Owners.jsx');
    expect(src).toMatch(/from ['"]\.\.\/lib\/phone['"]/);
    expect(src).toMatch(/formatPhone\(o\.phone\)/);
  });
  it('OwnerPicker.jsx imports formatPhone', () => {
    const src = read('frontend/src/components/OwnerPicker.jsx');
    expect(src).toMatch(/from ['"]\.\.\/lib\/phone['"]/);
    expect(src).toMatch(/formatPhone\(o\.phone\)/);
  });
  it('OwnerDetail.jsx imports formatPhone', () => {
    const src = read('frontend/src/pages/OwnerDetail.jsx');
    expect(src).toMatch(/from ['"]\.\.\/lib\/phone['"]/);
  });
});

describe('O-9 — OwnerDetail WhatsApp buttons are <a target="_blank">', () => {
  const src = read('frontend/src/pages/OwnerDetail.jsx');
  it('uses waUrl + target="_blank" + rel="noopener noreferrer" for the WhatsApp button', () => {
    // Count <a ...target="_blank"...>שלח בוואטסאפ</a> occurrences.
    const matches = src.match(/target="_blank"[\s\S]{0,200}?שלח בוואטסאפ/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // No bare button onClick opening whatsapp in desktop toolbar.
    expect(src).not.toMatch(
      /onClick=\{[^}]*openWhatsApp[^}]*\}[\s\S]{0,120}?שלח בוואטסאפ/,
    );
  });
});

describe('L-2 / L-3 — Customers page <button> elements all carry type="button"', () => {
  const src = read('frontend/src/pages/Customers.jsx');
  it('every <button> declares type= one way or another', () => {
    // Enumerate all <button ...> opens and verify each has type= in its attr list.
    const openings = src.match(/<button\b[^>]*>/g) || [];
    for (const opening of openings) {
      expect(opening).toMatch(/type=/);
    }
  });
});

describe('L-4 — duplicate firstName/lastName removed from NewLead "פרטים מורחבים"', () => {
  const src = read('frontend/src/pages/NewLead.jsx');
  it('no k1-first / k1-last inputs present', () => {
    expect(src).not.toMatch(/id="k1-first"/);
    expect(src).not.toMatch(/id="k1-last"/);
  });
});

describe('L-8 — "הוסף תיאור קצר" single-line description input is gone', () => {
  const src = read('frontend/src/pages/NewLead.jsx');
  it('k1-desc input is absent from the rendered tree', () => {
    expect(src).not.toMatch(/id="k1-desc"/);
  });
});

describe('L-10 — LeadMeetingDialog surfaces a helpful message on 404', () => {
  const src = read('frontend/src/components/LeadMeetingDialog.jsx');
  it('branches on e.status===404 or /not found/i and shows Hebrew copy', () => {
    expect(src).toMatch(/e\?\.status === 404/);
    expect(src).toMatch(/not\\?s\*found/i);
    expect(src).toMatch(/רענן את הדף/);
  });
});

describe('L-11 — meeting-dialog notes textarea is dir="rtl" with Hebrew font', () => {
  it('JSX textarea uses dir="rtl" + lang="he"', () => {
    const src = read('frontend/src/components/LeadMeetingDialog.jsx');
    expect(src).toMatch(/dir="rtl"[\s\S]{0,60}lang="he"/);
  });
  it('inline DT styles force RTL textAlign + unicodeBidi plaintext on the notes textarea', () => {
    // Sprint 3 port: CSS file replaced with inline DT styles; the
    // RTL-override now lives on the textarea's style prop.
    const src = read('frontend/src/components/LeadMeetingDialog.jsx');
    expect(src).toMatch(/textAlign:\s*['"]right['"]/);
    expect(src).toMatch(/unicodeBidi:\s*['"]plaintext['"]/);
    expect(src).toMatch(/Assistant, Heebo/);
  });
});

describe('L-13 — edit payload guards invalid email + non-integer budget', () => {
  for (const rel of [
    'frontend/src/components/CustomerEditDialog.jsx',
    'frontend/src/pages/CustomerDetail.jsx',
  ]) {
    it(`${rel} coerces email + budget before submit`, () => {
      const src = read(rel);
      expect(src).toMatch(/isLikelyEmail/);
      expect(src).toMatch(/Math\.round\(Number\(form\.budget\)\)/);
    });
  }
});

describe('L-9 — right-column panels exit loading when their anchor prop is missing', () => {
  it('MatchingList drops out of loading when neither leadId nor propertyId is passed', () => {
    const src = read('frontend/src/components/MatchingList.jsx');
    expect(src).toMatch(/if \(!direction\)\s*\{[\s\S]*setLoading\(false\)/);
  });
  it('MatchingList surfaces an inline "נסה שוב" retry button on error', () => {
    const src = read('frontend/src/components/MatchingList.jsx');
    expect(src).toMatch(/onClick=\{load\}[\s\S]{0,120}?נסה שוב/);
  });
  it('TagPicker exits loading when entityId is missing', () => {
    const src = read('frontend/src/components/TagPicker.jsx');
    expect(src).toMatch(/if \(!entityId\)\s*\{[\s\S]*setLoading\(false\)/);
  });
});

describe('L-A — Customers page renders the shared AdvancedFilters with lead-specific extras', () => {
  const src = read('frontend/src/pages/Customers.jsx');
  it('imports AdvancedFilters from the shared component', () => {
    expect(src).toMatch(/import AdvancedFilters from ['"]\.\.\/components\/AdvancedFilters['"]/);
  });
  it('passes a `fields` config that includes city / price / rooms', () => {
    expect(src).toMatch(/fields:\s*\[\s*['"]city['"],\s*['"]price['"],\s*['"]rooms['"]\s*\]/);
  });
  it('extras slot exposes lead-specific selects (seriousness, status, looking-for)', () => {
    expect(src).toMatch(/רצינות/);
    expect(src).toMatch(/סטטוס לקוח/);
    expect(src).toMatch(/מחפש/);
  });
});
