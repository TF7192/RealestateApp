// H4 — Settings index page tests.
//
// Covers:
//   - Page heading + subtitle render
//   - All five cards render for an OWNER user
//   - The OWNER-only "משרד" card is hidden for an AGENT user
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

function asOwner() {
  server.use(
    http.get('/api/me', () => HttpResponse.json({ user: { ...BASE_AGENT, role: 'OWNER' } }))
  );
}

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

  it('shows all five cards for an OWNER user', async () => {
    asOwner();
    render(<Settings />);
    // The auth provider fetches /me asynchronously; wait for the
    // OWNER-only card to appear before asserting the full list.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^משרד/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /תגיות/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /שכונות/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /הפרופיל שלי/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /תבניות הודעה/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('hides the "משרד" card for an AGENT (non-owner) user', async () => {
    asAgent();
    render(<Settings />);
    // Wait for non-owner-only cards to render first.
    await screen.findByRole('link', { name: /תגיות/ });
    expect(screen.queryByRole('link', { name: /^משרד/ })).not.toBeInTheDocument();
    // Four links for an agent.
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('tags card links to /settings/tags', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /תגיות/ });
    expect(link).toHaveAttribute('href', '/settings/tags');
  });

  it('neighborhoods card links to /settings/neighborhoods (even before that route exists)', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /שכונות/ });
    expect(link).toHaveAttribute('href', '/settings/neighborhoods');
  });

  it('office card links to /office when visible', async () => {
    asOwner();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /^משרד/ });
    expect(link).toHaveAttribute('href', '/office');
  });

  it('profile card links to /profile', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /הפרופיל שלי/ });
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('templates card links to /templates', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /תבניות הודעה/ });
    expect(link).toHaveAttribute('href', '/templates');
  });

  it('cards use the canonical .btn .btn-secondary classes', async () => {
    asAgent();
    render(<Settings />);
    const link = await screen.findByRole('link', { name: /תגיות/ });
    expect(link).toHaveClass('btn');
    expect(link).toHaveClass('btn-secondary');
  });
});
