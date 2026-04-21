import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import PropertyKpiTile from '@estia/frontend/components/PropertyKpiTile.jsx';

describe('<PropertyKpiTile>', () => {
  it('renders value + label + sublabel', () => {
    render(<PropertyKpiTile value="77%" label="שיווק" sublabel="17/22" />);
    expect(screen.getByText('77%')).toBeInTheDocument();
    expect(screen.getByText('שיווק')).toBeInTheDocument();
    expect(screen.getByText('17/22')).toBeInTheDocument();
  });

  it('becomes a <button> when onClick is provided', async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(<PropertyKpiTile value="1" label="x" onClick={() => { clicks += 1; }} />);
    await user.click(screen.getByRole('button'));
    expect(clicks).toBe(1);
  });

  it('renders as a div (non-interactive) when onClick is absent', () => {
    const { container } = render(<PropertyKpiTile value="1" label="x" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('div.pkt')).toBeTruthy();
  });

  it('tone=gold with a non-zero value gets the pkt-ring class', () => {
    const { container } = render(<PropertyKpiTile value="5" label="x" tone="gold" />);
    expect(container.firstChild).toHaveClass('pkt-ring');
  });

  it('tone=gold with zero value does NOT get the ring', () => {
    const { container } = render(<PropertyKpiTile value={0} label="x" tone="gold" />);
    expect(container.firstChild).not.toHaveClass('pkt-ring');
  });

  it('tone=neutral never gets the ring', () => {
    const { container } = render(<PropertyKpiTile value="5" label="x" tone="neutral" />);
    expect(container.firstChild).not.toHaveClass('pkt-ring');
  });

  it('no axe violations — interactive variant', async () => {
    const { container } = render(
      <PropertyKpiTile value="5" label="x" onClick={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
