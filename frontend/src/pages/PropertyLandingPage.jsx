// Per-asset premium landing page. Lives at /l/:agentSlug/:propertySlug.
// Public, no auth — prospects land here from agent-shared links.
//
// Design notes:
//  - Minimal detail surface by design: photos, one-line locator, and a
//    contact form. Price / room count / sqm are intentionally omitted
//    so curiosity drives an inquiry. The agent then qualifies the lead
//    via phone from the PropertyInquiry that shows up on their side.
//  - Two copy templates: RESIDENTIAL ("הבית החדש שלכם מחכה") vs
//    COMMERCIAL ("מרחב שמניע עסקים קדימה"). Drives hero headline +
//    form sub-copy only; the layout stays identical so both feel
//    like the same brand language.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Phone, Mail, User, MessageSquareText, CheckCircle2, MapPin } from 'lucide-react';
import api from '../lib/api';
import './PropertyLandingPage.css';

const TEMPLATES = {
  RESIDENTIAL: {
    eyebrow: 'הבית הבא שלכם',
    title: 'בית שמחכה להיכנס אליו',
    subtitle: 'לחוות את הנכס לפני כולם — הירשמו ונחזור אליכם עם כל הפרטים.',
    formHeading: 'מעוניינים בסיור? השאירו פרטים',
    formSub: 'נחזור אליכם בתוך שעות עבודה עם מידע מלא, מועדי סיור והצעה אישית.',
    submit: 'קבעו סיור',
    messagePlaceholder: 'מתי נוח לכם לבקר? האם יש דרישות ספציפיות?',
    gratitude: 'תודה! נחזור אליכם בהקדם לקביעת סיור.',
  },
  COMMERCIAL: {
    eyebrow: 'מרחב עסקי חדש',
    title: 'מרחב שמניע עסקים קדימה',
    subtitle: 'מיקום, אופי, ושטח שמתאימים לעסק שלכם. נשלח לכם את כל המידע לפי דרישה.',
    formHeading: 'רוצים פרטים על הנכס? מלאו את הטופס',
    formSub: 'נחזור אליכם עם תוכנית, שטחים, תנאי שכירות והצעה מותאמת לעסק שלכם.',
    submit: 'שלחו פנייה',
    messagePlaceholder: 'ספרו לנו על העסק / השימוש המתוכנן / כמה עמדות עבודה דרושות',
    gratitude: 'תודה! פנייתכם נקלטה — הסוכן יחזור אליכם עם פרטים.',
  },
};

