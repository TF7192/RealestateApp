// MobileMoreSheet — the mobile "..." sheet. Desktop users see these
// entry points in the sidebar; on iPhone they live here so the 5-slot
// bottom tab bar doesn't get crowded.

import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup/msw-server';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import MobileMoreSheet from '@estia/frontend/components/MobileMoreSheet.jsx';

describe('<MobileMoreSheet>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<MobileMoreSheet open={false} onClose={() => {}} />);
    expect(container.textContent || '').not.toMatch(/חיפוש מהיר/);
  });

  it('renders the Sprint 4 + Sprint 1 A2 entry points when open', () => {
    render(<MobileMoreSheet open={true} onClose={() => {}} />);
    // New entries from this commit. Each strong label is unique.
    expect(screen.getByRole('button', { name: /דוחות/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /פעילות/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /תזכורות/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ניהול תגיות/ })).toBeInTheDocument();
  });

  it('does NOT show the Office row for AGENT role', async () => {
    render(<MobileMoreSheet open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /המשרד שלי/ })).toBeNull();
    });
  });

  it('shows the Office row for OWNER role', async () => {
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
    render(<MobileMoreSheet open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /המשרד שלי/ })).toBeInTheDocument();
    });
  });

  it('clicking a new entry closes the sheet', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MobileMoreSheet open={true} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /דוחות/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
