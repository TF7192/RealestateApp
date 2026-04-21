import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup/msw-server';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import Layout from '@estia/frontend/components/Layout.jsx';

describe('<Layout>', () => {
  it('renders the sidebar navigation links', () => {
    render(<Layout onLogout={() => {}} />);
    // At least one link per route; Layout renders both the desktop
    // sidebar AND the mobile drawer so some labels match twice.
    expect(screen.getAllByRole('link', { name: 'לוח בקרה' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'נכסים' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'לקוחות' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'עסקאות' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'תבניות הודעה' }).length).toBeGreaterThan(0);
  });

  it('fires onLogout when the יציאה button is clicked', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<Layout onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: /יציאה/ }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('sidebar-collapse button toggles the stored flag', async () => {
    const user = userEvent.setup();
    render(<Layout onLogout={() => {}} />);
    const collapse = screen.getByRole('button', { name: /כווץ סרגל/ });
    await user.click(collapse);
    // After click, the label flips to "הרחב" because collapsed = true.
    expect(screen.getByRole('button', { name: /הרחב סרגל/ })).toBeInTheDocument();
    expect(localStorage.getItem('estia-sidebar-collapsed')).toBe('1');
  });

  // ─── Sprint 4 + Sprint 1 A2 sidebar entries ─────────────────────────
  it('renders the "כלי ניהול" nav group with reports / activity / reminders / tag-settings links', () => {
    render(<Layout onLogout={() => {}} />);
    // Group label visible at least once (desktop sidebar).
    expect(screen.getAllByText('כלי ניהול').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /דוחות/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /פעילות/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /תזכורות/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /תגיות/ }).length).toBeGreaterThan(0);
  });

  it('does NOT render the Office link for AGENT role', async () => {
    render(<Layout onLogout={() => {}} />);
    // Wait a tick so any async /api/me has had a chance to settle; the
    // demo user in the default MSW handlers is role=AGENT.
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /משרד/ })).toBeNull();
    });
  });

  it('renders the Office link for OWNER role', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          user: {
            id: 'test-owner-1',
            email: 'owner@estia.app',
            role: 'OWNER',
            displayName: 'בעל משרד',
            agentProfile: { agency: 'Acme', title: '', bio: '' },
          },
        })
      )
    );
    render(<Layout onLogout={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /משרד/ }).length).toBeGreaterThan(0);
    });
  });

  // ─── Sprint 7 B4 favorites strip ────────────────────────────────────
  it('renders the favorites strip when the user has favorited entities', async () => {
    server.use(
      http.get('/api/favorites', () =>
        HttpResponse.json({
          items: [
            { entityType: 'PROPERTY', entityId: 'p-fav-1', createdAt: new Date().toISOString() },
          ],
        })
      ),
      http.get('/api/properties', () =>
        HttpResponse.json({
          items: [
            { id: 'p-fav-1', street: 'רוטשילד', number: '12', city: 'תל אביב', type: 'APARTMENT' },
          ],
        })
      )
    );
    render(<Layout onLogout={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText('המועדפים').length).toBeGreaterThan(0);
    });
    // The favorite should link to its detail page
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /רוטשילד/ });
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it('hides the favorites strip entirely when the list is empty', async () => {
    // The default MSW handler returns an empty items list — no "המועדפים"
    // label should appear. We wait a tick so the fetch has had its turn.
    render(<Layout onLogout={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByText('המועדפים')).toBeNull();
    });
  });
});
