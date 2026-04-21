import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import MobileTabBar from '@estia/frontend/components/MobileTabBar.jsx';

describe('<MobileTabBar>', () => {
  it('renders the five bottom tabs (properties / customers / +add / owners / calculator)', () => {
    render(<MobileTabBar />);
    expect(screen.getByRole('navigation', { name: 'ניווט ראשי' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /נכסים/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /לקוחות/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /בעלים/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /מחשבון/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /תפריט הוספה/ })).toBeInTheDocument();
  });

  it('clicking + opens the add-sheet with four shortcuts', async () => {
    const user = userEvent.setup();
    render(<MobileTabBar />);
    await user.click(screen.getByRole('button', { name: /תפריט הוספה/ }));
    expect(screen.getByRole('heading', { name: /מה לעשות/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /נכס חדש/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ליד חדש/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /עסקאות/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /דשבורד/ })).toBeInTheDocument();
  });

  it('clicking the backdrop or "ביטול" closes the sheet', async () => {
    const user = userEvent.setup();
    render(<MobileTabBar />);
    await user.click(screen.getByRole('button', { name: /תפריט הוספה/ }));
    await user.click(screen.getByRole('button', { name: /ביטול/ }));
    expect(screen.queryByRole('heading', { name: /מה לעשות/ })).toBeNull();
  });

  it('no axe violations', async () => {
    const { container } = render(<MobileTabBar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
