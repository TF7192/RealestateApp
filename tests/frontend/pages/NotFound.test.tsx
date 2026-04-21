import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen } from '../setup/test-utils';
import NotFound from '@estia/frontend/pages/NotFound.jsx';

describe('<NotFound>', () => {
  it('shows the 404 code + Hebrew heading', () => {
    render(<NotFound />, { route: '/no-such-page' });
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'הדף לא נמצא' })).toBeInTheDocument();
  });

  it('surfaces the failing pathname inside a <code>', () => {
    render(<NotFound />, { route: '/foo/bar' });
    expect(screen.getByText('/foo/bar')).toBeInTheDocument();
  });

  it('renders the home + properties escape-hatch links', () => {
    render(<NotFound />, { route: '/x' });
    expect(screen.getByRole('link', { name: /חזור לדשבורד/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /לרשימת הנכסים/ })).toHaveAttribute('href', '/properties');
  });

  it('no axe violations', async () => {
    const { container } = render(<NotFound />, { route: '/x' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
