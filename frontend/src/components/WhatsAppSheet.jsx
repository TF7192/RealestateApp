import { useState, useEffect } from 'react';
import { X, Send, Copy, Check } from 'lucide-react';
import Portal from './Portal';
import './WhatsAppSheet.css';

/**
 * WhatsAppSheet — editable preview, then one tap to open WhatsApp.
 *
 * The sheet never picks a recipient itself: we open wa.me/ without a phone
 * number so WhatsApp's native contact picker kicks in (same flow as iOS
 * Share → Messages).
 *
 * props:
 *   title       – header text
 *   subtitle?   – text under the title
 *   message     – editable message (initial value)
 *   onClose     – close handler
 *   onSent?     – fired after the user taps "Open WhatsApp"
 */
export default function WhatsAppSheet({
  title,
  subtitle,
  message = '',
  onClose,
  onSent,
}) {
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setText(message); }, [message]);

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
    onSent?.(text);
    onClose?.();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Portal>
      <div className="was-backdrop" onClick={onClose}>
        <div className="was-sheet" onClick={(e) => e.stopPropagation()}>
          <header className="was-header">
            <div>
              <h3>{title || 'שליחה בוואטסאפ'}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
          </header>

          <div className="was-body">
            <label className="was-label">ההודעה שתישלח</label>
            <textarea
              className="was-textarea"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ערוך את ההודעה לפני השליחה..."
            />
            <div className="was-hint">
              לחיצה על <strong>פתח בוואטסאפ</strong> תפתח את האפליקציה — שם תבחר/י למי לשלוח.
            </div>
          </div>

          <footer className="was-footer">
            <button className="btn btn-ghost" onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'הועתק' : 'העתק'}
            </button>
            <button className="btn btn-primary" onClick={openWhatsApp}>
              <Send size={14} />
              פתח בוואטסאפ
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
