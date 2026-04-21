import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import Chip from '@estia/frontend/components/Chip.jsx';

describe('<Chip>', () => {
  it('renders children as text', () => {
    render(<Chip>חם</Chip>);
    expect(screen.getByText('חם')).toBeInTheDocument();
  });

  it('becomes a <button> when onClick is provided; <span> otherwise', () => {
    const { rerender, container } = render(<Chip>static</Chip>);
    expect(container.querySelector('span.chip')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();

    rerender(<Chip onClick={() => {}}>clickable</Chip>);
    expect(container.querySelector('button.chip')).toBeTruthy();
    expect(container.querySelector('button')).toHaveAttribute('type', 'button');
  });

  it('fires onClick handler', async () => {
    let clicks = 0;
    const user = userEvent.setup();
    render(<Chip onClick={() => { clicks += 1; }}>tap</Chip>);
    await user.click(screen.getByRole('button', { name: /tap/ }));
    expect(clicks).toBe(1);
  });

  it.each(['neutral', 'gold', 'info', 'success', 'warning', 'danger', 'hot', 'warm', 'cold', 'buy', 'rent'])(
    'carries the tone-%s class',
    (tone) => {
      const { container } = render(<Chip tone={tone as any}>x</Chip>);
      expect(container.firstChild).toHaveClass(`chip-${tone}`);
    }
  );

  it.each(['sm', 'md'])('carries the size-%s class', (size) => {
    const { container } = render(<Chip size={size as any}>x</Chip>);
    expect(container.firstChild).toHaveClass(`chip-${size}`);
  });

  it('appends a user-supplied className', () => {
    const { container } = render(<Chip className="extra">x</Chip>);
    expect(container.firstChild).toHaveClass('extra');
  });

  it('honours `title` for tooltip', () => {
    render(<Chip title="status tooltip">ok</Chip>);
    expect(screen.getByText('ok').parentElement).toHaveAttribute('title', 'status tooltip');
  });

  it('no axe violations (clickable variant)', async () => {
    const { container } = render(<Chip onClick={() => {}}>click me</Chip>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('no axe violations (static variant)', async () => {
    const { container } = render(<Chip>status</Chip>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
