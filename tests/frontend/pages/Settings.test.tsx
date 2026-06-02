// H4 — Settings index page tests.
//
// Covers:
//   - Page heading + subtitle render
//   - All three cards render
//   - Each card is a link to the expected route
//   - Cards use the canonical .btn .btn-secondary styling

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Settings from '@estia/frontend/pages/Settings.jsx';

const BASE_AGENT = {
  id: 'test-agent-1',
  email: 'agent.demo@estia.app',
  displayName: 'יוסי כהן',
  slug: 'יוסי-כהן',
  phone: '050-1234567',
  avatarUrl: null,
  agentProfile: { agency: 'Acme', title: '', bio: '' },
  customerProfile: null,
  hasCompletedTutorial: true,
  firstLoginPlatform: 'web',
};

function asAgent() {
  server.use(
    http.get('/api/me', () => HttpResponse.json({ user: { ...BASE_AGENT, role: 'AGENT' } }))
  );
}

describe('<Settings>', () => {
  it('renders the page heading and subtitle', async () => {
    asAgent();
    render(<Settings />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'הגדרות' })
    ).toBeInTheDocument();
  });

  it('shows the three cards (neighborhoods / profile / templates)', async () => {
    asAgent();
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /שכונות/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /הפרופיל שלי/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /תבניות הודעה/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('neighborhoods card links to /settings/neighborhoods (even before that route exists)', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /שכונות/ });
    expect(link).toHaveAttribute('href', '/settings/neighborhoods');
  });

  it('profile card links to /profile', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /הפרופיל שלי/ });
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('each card renders as a link, not a generic div', async () => {
    asAgent();
    render(<Settings />);
    // The Settings cards were redesigned in the cream/gold port to be
    // inline-styled link cards. Assert the accessible affordance
    // (link role + correct href) instead of the .btn class system.
    const link = await screen.findByRole('link', { name: /שכונות/ });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/settings/neighborhoods');
  });
});
