import { useState } from 'react';
import { X, Copy, Check, MessageCircle, ExternalLink } from 'lucide-react';
import './ShareCatalogDialog.css';

/**
 * Share-catalog preview modal. Shows the agent what a customer will see
 * before they paste the URL anywhere, and offers a direct WhatsApp send.
 */
export default function ShareCatalogDialog({
  catalogUrl,
  agentName,
  onClose,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(catalogUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const text = [
      `שלום, זה ${agentName || 'הסוכן שלך'}.`,
      '',
      'ריכזתי עבורך את כל הנכסים שלי במקום אחד:',
      catalogUrl,
      '',
      'אשמח לעמוד לרשותך לתיאום ביקור או לכל שאלה.',
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="scd-backdrop" onClick={onClose}>
      <div className="scd-modal" onClick={(e) => e.stopPropagation()}>
        <header className="scd-header">
          <div>
            <h3>שיתוף הקטלוג האישי</h3>
            <p>זה מה שהלקוח יראה כשילחץ על הקישור</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="scd-body">
          <div className="scd-url">
            <code>{catalogUrl}</code>
            <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'הועתק' : 'העתק'}
            </button>
          </div>

          <div className="scd-preview">
            <div className="scd-preview-bar">
              <span className="scd-dot" />
              <span className="scd-dot" />
              <span className="scd-dot" />
              <span className="scd-preview-url">{catalogUrl}</span>
            </div>
            <iframe
              title="תצוגה מקדימה של הקטלוג"
              src={catalogUrl}
              loading="lazy"
            />
          </div>
        </div>

        <footer className="scd-footer">
          <a href={catalogUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
            <ExternalLink size={14} />
            פתח בכרטיסייה חדשה
          </a>
          <button className="btn btn-primary" onClick={handleWhatsApp}>
            <MessageCircle size={14} />
            שתף בוואטסאפ
          </button>
        </footer>
      </div>
    </div>
  );
}
