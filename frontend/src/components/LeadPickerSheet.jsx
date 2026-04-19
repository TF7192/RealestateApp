import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Flame,
  Send,
  Sparkles,
  ChevronDown,
  Camera,
} from 'lucide-react';
import WhatsAppIcon from './WhatsAppIcon';
import haptics from '../lib/haptics';
import { isNative } from '../native/platform';
import './LeadPickerSheet.css';

/**
 * LeadPickerSheet — pick a recipient and (optionally) edit the message.
 *
 * Single-column layout: editable WhatsApp bubble at the top, recipient
 * list below. Works the same on desktop and mobile — the desktop is just
 * a centered modal, mobile is a bottom sheet.
 *
 * The first row in the list is "פתח בוואטסאפ ללא נמען" (gold-trimmed) —
 * one tap to open WA without a recipient.
 */
export default function LeadPickerSheet({
  property,
  leads = [],
  previewText = '',
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');
  const [text, setText] = useState(previewText);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => { setText(previewText); }, [previewText]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const ranked = useMemo(() => {
    const list = (leads || []).filter((l) => l.phone);
    const scored = list.map((l) => ({ lead: l, score: matchScore(l, property) }));
    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const al = a.lead.lastContact ? new Date(a.lead.lastContact).getTime() : 0;
      const bl = b.lead.lastContact ? new Date(b.lead.lastContact).getTime() : 0;
      return bl - al;
    });
    const q = query.trim();
    if (!q) return scored;
    return scored.filter(({ lead }) =>
      [lead.name, lead.city, lead.phone].filter(Boolean).some((s) => String(s).includes(q))
    );
  }, [leads, property, query]);

  const send = (lead, opts) => {
    haptics.tap();
    onPick?.(lead, text, opts);
  };

  // Native iOS only: pinned "share with photos" row when the property has
  // images. The handler routes through the iOS share sheet so WhatsApp
  // arrives with the photos pre-attached.
  const propertyPhotos = (property?.images || []).map((im) =>
    typeof im === 'string' ? im : (im?.url || '')
  ).filter(Boolean);
  const showPhotoShare = isNative() && propertyPhotos.length > 0;

  // Render via portal so the modal escapes any ancestor with `transform`/
  // `filter`/`will-change` that would otherwise contain `position: fixed`
  // (which was making the modal sit *inside* the page area).
  return createPortal(
    <div className="lps-back" onClick={onClose} role="dialog">
      <div className="lps-card" onClick={(e) => e.stopPropagation()}>
        <div className="lps-handle only-mobile" />

        {/* HEADER */}
        <header className="lps-head">
          <div className="lps-head-text">
            <h3>שלח את הנכס</h3>
            {property && (
              <small>{property.street}, {property.city}</small>
            )}
          </div>
          <button className="lps-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>

        {/* PREVIEW — editable WhatsApp bubble at the top */}
        <section className={`lps-preview ${editorOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="lps-preview-toggle only-mobile"
            onClick={() => setEditorOpen((v) => !v)}
          >
            <span>תצוגה מקדימה של ההודעה</span>
            <ChevronDown
              size={14}
              style={{ transform: editorOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}
            />
          </button>

          <div className="lps-bubble-row">
            <div className="lps-bubble">
              <textarea
                className="lps-bubble-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="כתוב את הודעתך…"
                spellCheck={false}
                dir="auto"
                autoCapitalize="sentences"
                enterKeyHint="enter"
              />
              <span className="lps-bubble-meta">
                {nowHHMM()} <span className="lps-bubble-ticks">✓✓</span>
              </span>
            </div>
          </div>
          <small className="lps-preview-hint only-desktop">
            ערוך כאן ישירות — מה שתכתוב יגיע ללקוח
          </small>
        </section>

        {/* SEARCH */}
        <div className="lps-search">
          <Search size={14} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש לפי שם, עיר או טלפון"
          />
        </div>

        {/* LIST */}
        <div className="lps-list">
          {showPhotoShare && (
            <button
              type="button"
              className="lps-row lps-row-noone lps-row-photos"
              onClick={() => send(null, { withPhotos: true, photos: propertyPhotos })}
            >
              <div className="lps-noone-icon"><Camera size={16} /></div>
              <div className="lps-meta">
                <strong>שתף עם {Math.min(propertyPhotos.length, 5)} תמונות</strong>
                <small>תמונות + טקסט בתוך הצ׳אט בוואטסאפ</small>
              </div>
              <span className="lps-cta-wa lps-cta-wa-gold" aria-hidden="true">
                <Camera size={13} />
              </span>
            </button>
          )}

          <button
            type="button"
            className="lps-row lps-row-noone"
            onClick={() => send(null)}
          >
            <div className="lps-noone-icon"><Sparkles size={16} /></div>
            <div className="lps-meta">
              <strong>פתח בוואטסאפ</strong>
              <small>בחירת נמען בתוך וואטסאפ</small>
            </div>
            <span className="lps-cta-wa lps-cta-wa-gold" aria-hidden="true">
              <WhatsAppIcon size={13} />
            </span>
          </button>

          {ranked.map(({ lead, score }) => (
            <button
              key={lead.id}
              type="button"
              className="lps-row"
              onClick={() => send(lead)}
            >
              <div className="lps-avatar">{(lead.name || 'ל').charAt(0)}</div>
              <div className="lps-meta">
                <div className="lps-name-row">
                  <strong>{lead.name}</strong>
                  {lead.status === 'HOT' && (
                    <span className="lps-dot lps-dot-hot" title="חם" />
                  )}
                  {score >= 3 && (
                    <span className="lps-pill lps-match">התאמה</span>
                  )}
                </div>
                <small>
                  {[lead.city, lead.rooms ? `${lead.rooms} חד׳` : null]
                    .filter(Boolean).join(' · ')}
                </small>
              </div>
              <span className="lps-cta-wa" aria-hidden="true">
                <Send size={12} />
              </span>
            </button>
          ))}

          {ranked.length === 0 && query && (
            <div className="lps-empty">
              לא נמצאו לידים בשם "<strong>{query}</strong>"
            </div>
          )}

          {leads.length === 0 && !query && (
            <div className="lps-empty">
              אין עדיין לידים — אפשר לפתוח בוואטסאפ ולבחור נמען שם.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function matchScore(lead, property) {
  if (!lead || !property) return 0;
  let s = 0;
  if (lead.assetClass && lead.assetClass === property.assetClass) s += 2;
  if (lead.interest === 'BUY'  && property.category === 'SALE') s += 1;
  if (lead.interest === 'RENT' && property.category === 'RENT') s += 1;
  if (lead.city && property.city && String(lead.city).trim() === String(property.city).trim()) s += 2;
  const lr = parseFloat(lead.rooms);
  const pr = parseFloat(property.rooms);
  if (!isNaN(lr) && !isNaN(pr) && Math.abs(lr - pr) <= 1) s += 1;
  const price = property.marketingPrice;
  if (price && lead.priceMin && lead.priceMax) {
    if (price >= lead.priceMin && price <= lead.priceMax) s += 2;
  }
  return s;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
