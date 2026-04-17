import { useState, useEffect } from 'react';
import { X, MessageCircle, Send, User, Copy, Check } from 'lucide-react';
import './WhatsAppSheet.css';

/**
 * WhatsAppSheet — editable preview before firing wa.me/.
 *
 * props:
 *   title       – header text
 *   subtitle?   – subtext under the title
 *   message     – initial message (editable textarea)
 *   recipients? – [{id, name, phone}] list to pick from; if omitted or empty
 *                 the sheet opens wa.me/ without a recipient.
 *   onClose     – close handler
 */
export default function WhatsAppSheet({
  title,
  subtitle,
  message = '',
  recipients = [],
  onClose,
}) {
  const [text, setText] = useState(message);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setText(message); }, [message]);

  const filteredRecipients = search.trim()
    ? recipients.filter((r) =>
        r.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.phone?.includes(search)
      )
    : recipients;

  const sendTo = (recipient) => {
    const phone = (recipient?.phone || '').replace(/[^0-9]/g, '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    onClose?.();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasRecipients = recipients.length > 0;

  return (
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
          <div className="was-editor">
            <label className="was-label">ההודעה שתישלח</label>
            <textarea
              className="was-textarea"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="כתוב כאן את ההודעה שתשלח..."
            />
            <div className="was-char">{text.length} תווים</div>
          </div>

          {hasRecipients && (
            <div className="was-recipients">
              <label className="was-label">שלח ל...</label>
              <div className="was-recipients-search">
                <input
                  type="text"
                  placeholder="סנן לפי שם או טלפון..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <ul className="was-recipients-list">
                {filteredRecipients.map((r) => (
                  <li key={r.id}>
                    <button
                      className={`was-recipient ${selected === r.id ? 'selected' : ''}`}
                      onClick={() => { setSelected(r.id); sendTo(r); }}
                    >
                      <span className="was-avatar">{r.name.charAt(0)}</span>
                      <span className="was-rec-text">
                        <strong>{r.name}</strong>
                        {r.sub && <small>{r.sub}</small>}
                      </span>
                      <span className="was-phone">{r.phone}</span>
                    </button>
                  </li>
                ))}
                {filteredRecipients.length === 0 && (
                  <li className="was-empty">לא נמצאו נמענים</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <footer className="was-footer">
          <button className="btn btn-ghost" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'הועתק' : 'העתק טקסט'}
          </button>
          {!hasRecipients && (
            <button className="btn btn-primary" onClick={() => sendTo(null)}>
              <Send size={14} />
              פתח בוואטסאפ
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
