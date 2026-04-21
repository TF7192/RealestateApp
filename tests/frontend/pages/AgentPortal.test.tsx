import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import AgentPortal from '@estia/frontend/pages/AgentPortal.jsx';

const AGENT = {
  id: 'agent-1',
  displayName: 'יוסי כהן',
  slug: 'yossi',
  phone: '050-1234567',
  email: 'yossi@example.com',
  avatarUrl: null,
  agency: 'Estia',
  title: 'סוכן נדלן',
  bio: '',
};

describe('<AgentPortal>', () => {
  it('renders the VCardQr component in the hero once the agent loads', async () => {
    server.use(
      http.get('/api/public/agents/:slug', () =>
        HttpResponse.json({ agent: AGENT, properties: [] }),
      ),
    );
    render(<AgentPortal />, {
      route: '/agents/yossi',
      path: '/agents/:agentSlug',
    });

    // Wait for the agent hero to render (proves fetch resolved).
    expect(await screen.findByRole('heading', { name: AGENT.displayName })).toBeInTheDocument();
    // VCardQr mounted in the hero slot.
    expect(screen.getByTestId('vcard-qr')).toBeInTheDocument();
    expect(screen.getByTestId('vcard-qr-download')).toHaveTextContent('שמור איש קשר');

    // The QR image encodes the agent's vCard payload.
    const img = screen.getByAltText(/יוסי כהן/) as HTMLImageElement;
    expect(img.src).toContain('api.qrserver.com');
    const decoded = decodeURIComponent(img.src.replace(/\+/g, ' '));
    expect(decoded).toContain('FN:יוסי כהן');
    expect(decoded).toContain('TEL:050-1234567');
  });

  it('does not mount VCardQr while loading (agent not yet hydrated)', async () => {
    server.use(
      // Never resolve so the loading state persists.
      http.get('/api/public/agents/:slug', () => new Promise(() => {})),
    );
    render(<AgentPortal />, {
      route: '/agents/yossi',
      path: '/agents/:agentSlug',
    });
    await waitFor(() => {
      expect(screen.queryByTestId('vcard-qr')).not.toBeInTheDocument();
    });
  });
});