export default function PropertyLandingPage() {
  const { agentSlug, propertySlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [form, setForm] = useState({ contactName: '', contactPhone: '', contactEmail: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formErr, setFormErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.publicProperty(agentSlug, propertySlug);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'טעינת הנכס נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentSlug, propertySlug]);

  const property = data?.property;
  const agent = data?.agent;
  const images = property?.images || [];
  const isCommercial = property?.assetClass === 'COMMERCIAL';
  const template = TEMPLATES[isCommercial ? 'COMMERCIAL' : 'RESIDENTIAL'];

  // Document title. Minimal — no address or price to keep the marketing
  // tone clean and drive clicks through the inquiry form.
  const docTitle = useMemo(() => {
    if (!property) return 'נכס';
    return `${property.type || 'נכס'} ב${property.city || 'ישראל'}`;
  }, [property]);
  useEffect(() => { document.title = docTitle; }, [docTitle]);

  const submit = async (e) => {
    e.preventDefault();
    setFormErr(null);
    const name = form.contactName.trim();
    const phone = form.contactPhone.trim();
    if (!name || !phone) {
      setFormErr('שם וטלפון הם שדות חובה');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitPropertyInquiry(agentSlug, propertySlug, {
        contactName: name,
        contactPhone: phone,
        contactEmail: form.contactEmail.trim() || null,
        message: form.message.trim() || null,
      });
      setSubmitted(true);
    } catch (err) {
      setFormErr(err?.message || 'שליחת הפנייה נכשלה — נסו שוב');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="lp-page lp-state">
        <div className="lp-skel" />
      </div>
    );
  }
  if (error || !property) {
    return (
      <div className="lp-page lp-state">
        <div className="lp-empty">
          <h1>הנכס לא נמצא</h1>
          <p>הקישור אולי פג או שהנכס הוסר מהשוק. אפשר לפנות לסוכן ישירות.</p>
        </div>
      </div>
    );
  }

  const hero = images[activePhoto]?.url || images[0]?.url;
  const prev = () => setActivePhoto((i) => (i - 1 + images.length) % Math.max(images.length, 1));
  const next = () => setActivePhoto((i) => (i + 1) % Math.max(images.length, 1));

  return (
    <div className={`lp-page ${isCommercial ? 'lp-commercial' : 'lp-residential'}`}>
      <header className="lp-hero">
        {hero && (
          <div
            className="lp-hero-image"
            style={{ backgroundImage: `url(${hero})` }}
            role="img"
            aria-label={docTitle}
          />
        )}
        <div className="lp-hero-gradient" />
        <div className="lp-hero-content">
          <span className="lp-eyebrow">{template.eyebrow}</span>
          <h1 className="lp-title">{template.title}</h1>
          <p className="lp-subtitle">{template.subtitle}</p>
          {property.city && (
            <div className="lp-locator" aria-label="מיקום">
              <MapPin size={14} aria-hidden="true" />
              <span>{property.city}</span>
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="lp-hero-arrows" aria-hidden="true">
            <button type="button" onClick={prev} aria-label="תמונה קודמת"><ChevronRight size={18} /></button>
            <button type="button" onClick={next} aria-label="תמונה הבאה"><ChevronLeft size={18} /></button>
          </div>
        )}
      </header>

      {images.length > 1 && (
        <section className="lp-gallery" aria-label="גלריית תמונות">
          <div className="lp-gallery-track">
            {images.map((img, i) => (
              <button
                type="button"
                key={img.id || img.url || i}
                className={`lp-thumb ${i === activePhoto ? 'lp-thumb-on' : ''}`}
                onClick={() => setActivePhoto(i)}
                aria-label={`תמונה ${i + 1}`}
                style={{ backgroundImage: `url(${img.url})` }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="lp-form-section" id="inquiry">
        <div className="lp-form-card">
          {submitted ? (
            <div className="lp-thankyou">
              <CheckCircle2 size={40} aria-hidden="true" />
              <h2>{template.gratitude}</h2>
              <p>הסוכן יחזור אליכם במספר שהשארתם.</p>
            </div>
          ) : (
            <>
              <h2 className="lp-form-heading">{template.formHeading}</h2>
              <p className="lp-form-sub">{template.formSub}</p>
              <form className="lp-form" onSubmit={submit} noValidate>
                <label className="lp-field">
                  <span className="lp-field-label">
                    <User size={14} aria-hidden="true" /> שם מלא
                  </span>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                    autoComplete="name"
                    required
                    placeholder="ישראל ישראלי"
                  />
                </label>
                <label className="lp-field">
                  <span className="lp-field-label">
                    <Phone size={14} aria-hidden="true" /> טלפון
                  </span>
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                    autoComplete="tel"
                    required
                    inputMode="tel"
                    placeholder="050-123-4567"
                  />
                </label>
                <label className="lp-field">
                  <span className="lp-field-label">
                    <Mail size={14} aria-hidden="true" /> אימייל (רשות)
                  </span>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                    autoComplete="email"
                    placeholder="name@example.com"
                  />
                </label>
                <label className="lp-field lp-field-wide">
                  <span className="lp-field-label">
                    <MessageSquareText size={14} aria-hidden="true" /> הודעה (רשות)
                  </span>
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder={template.messagePlaceholder}
                  />
                </label>
                {formErr && <div className="lp-form-err">{formErr}</div>}
                <button type="submit" className="lp-submit" disabled={submitting}>
                  {submitting ? 'שולח…' : template.submit}
                </button>
                <p className="lp-disclaimer">
                  השליחה מעבירה את פרטיכם לסוכן המפרסם בלבד.
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      {agent && (
        <footer className="lp-footer">
          <div className="lp-agent">
            {agent.avatarUrl && <img src={agent.avatarUrl} alt="" className="lp-agent-avatar" />}
            <div>
              <p className="lp-agent-label">הסוכן המפרסם</p>
              <p className="lp-agent-name">{agent.displayName}</p>
            </div>
          </div>
          <div className="lp-brand">Estia · פלטפורמת שיווק נדל״ן</div>
        </footer>
      )}
    </div>
  );
}
