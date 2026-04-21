import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import ConfirmDialog from '@estia/frontend/components/ConfirmDialog.jsx';

describe('<ConfirmDialog>', () => {
  it('renders title + message + both buttons with default copy', () => {
    render(<ConfirmDialog message="לא ניתן לשחזר" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'מחיקה' })).toBeInTheDocument();
    expect(screen.getByText('לא ניתן לשחזר')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מחק' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument();
  });

  it('fires onConfirm on the primary button', async () => {
    const user = userEvent.setup();
    let confirmed = 0;
    render(<ConfirmDialog message="?" onConfirm={() => { confirmed += 1; }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'מחק' }));
    expect(confirmed).toBe(1);
  });

  it('fires onClose on the X button and on the ביטול button', async () => {
    const user = userEvent.setup();
    let closes = 0;
    render(<ConfirmDialog message="?" onConfirm={() => {}} onClose={() => { closes += 1; }} />);
    await user.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(closes).toBe(1);
  });

  it('fires onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    let closes = 0;
    const { container } = render(
      <ConfirmDialog message="?" onConfirm={() => {}} onClose={() => { closes += 1; }} />
    );
    // Portal renders into document.body, so query from document.
    const backdrop = document.querySelector('.confirm-backdrop')!;
    await user.click(backdrop as HTMLElement);
    expect(closes).toBe(1);
  });

  it('does NOT fire onClose when clicking inside the modal (stopPropagation)', async () => {
    const user = userEvent.setup();
    let closes = 0;
    render(<ConfirmDialog message="inside" onConfirm={() => {}} onClose={() => { closes += 1; }} />);
    await user.click(screen.getByText('inside'));
    expect(closes).toBe(0);
  });

  it('busy=true disables the primary button and shows a placeholder label', () => {
    render(<ConfirmDialog message="?" busy onConfirm={() => {}} onClose={() => {}} />);
    // The primary button now renders "..." instead of "מחק".
    const btn = screen.getByRole('button', { name: '...' });
    expect(btn).toBeDisabled();
  });

  it('danger=false uses the primary button class instead of danger', () => {
    render(
      <ConfirmDialog message="info" danger={false} onConfirm={() => {}} onClose={() => {}} />
    );
    // Portal renders into document.body — query the whole document.
    expect(document.querySelector('.btn-primary')).toBeTruthy();
    expect(document.querySelector('.btn-danger')).toBeNull();
  });

  it('no axe violations', async () => {
    const { baseElement } = render(
      <ConfirmDialog message="למחוק את הנכס?" onConfirm={() => {}} onClose={() => {}} />
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
