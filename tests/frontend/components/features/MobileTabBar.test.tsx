// MobileTabBar — bottom nav. The earlier suite expected a "+ add"
// flyout sheet with שortcuts (נכס חדש / מתעניין חדש / עסקאות / לוח בקרה).
// The current MobileTabBar (frontend/src/components/MobileTabBar.jsx)
// is a 4-tab bar (בית · מתעניינים · נכסים · Estia AI) plus an "עוד"
// button that opens a full-screen MoreSheet with the complete nav
// tree, primary + tools + favorites — the simplified add-shortcut
// flyout was retired during the claude.ai/design port. This file
// covers the current surface.

import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import MobileTabBar from '@estia/frontend/components/MobileTabBar.jsx';

describe('<MobileTabBar>', () => {
  it('renders the four quick tabs (בית / מתעניינים / נכסים / Estia AI) + עוד button', () => {
    render(<MobileTabBar />);
    expect(screen.getByRole('navigation', { name: 'ניווט ראשי' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /בית/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /מתעניינים/ })).toHaveAttribute('href', '/customers');
    expect(screen.getByRole('link', { name: /נכסים/ })).toHaveAttribute('href', '/properties');
    expect(screen.getByRole('link', { name: /Estia AI/ })).toHaveAttribute('href', '/ai');
    // "עוד" opens the MoreSheet (full nav tree). aria-label is the
    // single Hebrew word — match it exactly so we don't pick up the
    // sheet's other "עוד"-prefixed labels.
    expect(screen.getByRole('button', { name: 'עוד' })).toBeInTheDocument();
  });

  it('clicking עוד opens the MoreSheet with primary + tools nav', async () => {
    const user = userEvent.setup();
    render(
      <MobileTabBar
        primary={[{ k: 'leads', to: '/customers', label: 'מתעניינים' }]}
        tools={[{ k: 'settings', to: '/settings', label: 'הגדרות' }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'עוד' }));
    // Sheet uses a separate <nav aria-label="ניווט מלא"> region.
    expect(screen.getByRole('dialog', { name: 'ניווט מלא' })).toBeInTheDocument();
    // Both passed-in nav items render as links inside the sheet.
    const sheetLinks = screen.getAllByRole('link');
    expect(sheetLinks.some((a) => a.getAttribute('href') === '/customers')).toBe(true);
    expect(sheetLinks.some((a) => a.getAttribute('href') === '/settings')).toBe(true);
  });

  it('clicking the close button dismisses the MoreSheet', async () => {
    const user = userEvent.setup();
    render(<MobileTabBar />);
    await user.click(screen.getByRole('button', { name: 'עוד' }));
    expect(screen.getByRole('dialog', { name: 'ניווט מלא' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'סגור' }));
    expect(screen.queryByRole('navigation', { name: 'ניווט מלא' })).toBeNull();
  });

  it('no axe violations', async () => {
    const { container } = render(<MobileTabBar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
