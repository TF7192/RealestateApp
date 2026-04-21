import { describe, it, expect } from 'vitest';
import { render } from '../../setup/test-utils';
import Portal from '@estia/frontend/components/Portal.jsx';

describe('<Portal>', () => {
  it('mounts children in document.body by default', () => {
    render(<Portal><div data-testid="portalled">hello</div></Portal>);
    const found = document.body.querySelector('[data-testid="portalled"]');
    expect(found).toBeTruthy();
  });

  it('mounts children in an explicit target when provided', () => {
    const target = document.createElement('section');
    target.id = 'custom-target';
    document.body.appendChild(target);
    render(<Portal target={target}><div data-testid="custom">hi</div></Portal>);
    expect(target.querySelector('[data-testid="custom"]')).toBeTruthy();
  });
});
