// Sub-4 / P-* — Property detail polish.
//
// Thin regression tests that codify each P-task so a revert on any
// touched file trips the suite. We read the source as text and assert
// on stable substrings (rather than importing the full component
// tree) because PropertyDetail pulls in a large React+router tree
// that needs an MSW harness to load cleanly, and the happy-dom unit
// lane is intentionally fast.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '../../..');

const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel) => existsSync(path.join(repoRoot, rel));

describe('P-1 — print.css covers detail-page wrappers', () => {
  const css = read('frontend/src/styles/print.css');
  it('includes .property-detail in the overflow-visible list', () => {
    expect(css).toMatch(/\.property-detail/);
  });
  it('includes .pd-agreements (new section from P-3)', () => {
    expect(css).toMatch(/\.pd-agreements/);
  });
  it('keeps .dc-body in the pager-through list', () => {
    expect(css).toMatch(/\.dc-body/);
  });
});

describe('P-2 — ProspectDialog exposes a Print signed form button', () => {
  const src = read('frontend/src/components/ProspectDialog.jsx');
  it('imports Printer from lucide-react', () => {
    expect(src).toMatch(/Printer[^}]*}\s*from\s*'lucide-react'/);
  });
  it('imports printPage from lib/print', () => {
    expect(src).toMatch(/from\s*'\.\.\/lib\/print'/);
  });
  it('renders a "הדפס טופס חתום" button on success', () => {
    expect(src).toMatch(/הדפס טופס חתום/);
  });
  it('calls prospectAgreementUrl to open the PDF', () => {
    expect(src).toMatch(/prospectAgreementUrl/);
  });
});

describe('P-3 — prospect agreement endpoints wired end-to-end', () => {
  it('backend server registers registerProspectPdfRoutes', () => {
    const s = read('backend/src/server.ts');
    expect(s).toMatch(/registerProspectPdfRoutes/);
    expect(s).toMatch(/from '\.\/routes\/prospect-pdf\.js'/);
  });
  it('api client exposes prospectAgreementUrl / linkProspectLead / unlinkProspectLead', () => {
    const api = read('frontend/src/lib/api.js');
    expect(api).toMatch(/prospectAgreementUrl/);
    expect(api).toMatch(/linkProspectLead/);
    expect(api).toMatch(/unlinkProspectLead/);
  });
  it('PropertyAgreementsSection component + css exist', () => {
    expect(exists('frontend/src/components/PropertyAgreementsSection.jsx')).toBe(true);
    expect(exists('frontend/src/components/PropertyAgreementsSection.css')).toBe(true);
  });
  it('PropertyDetail imports and renders the agreements section', () => {
    const pd = read('frontend/src/pages/PropertyDetail.jsx');
    expect(pd).toMatch(/PropertyAgreementsSection/);
    expect(pd).toMatch(/<PropertyAgreementsSection\s+propertyId=\{property\.id\}/);
  });
});

describe('P-4 — delete chip pinned to trailing-top corner', () => {
  const css = read('frontend/src/components/PropertyPhotoManager.css');
  it('declares an absolute override that moves .danger to inset-block-start / inset-inline-end', () => {
    expect(css).toMatch(
      /\.ppm-thumb-overlay\s+\.ppm-action-chip\.danger\s*\{[^}]*position:\s*absolute/
    );
    expect(css).toMatch(/inset-block-start:\s*8px/);
    expect(css).toMatch(/inset-inline-end:\s*8px/);
  });
});

describe('P-5 — photo upload uses a <label> + offscreen input', () => {
  const jsx = read('frontend/src/components/PropertyPhotoManager.jsx');
  const css = read('frontend/src/components/PropertyPhotoManager.css');
  it('switches the dropzone to <label htmlFor="ppm-file-input">', () => {
    expect(jsx).toMatch(/<label[\s\S]*htmlFor="ppm-file-input"/);
  });
  it('input id matches the label', () => {
    expect(jsx).toMatch(/id="ppm-file-input"/);
  });
  it('input uses the ppm-file-input offscreen class (no display:none)', () => {
    expect(jsx).toMatch(/className="ppm-file-input"/);
    expect(css).toMatch(/\.ppm-file-input\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });
});

describe('P-6 — carousel prev/next actually scrolls the strip', () => {
  const src = read('frontend/src/components/PropertyHero.jsx');
  it('imports useEffect (the scroll sync lives in a useEffect)', () => {
    expect(src).toMatch(/import \{ useEffect, useRef \}/);
  });
  it('has a useEffect that reacts to currentImage and calls scrollTo/scrollLeft', () => {
    expect(src).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*stripRef\.current[\s\S]*scrollTo/);
    expect(src).toMatch(/\[currentImage\]/);
  });
  it('wraps prev/next onClick with stopAnd so the slide lightbox does not open', () => {
    expect(src).toMatch(/stopAnd\(onPrev\)/);
    expect(src).toMatch(/stopAnd\(onNext\)/);
  });
});

