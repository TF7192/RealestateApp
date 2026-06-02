// Layout — sidebar shell. The original suite asserted on an even earlier
// nav surface; the current one (post-2026-05-08) renders three section
// labels — עבודה יומיומית / כלים / מועדפים — a "מתעניינים" link to
// /customers (renamed from "מתעניינים" — terminology decision, see
// memory/project_terminology_lead_to_interested.md), a logout button
// labelled "התנתקות", and a "כווץ תפריט" / "הרחב תפריט" collapse toggle.
// The empty-favorites hint is plain Hebrew copy with no testid.

import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup/msw-server';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import Layout from '@estia/frontend/components/Layout.jsx';

describe('<Layout>', () => {
  it('renders the primary navigation links', () => {
    render(<Layout onLogout={() => {}} />);
    // Layout renders both the desktop sidebar and the mobile drawer,
    // so labels match more than once. getAllByRole keeps the assertion
    // robust against layout duplication.
    expect(screen.getAllByRole('link', { name: 'לוח בקרה' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'נכסים' }).length).toBeGreaterThan(0);
    // Customers route is nav-labelled "מתעניינים" (the route stays /customers).
    expect(screen.getAllByRole('link', { name: 'מתעניינים' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'עסקאות' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'בעלים' }).length).toBeGreaterThan(0);
  });

  it('fires onLogout when the התנתקות button is clicked', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<Layout onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: 'התנתקות' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('sidebar-collapse button toggles the stored flag', async () => {
    const user = userEvent.setup();
    render(<Layout onLogout={() => {}} />);
    const collapse = screen.getByRole('button', { name: 'כווץ תפריט' });
    await user.click(collapse);
    // Aria-label flips to "הרחב תפריט" once collapsed = true.
    expect(screen.getByRole('button', { name: 'הרחב תפריט' })).toBeInTheDocument();
    expect(localStorage.getItem('estia-sidebar-collapsed')).toBe('1');
  });

  it('renders the three sidebar section labels: עבודה יומיומית / כלים / מועדפים', () => {
    render(<Layout onLogout={() => {}} />);
    expect(screen.getAllByText('עבודה יומיומית').length).toBeGreaterThan(0);
    expect(screen.getAllByText('כלים').length).toBeGreaterThan(0);
    expect(screen.getAllByText('מועדפים').length).toBeGreaterThan(0);
  });

  it('exposes the major tools-rail entries', () => {
    render(<Layout onLogout={() => {}} />);
    // Tools rail anchors: import / calculator / settings / help.
    for (const label of ['ייבוא', 'מחשבון', 'הגדרות', 'עזרה']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('exposes the major primary-rail entries (reports / reminders / documents)', () => {
    render(<Layout onLogout={() => {}} />);
    expect(screen.getAllByRole('link', { name: 'דוחות' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'תזכורות' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'מסמכים' }).length).toBeGreaterThan(0);
  });

it('shows the empty-favorites hint when the user has no favorites', async () => {
    render(<Layout onLogout={() => {}} />);
    // Hint copy lives directly in the sidebar tree (no testid). Match
    // a stable substring that survives minor copy tweaks.
    await waitFor(() => {
      expect(
        screen.getByText(/סמנו .* במתעניינים, נכסים ובעלים לגישה מהירה/),
      ).toBeInTheDocument();
    });
  });

  it('renders favorited entities in the favorites section', async () => {
    server.use(
      http.get('/api/favorites', () =>
        HttpResponse.json({
          items: [
            {
              entityType: 'PROPERTY',
              entityId: 'p-fav-1',
              createdAt: new Date().toISOString(),
              // The Layout's favorites loader joins with the entity to
              // produce { to, label }. If the API now embeds those
              // fields directly, these are the ones it'd carry.
              to: '/properties/p-fav-1',
              label: 'רוטשילד 12, תל אביב',
            },
          ],
        }),
      ),
      http.get('/api/properties', () =>
        HttpResponse.json({
          items: [
            {
              id: 'p-fav-1',
              street: 'רוטשילד',
              number: '12',
              city: 'תל אביב',
              type: 'APARTMENT',
            },
          ],
        }),
      ),
    );
    render(<Layout onLogout={() => {}} />);
    // Section header appears even when there's nothing favorited; here
    // we additionally expect a link whose label includes "רוטשילד".
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /רוטשילד/ });
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
