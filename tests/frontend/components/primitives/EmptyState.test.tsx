import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import EmptyState from '@estia/frontend/components/EmptyState.jsx';
import { Building2 } from 'lucide-react';

describe('<EmptyState>', () => {
  it('renders title, description, and icon', () => {
    render(<EmptyState title="אין נכסים" description="הוסף את הראשון" icon={<Building2 data-testid="ic" />} />);
    expect(screen.getByText('אין נכסים')).toBeInTheDocument();
    expect(screen.getByText('הוסף את הראשון')).toBeInTheDocument();
    expect(screen.getByTestId('ic')).toBeInTheDocument();
  });

  it('renders role="status" so screen readers announce the empty state', () => {
    const { container } = render(<EmptyState title="x" />);
    // ToastProvider (present via the shared test-utils wrapper) also
    // uses role="status" for toasts; scope to our component's subtree.
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('variant=first vs filtered maps to the corresponding class', () => {
    const { container, rerender } = render(<EmptyState title="x" variant="first" />);
    expect(container.firstChild).toHaveClass('es-first');
    rerender(<EmptyState title="x" variant="filtered" />);
    expect(container.firstChild).toHaveClass('es-filtered');
  });

  it('fires action.onClick + secondary.onClick independently', async () => {
    const user = userEvent.setup();
    let primary = 0, secondary = 0;
    render(
      <EmptyState
        title="x"
        action={{ label: 'Primary', onClick: () => { primary += 1; } }}
        secondary={{ label: 'Secondary', onClick: () => { secondary += 1; } }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Primary' }));
    await user.click(screen.getByRole('button', { name: 'Secondary' }));
    expect(primary).toBe(1);
    expect(secondary).toBe(1);
  });

  it('action.ariaLabel overrides the button label for screen readers', () => {
    render(
      <EmptyState
        title="x"
        action={{ label: 'short', ariaLabel: 'detailed description', onClick: () => {} }}
      />
    );
    expect(screen.getByRole('button', { name: 'detailed description' })).toBeInTheDocument();
  });

  it('does not render the actions row when no action / secondary', () => {
    const { container } = render(<EmptyState title="x" />);
    expect(container.querySelector('.es-actions')).toBeNull();
  });

  it('dir="rtl" is set on the root', () => {
    const { container } = render(<EmptyState title="x" />);
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
  });

  it('no axe violations — empty', async () => {
    const { container } = render(<EmptyState title="x" description="y" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('no axe violations — with actions', async () => {
    const { container } = render(
      <EmptyState title="x" action={{ label: 'add', onClick: () => {} }} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