describe('P-7 — images have width/height + decoding=async + lazy/eager', () => {
  const hero = read('frontend/src/components/PropertyHero.jsx');
  it('PropertyHero slide images have width, height, decoding=async', () => {
    expect(hero).toMatch(/width="1400"/);
    expect(hero).toMatch(/height="800"/);
    expect(hero).toMatch(/decoding="async"/);
  });
  it('first slide uses eager/high priority, others lazy/low', () => {
    expect(hero).toMatch(/loading=\{i === 0 \? 'eager' : 'lazy'\}/);
    expect(hero).toMatch(/fetchpriority=\{i === 0 \? 'high' : 'low'\}/);
  });
});

describe('P-9 — tabs no longer hang on a spinner when props missing', () => {
  it('ActivityPanel.load() drops loading when entityType/entityId missing', () => {
    const src = read('frontend/src/components/ActivityPanel.jsx');
    expect(src).toMatch(/if \(!entityType \|\| !entityId\)\s*\{\s*setLoading\(false\)/);
    expect(src).toMatch(/נסה שוב/); // retry button in error state
  });
  it('RemindersPanel.refresh() drops loading when anchor missing', () => {
    const src = read('frontend/src/components/RemindersPanel.jsx');
    expect(src).toMatch(/if \(!anchor\)\s*\{\s*setLoading\(false\)/);
    expect(src).toMatch(/נסה שוב/);
  });
  it('PropertyDetail passes the correct prop shapes', () => {
    const pd = read('frontend/src/pages/PropertyDetail.jsx');
    expect(pd).toMatch(/<RemindersPanel\s+propertyId=\{property\.id\}/);
    expect(pd).toMatch(/<ActivityPanel\s+entityType="PROPERTY"\s+entityId=\{property\.id\}/);
  });
});

describe('P-10 — internal "J4-J7" labels stripped from UI copy', () => {
  const src = read('frontend/src/pages/NewProperty.jsx');
  it('does not render the string "J4–J7" or "J4-J7" inside an h3 title', () => {
    expect(src).not.toMatch(/form-section-title">פרטים נוספים \(J[4567][–-]J[4567]\)/);
    // The section header is still called "פרטים נוספים" — without the code.
    expect(src).toMatch(/form-section-title">פרטים נוספים</);
  });
});

describe('P-11 — "מצב נכס" duplicate removed from פרטים נוספים', () => {
  const src = read('frontend/src/pages/NewProperty.jsx');
  it('drops the id="np-condition" select', () => {
    expect(src).not.toMatch(/id="np-condition"/);
  });
  it('does not render a "מצב נכס" label inside the פרטים-נוספים section', () => {
    // The earlier "מצב" (renovated) control stays; only "מצב נכס" should go.
    expect(src).not.toMatch(/form-label" htmlFor="np-condition">מצב נכס/);
  });
});

describe('P-12 — "תאריך סיום בלעדיות" removed from צנרת תיווך', () => {
  const src = read('frontend/src/components/PropertyPipelineBlock.jsx');
  it('does not render the id="ppb-excl" input', () => {
    expect(src).not.toMatch(/id="ppb-excl"/);
  });
  it('does not render a "תאריך סיום בלעדיות" label', () => {
    expect(src).not.toMatch(/htmlFor="ppb-excl">תאריך סיום בלעדיות/);
  });
});

describe('P-13 — DateQuickChips guards against scroll-to-top', () => {
  const src = read('frontend/src/components/MobilePickers.jsx');
  it('chip onClick preventDefault + stopPropagation', () => {
    expect(src).toMatch(/e\.preventDefault\(\);/);
    expect(src).toMatch(/e\.stopPropagation\(\);/);
  });
});

describe('P-14 — market-context error banner has a retry', () => {
  const src = read('frontend/src/components/MarketContextCard.jsx');
  it('renders a "נסה שוב" button inside market-error', () => {
    expect(src).toMatch(/market-error[\s\S]*נסה שוב/);
  });
});

describe('P-15 — tag chips paint via --tag-color custom property', () => {
  const src = read('frontend/src/components/TagPicker.jsx');
  it('chipStyle returns { "--tag-color": color } so the N-5 CSS tints', () => {
    expect(src).toMatch(/'--tag-color':\s*color/);
  });
});
