import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import VCardQr, { buildVCard } from '@estia/frontend/components/VCardQr.jsx';

const baseAgent = {
  displayName: 'יוסי כהן',
  phone: '050-1234567',
  email: 'yossi@example.com',
  agentProfile: { agency: 'Estia', title: 'סוכן נדלן' },
};

describe('buildVCard()', () => {
  it('emits a vCard 3.0 envelope with FN/TEL/EMAIL/ORG/TITLE', () => {
    const s = buildVCard(baseAgent);
    expect(s.startsWith('BEGIN:VCARD\r\n')).toBe(true);
    expect(s).toContain('VERSION:3.0');
    expect(s).toContain('FN:יוסי כהן');
    expect(s).toContain('ORG:Estia');
    expect(s).toContain('TITLE:סוכן נדלן');
    expect(s).toContain('TEL:050-1234567');
    expect(s).toContain('EMAIL:yossi@example.com');
    expect(s.trim().endsWith('END:VCARD')).toBe(true);
  });

  it('accepts flat agency/title on the agent object (AgentPortal shape)', () => {
    const s = buildVCard({
      displayName: 'Dana',
      phone: '1',
      email: 'd@x.co',
      agency: 'FlatCo',
      title: 'Lead',
    });
    expect(s).toContain('ORG:FlatCo');
    expect(s).toContain('TITLE:Lead');
  });

  it('omits ORG/TITLE lines when missing instead of emitting empty ones', () => {
    const s = buildVCard({ displayName: 'x', phone: '', email: '' });
    expect(s).not.toMatch(/ORG:/);
    expect(s).not.toMatch(/TITLE:/);
    expect(s).not.toMatch(/TEL:/);
    expect(s).not.toMatch(/EMAIL:/);
  });

  it('handles a missing agent without throwing', () => {
    expect(() => buildVCard(null)).not.toThrow();
    expect(buildVCard(null)).toContain('BEGIN:VCARD');
  });
});

describe('<VCardQr>', () => {
  it('renders a QR image pointing at the external generator with encoded vCard data', () => {
    render(<VCardQr agent={baseAgent} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toContain('api.qrserver.com/v1/create-qr-code/');
    expect(img.src).toContain('size=160x160');
    // encoded payload contains the agent name (URLSearchParams encodes
    // spaces as '+'; decode after replacing those back).
    const decoded = decodeURIComponent(img.src.replace(/\+/g, ' '));
    expect(decoded).toContain('FN:יוסי כהן');
  });

  it('alt text includes the agent name so screen readers identify it', () => {
    render(<VCardQr agent={baseAgent} />);
    expect(screen.getByRole('img').getAttribute('alt')).toContain('יוסי כהן');
  });

  it('renders a download anchor labelled "שמור איש קשר"', () => {
    render(<VCardQr agent={baseAgent} />);
    const a = screen.getByTestId('vcard-qr-download') as HTMLAnchorElement;
    expect(a).toHaveAttribute('download');
    expect(a.getAttribute('download')).toMatch(/\.vcf$/);
    expect(a.textContent).toContain('שמור איש קשר');
  });

  it('clicking the download button sets a non-empty href', async () => {
    const user = userEvent.setup();
    render(<VCardQr agent={baseAgent} />);
    const a = screen.getByTestId('vcard-qr-download') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('#');
    await user.click(a);
    const href = a.getAttribute('href') || '';
    // Either a blob: URL (Blob path) or a data:text/vcard fallback.
    expect(/^blob:|^data:text\/vcard/.test(href)).toBe(true);
  });

  it('uses .btn btn-secondary on the download trigger', () => {
    render(<VCardQr agent={baseAgent} />);
    const a = screen.getByTestId('vcard-qr-download');
    expect(a.className).toContain('btn');
    expect(a.className).toContain('btn-secondary');
  });

  it('root is dir="rtl"', () => {
    render(<VCardQr agent={baseAgent} />);
    expect(screen.getByTestId('vcard-qr')).toHaveAttribute('dir', 'rtl');
  });

  it('no axe violations', async () => {
    const { container } = render(<VCardQr agent={baseAgent} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
