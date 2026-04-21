import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import './VCardQr.css';

// F5 — vCard QR primitive for the public agent portal.
//
// Renders a QR code (via api.qrserver.com, external image — no new deps)
// that encodes a vCard 3.0 contact card for the agent, plus a
// "שמור איש קשר" button that triggers a client-side download of the
// same vCard as a .vcf file.
//
// Shape expected:
//   agent = { displayName, phone, email, agentProfile?: { agency, title } }
// AgentPortal uses flat `title` / `agency` fields on the agent object —
// both shapes are accepted.

// vCard 3.0 spec says line endings should be CRLF.
const CRLF = '\r\n';

export function buildVCard(agent) {
  const name = agent?.displayName || '';
  const phone = agent?.phone || '';
  const email = agent?.email || '';
  const agency = agent?.agentProfile?.agency || agent?.agency || '';
  const title = agent?.agentProfile?.title || agent?.title || '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`];
  if (agency) lines.push(`ORG:${agency}`);
  if (title)  lines.push(`TITLE:${title}`);
  if (phone)  lines.push(`TEL:${phone}`);
  if (email)  lines.push(`EMAIL:${email}`);
  lines.push('END:VCARD');
  return lines.join(CRLF) + CRLF;
}

export default function VCardQr({ agent, size = 160 }) {
  const vcard = useMemo(() => buildVCard(agent), [agent]);
  const qrSrc = useMemo(() => {
    const base = 'https://api.qrserver.com/v1/create-qr-code/';
    const params = new URLSearchParams({
      size: `${size}x${size}`,
      data: vcard,
    });
    return `${base}?${params.toString()}`;
  }, [vcard, size]);

  // Object URL created lazily on click so tests that never click don't
  // spawn a blob in happy-dom.
  const [href, setHref] = useState('');

  const onClick = () => {
    try {
      const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setHref(url);
      // Revoke a tick later so the download has time to start.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      // No Blob in the environment — fall back to a data: URL.
      setHref(`data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`);
    }
  };

  const filename = `${(agent?.displayName || 'contact').replace(/\s+/g, '_')}.vcf`;

  return (
    <div className="vcard-qr" dir="rtl" data-testid="vcard-qr">
      <img
        className="vcard-qr-img"
        src={qrSrc}
        width={size}
        height={size}
        alt={`קוד QR לשמירת איש קשר — ${agent?.displayName || ''}`}
        loading="lazy"
      />
      <a
        className="btn btn-secondary vcard-qr-btn"
        download={filename}
        href={href || '#'}
        onClick={onClick}
        data-testid="vcard-qr-download"
      >
        <Download size={14} aria-hidden="true" />
        <span>שמור איש קשר</span>
      </a>
    </div>
  );
}
