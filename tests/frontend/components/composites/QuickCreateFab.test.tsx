// H2 — QuickCreateFab tests.
//
// Covers:
//   1. Renders a trigger with aria-label "יצירה מהירה" on eligible routes
//   2. Click opens a role="menu" with three menuitems
//   3. Arrow keys move focus; Escape closes; Enter activates (navigation)
//   4. Hidden on /login, /properties/new, /customers/new, /properties/:id
//   5. No axe violations for the open popover
//
// The component uses useLocation/useNavigate from react-router-dom. The
// shared test-utils wraps tests in a MemoryRouter so we just pass
// `route` to render() to pin the pathname.

import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import QuickCreateFab from '@estia/frontend/components/QuickCreateFab.jsx';

describe('<QuickCreateFab>', () => {
  it('renders a floating trigger button with the Hebrew aria-label on the dashboard', () => {
    render(<QuickCreateFab />, { route: '/' });
    expect(screen.getByRole('button', { name: 'יצירה מהירה' })).toBeInTheDocument();
  });

  it('opens a role="menu" popover with two menuitems on click', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    // Portal renders into document.body — getByRole still traverses it.
    const menu = await screen.findByRole('menu', { name: 'יצירה מהירה' });
    expect(menu).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    // F-1 — "עסקה חדשה" shortcut removed. Only property + lead remain.
    expect(items).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: /נכס חדש/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /ליד חדש/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /עסקה חדשה/ })).not.toBeInTheDocument();
  });

  it('aria-expanded flips true when the menu opens', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    const trigger = screen.getByRole('button', { name: 'יצירה מהירה' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('Escape closes the menu', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('ArrowDown advances tabIndex to the next menuitem', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    const menu = await screen.findByRole('menu');
    // First item starts with tabIndex=0 (roving tabindex pattern).
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveAttribute('tabindex', '0'));
    // Fire ArrowDown on the menu — onKeyDown handler rotates focus.
    menu.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(items[1]).toHaveAttribute('tabindex', '0'));
    // F-1 — only 2 items now; ArrowDown wraps back to the first.
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(items[0]).toHaveAttribute('tabindex', '0'));
  });

  it('ArrowUp wraps to the last item from the first', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    const menu = await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveAttribute('tabindex', '0'));
    menu.focus();
    await user.keyboard('{ArrowUp}');
    // F-1 — wrap goes to items[1] (the new last) instead of items[2].
    await waitFor(() => expect(items[1]).toHaveAttribute('tabindex', '0'));
  });

  it('Enter on a menuitem closes the popover (navigates away)', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    await screen.findByRole('menu');
    const first = screen.getAllByRole('menuitem')[0];
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('is hidden on /login', () => {
    render(<QuickCreateFab />, { route: '/login' });
    expect(screen.queryByRole('button', { name: 'יצירה מהירה' })).not.toBeInTheDocument();
  });

  it('is hidden on /properties/new', () => {
    render(<QuickCreateFab />, { route: '/properties/new' });
    expect(screen.queryByRole('button', { name: 'יצירה מהירה' })).not.toBeInTheDocument();
  });

  it('is hidden on /customers/new', () => {
    render(<QuickCreateFab />, { route: '/customers/new' });
    expect(screen.queryByRole('button', { name: 'יצירה מהירה' })).not.toBeInTheDocument();
  });

  it('is hidden on a property detail route (already has a sticky action bar)', () => {
    render(<QuickCreateFab />, { route: '/properties/abc-123' });
    expect(screen.queryByRole('button', { name: 'יצירה מהירה' })).not.toBeInTheDocument();
  });

  it('backdrop click closes the menu', async () => {
    const user = userEvent.setup();
    render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    await screen.findByRole('menu');
    const backdrop = document.querySelector('.qcfab-backdrop');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('no axe violations when the menu is open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<QuickCreateFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'יצירה מהירה' }));
    await screen.findByRole('menu');
    // `region` is disabled because the FAB is designed to be mounted
    // inside the real Layout (which provides the landmarks); testing
    // the component in isolation would fail the landmark rule despite
    // the FAB itself being accessible.
    expect(
      await axe(baseElement, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});
