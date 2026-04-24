import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Sprint 7 — SearchResults unit test.
//
// Exercises three surfaces:
//   (1) All four buckets (leads / properties / owners / deals) render
//       with their Hebrew labels when `?q=` triggers a populated fetch.
//   (2) Empty-buckets surface their empty-state copy instead of a list.
//   (3) Clicking a row calls navigate() with the bucket's `to()` URL.
//
// We stub `react-router-dom` so this test can live in the
// `unit-frontend` project (which doesn't alias the router package)
// without pulling a real Router context in.

// `vi.hoisted` lifts these declarations above the vi.mock factories
// so the factories can close over the same mutable refs. Without
// hoisting, the factories run before these `const`s are initialized.
const H = vi.hoisted(() => {
  const navCalls = [];
  const qRef = { current: 'dan' };
  const searchRef = { current: async () => ({}) };
  return { navCalls, qRef, searchRef };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => (to) => { H.navCalls.push(to); },
  useSearchParams: () => [
    { get: (k) => (k === 'q' ? H.qRef.current : null) },
    () => {},
  ],
  Link: ({ to, children, ...rest }) =>
    <a href={String(to)} {...rest}>{children}</a>,
}));

vi.mock('../../../frontend/src/lib/api', () => ({
  default: { search: (...a) => H.searchRef.current(...a) },
  api:     { search: (...a) => H.searchRef.current(...a) },
}));

// Dynamic import AFTER mocks are installed so the page picks up the
// mocked modules at first evaluation.
async function importPage() {
  return (await import('../../../frontend/src/pages/SearchResults.jsx')).default;
}

async function mount(SearchResults) {
  let utils;
  await act(async () => { utils = render(<SearchResults />); });
  // Flush the microtask the api.search() promise lands on.
  await act(async () => { await Promise.resolve(); });
  return utils;
}

describe('<SearchResults />', () => {
  beforeEach(() => {
    H.navCalls.length = 0;
    H.qRef.current = 'dan';
    H.searchRef.current = async () => ({});
  });

  it('renders all four bucket section headings', async () => {
    H.searchRef.current = async () => ({
      leads:      [{ id: 'l1', name: 'דני כהן', city: 'תל אביב' }],
      properties: [{ id: 'p1', street: 'דיזנגוף', number: 10, city: 'תל אביב' }],
      owners:     [{ id: 'o1', name: 'רות לוי', phone: '050' }],
      deals:      [{ id: 'd1', title: 'עסקה דיזנגוף' }],
    });

    const SearchResults = await importPage();
    const { container } = await mount(SearchResults);

    expect(container.querySelector('[aria-label="לידים"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="נכסים"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="בעלים"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="עסקאות"]')).toBeTruthy();

    expect(screen.getByText('דני כהן')).toBeTruthy();
    expect(screen.getByText('דיזנגוף 10, תל אביב')).toBeTruthy();
    expect(screen.getByText('רות לוי')).toBeTruthy();
    expect(screen.getByText('עסקה דיזנגוף')).toBeTruthy();
  });

  it('surfaces the empty-state copy for empty buckets', async () => {
    H.searchRef.current = async () => ({
      leads:      [],
      properties: [{ id: 'p1', address: 'רח׳ הרצל', city: 'חיפה' }],
      owners:     [],
      deals:      [],
    });

    const SearchResults = await importPage();
    await mount(SearchResults);

    expect(screen.getByText('לא נמצאו לידים')).toBeTruthy();
    expect(screen.getByText('לא נמצאו בעלים')).toBeTruthy();
    expect(screen.getByText('לא נמצאו עסקאות')).toBeTruthy();
    expect(screen.queryByText('לא נמצאו נכסים')).toBeNull();
  });

  it('row click navigates to the per-bucket detail URL', async () => {
    H.searchRef.current = async () => ({
      leads:      [{ id: 'l-42', name: 'דני' }],
      properties: [{ id: 'p-7', address: 'הרצל 1', city: 'חיפה' }],
      owners:     [],
      deals:      [],
    });

    const SearchResults = await importPage();
    await mount(SearchResults);

    fireEvent.click(screen.getByText('דני'));
    expect(H.navCalls).toContain('/customers?selected=l-42');

    fireEvent.click(screen.getByText('הרצל 1, חיפה'));
    expect(H.navCalls).toContain('/properties/p-7');
  });
});
