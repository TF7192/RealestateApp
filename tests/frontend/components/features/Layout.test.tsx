import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '../../setup/test-utils';
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
});
