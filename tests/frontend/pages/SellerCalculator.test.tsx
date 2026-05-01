import { describe, it, expect } from 'vitest';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import SellerCalculator from '@estia/frontend/pages/SellerCalculator.jsx';

describe('<SellerCalculator>', () => {
  it('renders the header', () => {
    render(<SellerCalculator />);
    // Heading trimmed to plain "מחשבון" in the redesign — the seller
    // context is now carried by the hero label, not the page title.
    expect(screen.getByRole('heading', { name: 'מחשבון' })).toBeInTheDocument();
  });

  it('entering a sale price computes a non-zero net amount in the hero', async () => {
    const user = userEvent.setup();
    render(<SellerCalculator />);
    // Forward-mode price field is labelled simply "מחיר".
    const price = screen.getByLabelText('מחיר');
    await user.type(price, '2500000');
    // The hero label is "הסכום שיישאר לבעלים" in forward mode; under it
    // the formatted net appears. Wait for a number with thousand separator.
    await waitFor(() => {
      const heroRegion = document.querySelector('.sc-hero') || document.body;
      expect(heroRegion.textContent || '').toMatch(/\d,\d{3},\d{3}/);
    });
  });
});
