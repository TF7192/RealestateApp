import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen } from '../../setup/test-utils';
import StickyActionBar from '@estia/frontend/components/StickyActionBar.jsx';

describe('<StickyActionBar>', () => {
  it('renders children inside the inner wrapper', () => {
    render(<StickyActionBar><button>Save</button></StickyActionBar>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('adds sab-visible class when visible=true (default)', () => {
    const { container } = render(<StickyActionBar><button>x</button></StickyActionBar>);
    expect(container.firstChild).toHaveClass('sab-visible');
  });

  it('drops sab-visible when visible=false', () => {
    const { container } = render(<StickyActionBar visible={false}><button>x</button></StickyActionBar>);
    expect(container.firstChild).not.toHaveClass('sab-visible');
  });

  it('no axe violations', async () => {
    const { container } = render(
      <StickyActionBar>
        <button type="button" aria-label="save">save</button>
      </StickyActionBar>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
