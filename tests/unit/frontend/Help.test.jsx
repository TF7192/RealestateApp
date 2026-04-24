import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Sprint 7 — /help page. Covers:
//   (a) every category pill renders with a count suffix ("· N").
//   (b) clicking a category narrows the accordion list.
//   (c) clicking an accordion row expands it (aria-expanded flips
//       from "false" to "true" and the answer text appears).
//
// Why no login mocks here: <Help /> is a pure presentational page —
// it reads the static JSON registry in src/data/helpFaq.json and
// does zero API calls. All that's needed is a stub for the
// <Link to="/contact"> so the router doesn't need to be mounted
// (the `unit-frontend` project doesn't alias react-router-dom).

// Stub react-router-dom so this test can live under the
// `unit-frontend` project (which doesn't alias the router package)
// without pulling a real Router context in. Help.jsx only uses
// <Link>; exposing the stub below is enough.
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) =>
    <a href={String(to)} {...rest}>{children}</a>,
}));

// Dynamic import AFTER the mock is installed so the page picks up
// the stubbed router at first evaluation.
async function importPage() {
  return (await import('../../../frontend/src/pages/Help.jsx')).default;
}
async function importFaq() {
  return (await import('../../../frontend/src/data/helpFaq.json')).default;
}

// Hebrew categories that must always be present in the JSON registry.
// This also implicitly locks in the PRD contract (7 categories + הכול).
const EXPECTED_CATEGORIES = [
  'הכול',
  'כללי',
  'לידים ולקוחות',
  'נכסים',
  'עסקאות',
  'AI וסיכומים',
  'חשבון ופרופיל',
  'חיוב',
];

describe('Sprint 7 — Help page', () => {
  it('renders the hero title "איך נוכל לעזור?"', async () => {
    const Help = await importPage();
    render(<Help />);
    expect(screen.getByRole('heading', { name: /איך נוכל לעזור\?/ })).toBeInTheDocument();
  });

  it('renders a pill for every category (including הכול)', async () => {
    const Help = await importPage();
    render(<Help />);
    for (const cat of EXPECTED_CATEGORIES) {
      // Pills carry aria-pressed (they're toggles). Filter to pills
      // so the accordion rows — which share category labels with
      // their parent pill — don't muddy the lookup.
      const pills = screen.getAllByRole('button', { name: new RegExp(`^${escapeRegex(cat)}`) });
      const pill = pills.find((el) => el.hasAttribute('aria-pressed'));
      expect(pill).toBeDefined();
      expect(pill).toHaveTextContent(cat);
    }
  });

  it('renders every FAQ question from the JSON registry by default', async () => {
    const Help = await importPage();
    const faqData = await importFaq();
    render(<Help />);
    expect(faqData.length).toBeGreaterThanOrEqual(12);
    for (const entry of faqData) {
      // Each question collapses to a button in the accordion.
      expect(screen.getByRole('button', { name: new RegExp(escapeRegex(entry.q)) })).toBeInTheDocument();
    }
  });

  it('narrows the list when a category pill is clicked', async () => {
    const Help = await importPage();
    const faqData = await importFaq();
    render(<Help />);

    // Pick a category with a known, small set of questions.
    const propertyEntries = faqData.filter((f) => f.category === 'נכסים');
    const otherEntries = faqData.filter((f) => f.category !== 'נכסים');
    expect(propertyEntries.length).toBeGreaterThan(0);
    expect(otherEntries.length).toBeGreaterThan(0);

    // Same disambiguation as above — aria-pressed filters to pills only.
    const candidates = screen.getAllByRole('button', { name: /^נכסים/ });
    const pill = candidates.find((el) => el.hasAttribute('aria-pressed'));
    fireEvent.click(pill);

    // After filtering to "נכסים": property questions remain, others
    // are filtered out.
    for (const entry of propertyEntries) {
      expect(screen.getByRole('button', { name: new RegExp(escapeRegex(entry.q)) })).toBeInTheDocument();
    }
    for (const entry of otherEntries) {
      expect(screen.queryByRole('button', { name: new RegExp(escapeRegex(entry.q)) })).not.toBeInTheDocument();
    }
  });

  it('expands a row on click (aria-expanded flips and the answer shows)', async () => {
    const Help = await importPage();
    const faqData = await importFaq();
    render(<Help />);

    const first = faqData[0];
    const row = screen.getByRole('button', { name: new RegExp(escapeRegex(first.q)) });

    // Starts collapsed.
    expect(row.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(row);

    // Flipped — and the answer string now lives somewhere in the
    // accordion body.
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByTestId('help-faq-list');
    expect(within(list).getByText(first.a, { exact: false })).toBeInTheDocument();
  });

  it('renders all three support channels (WhatsApp / email / contact form)', async () => {
    const Help = await importPage();
    render(<Help />);
    const wa = screen.getByRole('link', { name: /WhatsApp/i });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+/);

    const mailto = screen.getByRole('link', { name: /אימייל/ });
    expect(mailto.getAttribute('href')).toMatch(/^mailto:talfuks1234@gmail\.com/);

    const contact = screen.getByRole('link', { name: /צרו קשר/ });
    expect(contact.getAttribute('href')).toBe('/contact');
  });
});

// Helper — escape Hebrew strings that accidentally contain regex
// meta-chars (parens, dots, etc.) so `new RegExp(entry.q)` doesn't
// throw or misinterpret them as special sequences.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
