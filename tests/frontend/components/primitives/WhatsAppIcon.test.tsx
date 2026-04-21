import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render } from '../../setup/test-utils';
import WhatsAppIcon from '@estia/frontend/components/WhatsAppIcon.jsx';

describe('<WhatsAppIcon>', () => {
  it('renders an SVG', () => {
    const { container } = render(<WhatsAppIcon />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('honours the size prop (width + height)', () => {
    const { container } = render(<WhatsAppIcon size={24} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('no axe violations', async () => {
    const { container } = render(<WhatsAppIcon aria-label="WhatsApp" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
