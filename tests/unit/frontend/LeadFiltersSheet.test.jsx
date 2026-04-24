// Sprint 7 — LeadFiltersSheet mobile filter sheet. Unit coverage:
//   (1) Every section heading renders when `open` is true.
//   (2) Toggling a segmented pill updates local draft without firing
//       onApply until the "החל סינון" button is pressed.
//   (3) onApply is called with the full filter object shape.
//   (4) Close button fires onClose.
//   (5) The `values` prop seeds the draft so the current-pill shows as
//       selected (aria-checked) on open.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

import LeadFiltersSheet from '../../../frontend/src/components/LeadFiltersSheet.jsx';

beforeEach(() => {
  // The sheet toggles document.body.style.overflow while open. Reset
  // between tests to keep side-effects bounded.
  document.body.style.overflow = '';
});

function openSheet(extraProps = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <LeadFiltersSheet
      open
      values={{ status: 'all' }}
      cities={['תל אביב', 'חיפה', 'באר שבע']}
      onApply={onApply}
      onClose={onClose}
      {...extraProps}
    />
  );
  return { ...utils, onApply, onClose };
}

describe('<LeadFiltersSheet />', () => {
  it('returns null when open=false (no dialog in the tree)', () => {
    render(
      <LeadFiltersSheet
        open={false}
        values={{ status: 'all' }}
        onApply={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the header and every section when open=true', () => {
    openSheet();
    const dialog = screen.getByRole('dialog', { name: 'סינון לידים' });
    expect(dialog).toBeTruthy();

    // Header
    expect(within(dialog).getByRole('heading', { name: 'סינון לידים' })).toBeTruthy();

    // Each section heading is an <h4> with the section's label.
    for (const title of ['סטטוס', 'מה מחפש', 'אופי נכס', 'עיר', 'תקציב', 'חדרים']) {
      expect(within(dialog).getByRole('heading', { level: 4, name: title })).toBeTruthy();
    }
  });

  it('renders the status/lookingFor/interestType radiogroups', () => {
    openSheet();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('radiogroup', { name: 'סטטוס ליד' })).toBeTruthy();
    expect(within(dialog).getByRole('radiogroup', { name: 'סוג עסקה' })).toBeTruthy();
    expect(within(dialog).getByRole('radiogroup', { name: 'סוג נכס' })).toBeTruthy();
  });

  it('seeds draft from the `values` prop (current pill is aria-checked)', () => {
    openSheet({ values: { status: 'hot', lookingFor: 'BUY', interestType: 'PRIVATE' } });
    const statusGroup = screen.getByRole('radiogroup', { name: 'סטטוס ליד' });
    const hotPill = within(statusGroup).getByRole('radio', { name: 'חמים' });
    expect(hotPill.getAttribute('aria-checked')).toBe('true');

    const lookingGroup = screen.getByRole('radiogroup', { name: 'סוג עסקה' });
    const buyPill = within(lookingGroup).getByRole('radio', { name: 'קנייה' });
    expect(buyPill.getAttribute('aria-checked')).toBe('true');

    const interestGroup = screen.getByRole('radiogroup', { name: 'סוג נכס' });
    const privPill = within(interestGroup).getByRole('radio', { name: 'פרטי' });
    expect(privPill.getAttribute('aria-checked')).toBe('true');
  });

  it('toggling a segmented pill updates state WITHOUT firing onApply', () => {
    const { onApply } = openSheet();
    const statusGroup = screen.getByRole('radiogroup', { name: 'סטטוס ליד' });
    const warmPill = within(statusGroup).getByRole('radio', { name: 'פושרים' });

    // Before click: the "all" pill is the checked one.
    expect(within(statusGroup).getByRole('radio', { name: 'הכול' }).getAttribute('aria-checked')).toBe('true');
    expect(warmPill.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(warmPill);

    // After click: warm is now checked, all is not. onApply stays quiet.
    expect(warmPill.getAttribute('aria-checked')).toBe('true');
    expect(within(statusGroup).getByRole('radio', { name: 'הכול' }).getAttribute('aria-checked')).toBe('false');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('apply button calls onApply with the filter object and onClose', () => {
    const { onApply, onClose } = openSheet();

    // Pick HOT + BUY + a city.
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'סטטוס ליד' })).getByRole('radio', { name: 'חמים' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'סוג עסקה' })).getByRole('radio', { name: 'קנייה' }));
    fireEvent.change(screen.getByLabelText('עיר'), { target: { value: 'חיפה' } });

    fireEvent.click(screen.getByRole('button', { name: 'החל סינון' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg.status).toBe('hot');
    expect(arg.lookingFor).toBe('BUY');
    expect(arg.city).toBe('חיפה');
    // Unset dimensions are serialised as their defaults (null / '').
    expect(arg.minBudget).toBeNull();
    expect(arg.maxBudget).toBeNull();
    expect(arg.minRooms).toBeNull();
    expect(arg.maxRooms).toBeNull();
    expect(arg.interestType).toBe('');

    // Applying also closes the sheet.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button fires onClose (and does NOT fire onApply)', () => {
    const { onApply, onClose } = openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('"נקה" resets the draft to the empty shape', () => {
    openSheet({ values: { status: 'hot', lookingFor: 'BUY', city: 'חיפה' } });

    // Pre-condition — hot is checked, buy is checked.
    const statusGroup = screen.getByRole('radiogroup', { name: 'סטטוס ליד' });
    expect(within(statusGroup).getByRole('radio', { name: 'חמים' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'נקה' }));

    // After clear — all is the checked status pill, city input is empty.
    expect(within(statusGroup).getByRole('radio', { name: 'הכול' }).getAttribute('aria-checked')).toBe('true');
    expect(within(statusGroup).getByRole('radio', { name: 'חמים' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByLabelText('עיר').value).toBe('');
  });
});
