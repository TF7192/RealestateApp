// Sprint 7 / ShareDialog — universal channel-picker dialog. Verifies
// that every channel button renders and that the deep-link builders
// generate the expected hrefs for fixture props.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

// Mock the toast provider so `useToast()` returns a no-op shape
// without requiring a provider in the test tree.
vi.mock('../../../frontend/src/lib/toast.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// Mock analytics so `track(...)` is a no-op inside unit tests.
vi.mock('../../../frontend/src/lib/analytics.js', () => ({
  track: vi.fn(),
}));

// Mock native/share so we don't pull in Capacitor during unit tests.
vi.mock('../../../frontend/src/native/share.js', () => ({
  shareSheet: vi.fn(),
  openWhatsApp: vi.fn(),
}));

// Force the web branch (isNative=false, isIOS=false) so
// navigator.share behavior is the sole gate for the OS share button.
vi.mock('../../../frontend/src/native/platform.js', () => ({
  isNative: () => false,
  isIOS: () => false,
  isAndroid: () => false,
  isWeb: () => true,
  shouldUseMobileUI: () => false,
}));

import ShareDialog, {
  buildWaHref,
  buildSmsHref,
  buildMailtoHref,
} from '../../../frontend/src/components/ShareDialog.jsx';

describe('ShareDialog — deep-link builders', () => {
  it('buildWaHref normalizes an Israeli phone and URL-encodes the message', () => {
    const href = buildWaHref('050-123-4567', 'שלום\nnet');
    expect(href.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    expect(href).toContain('%D7%A9%D7%9C%D7%95%D7%9D'); // "שלום"
    expect(href).toContain('%0A');                      // newline
  });

  it('buildWaHref without a phone uses the recipient-less wa.me form', () => {
    const href = buildWaHref('', 'hello');
    expect(href).toBe('https://wa.me/?text=hello');
  });

  it('buildSmsHref emits an sms: scheme with a `?&body=` param', () => {
    const href = buildSmsHref('0501234567', 'hi');
    expect(href.startsWith('sms:')).toBe(true);
    expect(href).toContain('?&body=hi');
    expect(href).toContain('0501234567');
  });

  it('buildSmsHref with no phone still builds a valid href', () => {
    expect(buildSmsHref('', 'hi')).toBe('sms:?&body=hi');
  });

  it('buildMailtoHref URL-encodes subject + body', () => {
    const href = buildMailtoHref('a@b.com', 'subj', 'body line\n2');
    expect(href.startsWith('mailto:a@b.com?')).toBe(true);
    expect(href).toContain('subject=subj');
    expect(href).toContain('body=body%20line%0A2');
  });

  it('buildMailtoHref with no recipient yields an empty-to mailto', () => {
    expect(buildMailtoHref('', 'subj', 'body')).toBe(
      'mailto:?subject=subj&body=body'
    );
  });
});

describe('ShareDialog — rendering', () => {
  beforeEach(() => {
    // navigator.share must be undefined for the OS share button to be
    // hidden (simulating a browser without the API).
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      delete navigator.share;
    }
  });

  const propertyEntity = {
    property: {
      id: 'p-1',
      type: 'דירה',
      street: 'רוטשילד 45',
      city: 'תל אביב',
      rooms: 3,
      sqm: 85,
      marketingPrice: 3200000,
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
    },
    agent: { displayName: 'יוסי כהן', phone: '0501234567' },
    templates: [],
    // Explicit URL so the dialog doesn't depend on window.location.origin.
    url: 'https://estia.co.il/p/p-1',
    message: 'שלום — נכס נהדר',
  };

  it('renders the WhatsApp / SMS / Email / Copy buttons for a property share', () => {
    render(<ShareDialog kind="property" entity={propertyEntity} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Each channel button carries a stable data-channel attribute we can
    // assert on without being coupled to the Hebrew copy inside the label.
    expect(dialog.querySelector('[data-channel="whatsapp"]')).toBeTruthy();
    expect(dialog.querySelector('[data-channel="sms"]')).toBeTruthy();
    expect(dialog.querySelector('[data-channel="email"]')).toBeTruthy();
    expect(dialog.querySelector('[data-channel="copy"]')).toBeTruthy();
    // No navigator.share → no system button on web-fallback.
    expect(dialog.querySelector('[data-channel="system"]')).toBeFalsy();
  });

  it('shows the system-share button when navigator.share exists', () => {
    // Polyfill a synchronous navigator.share — the button's presence is
    // gated only on the existence of the function.
    // Using Object.defineProperty because some runtimes mark it readonly.
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
      writable: true,
    });
    render(<ShareDialog kind="property" entity={propertyEntity} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-channel="system"]')).toBeTruthy();
    delete navigator.share;
  });

  it('pre-fills the message textarea from the entity', () => {
    render(<ShareDialog kind="property" entity={propertyEntity} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const textarea = within(dialog).getByRole('textbox', { name: /הודעה/ });
    expect(textarea.value).toContain('שלום — נכס נהדר');
  });

  it('renders the URL preview with the share link when provided', () => {
    render(<ShareDialog kind="property" entity={propertyEntity} onClose={() => {}} />);
    expect(screen.getByText('https://estia.co.il/p/p-1')).toBeInTheDocument();
  });

  it('uses the correct header label per kind', () => {
    const { unmount } = render(
      <ShareDialog kind="catalog" entity={{ url: 'https://x/', agentName: 'א' }} onClose={() => {}} />
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('קטלוג');
    unmount();

    render(
      <ShareDialog kind="contract" entity={{ contract: { id: 'c-1', type: 'OFFER' }, url: 'https://x/c' }} onClose={() => {}} />
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('חוזה');
  });

  it('builds a catalog-share message from the agentName fallback', () => {
    render(
      <ShareDialog
        kind="catalog"
        entity={{ url: 'https://estia.co.il/agents/yossi', agentName: 'יוסי' }}
        onClose={() => {}}
      />
    );
    const textarea = screen.getByRole('textbox', { name: /הודעה/ });
    expect(textarea.value).toContain('יוסי');
    expect(textarea.value).toContain('https://estia.co.il/agents/yossi');
  });
});
