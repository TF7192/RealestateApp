// LandingRenderer — drives the per-property landing page from a config
// object. When `config` is null, falls back to `defaultLandingConfig(...)`,
// which produces the pre-editor hard-coded layout byte-identically so
// existing rows render unchanged.
//
// Phase 1 only knows about the four blocks the original page had:
// HERO, GALLERY, INQUIRY, AGENT_CARD. Phase 3 will add the other
// seven (DESCRIPTION, AMENITIES, NEIGHBORHOOD, VIDEO, VIRTUAL_TOUR,
// FLOOR_PLAN, SPECS); their `case` arms will live in the same
// `renderSection` switch.
//
// State that crosses block boundaries (active photo, form fields) is
// owned by the renderer and threaded down. Per-block layout and copy
// live in the per-case JSX below.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Phone, Mail, User, MessageSquareText, CheckCircle2, MapPin } from 'lucide-react';
import api from '../../lib/api';
import { defaultLandingConfig } from './defaultConfig';
import { templateCopy } from './copy.he';
import '../PropertyLandingPage.css';

export default function LandingRenderer({
  config,
  property,
  agent,
  // Editor preview passes `inquiryDisabled` to keep the form from
  // POSTing real inquiries while the agent is just playing.
  inquiryDisabled = false,
}) {
  const effective = useMemo(() => (
    config || defaultLandingConfig({ assetClass: property?.assetClass })
  ), [config, property?.assetClass]);

  const tpl = templateCopy(effective.template);
  // The public serializer flattens `images` to a string[] (URL list)
  // for back-compat with CustomerPropertyView, but the renderer needs
  // full PropertyImage objects so it can pick variants (urlCard /
  // urlThumb) and resolve hero photo-id selection. `imageList` is
  // the parallel-shaped object array the serializer emits alongside.
  // Inside the editor (where this component runs against an already-
  // fetched /api/properties/:id payload), `images` IS the object
  // array — so fall back to that.
  const images = useMemo(() => {
    const list = property?.imageList;
    if (Array.isArray(list) && list.length) return list;
    const raw = property?.images;
    if (!Array.isArray(raw)) return [];
    // Heuristic: if the first element is a string, the array is the
    // flat URL list; coerce into objects so the rest of the renderer
    // doesn't have to branch.
    if (typeof raw[0] === 'string') {
      return raw.map((url, i) => ({ id: `img-${i}`, url, urlCard: url, urlThumb: url, sortOrder: i }));
    }
    return raw;
  }, [property?.imageList, property?.images]);

  // Active photo state lives at the renderer level so both HERO and
  // GALLERY blocks stay in sync — clicking a thumb updates the hero.
  const [activePhoto, setActivePhoto] = useState(0);

  // Inquiry form state — owned by the renderer so the agent footer
  // and the form section can both read the gratitude flag.
  const [form, setForm] = useState({ contactName: '', contactPhone: '', contactEmail: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formErr, setFormErr] = useState(null);

  const docTitle = useMemo(() => {
    if (!property) return 'נכס';
    return `${property.type || 'נכס'} ב${property.city || 'ישראל'}`;
  }, [property]);
  useEffect(() => {
    if (inquiryDisabled) return; // never overwrite the editor's title
    document.title = docTitle;
  }, [docTitle, inquiryDisabled]);

  const submit = async (e) => {
    e.preventDefault();
    setFormErr(null);
    if (inquiryDisabled) {
      setSubmitted(true);
      return;
    }
    const name = form.contactName.trim();
    const phone = form.contactPhone.trim();
    if (!name || !phone) {
      setFormErr('שם וטלפון הם שדות חובה');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitPropertyInquiry(agent?.slug, property?.slug, {
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

  const isCommercial = effective.template === 'COMMERCIAL';
  const prev = () => setActivePhoto((i) => (i - 1 + images.length) % Math.max(images.length, 1));
  const next = () => setActivePhoto((i) => (i + 1) % Math.max(images.length, 1));

  const ctx = {
    property, agent, images, tpl, activePhoto, setActivePhoto, prev, next,
    form, setForm, submit, submitting, submitted, formErr,
  };

  return (
    <div className={`lp-page ${isCommercial ? 'lp-commercial' : 'lp-residential'}`}>
      {effective.sections.map((section) => {
        if (!section.visible) return null;
        const rendered = renderSection(section, ctx);
        if (!rendered) return null;
        // Wrap in a stable key so React reconciliation is happy
        // across drag-reorder in the editor's preview.
        return <SectionFrame key={section.id}>{rendered}</SectionFrame>;
      })}
    </div>
  );
}

function SectionFrame({ children }) {
  // Pass-through wrapper. Exists so the editor preview can later
  // overlay per-section affordances (drag handle, hover outline)
  // without re-shaping every block.
  return children;
}

function renderSection(section, ctx) {
  switch (section.type) {
    case 'HERO':       return <HeroSection section={section} ctx={ctx} />;
    case 'GALLERY':    return <GallerySection section={section} ctx={ctx} />;
    case 'INQUIRY':    return <InquirySection section={section} ctx={ctx} />;
    case 'AGENT_CARD': return <AgentCardSection ctx={ctx} />;
    // Phase 3 — the remaining block types land here:
    case 'DESCRIPTION':
    case 'AMENITIES':
    case 'NEIGHBORHOOD':
    case 'VIDEO':
    case 'VIRTUAL_TOUR':
    case 'FLOOR_PLAN':
    case 'SPECS':
      return null; // not yet implemented; renderer silently skips
    default:
      return null;
  }
}

// ─── HERO ────────────────────────────────────────────────────────

function HeroSection({ section, ctx }) {
  const { property, images, tpl, activePhoto, prev, next } = ctx;
  const { props } = section;

  // Per-section copy override falls back to the template default
  // when the agent left the field empty.
  const eyebrow = props.eyebrow || tpl.eyebrow;
  const title = props.title || tpl.title;
  const subtitle = props.subtitle || tpl.subtitle;

  // Photo selection. The editor stores a PropertyImage.id; null
  // means "first photo". If the id no longer matches any photo
  // (deleted), fall back to the active-photo cursor.
  const explicit = props.photoId
    ? images.find((i) => i.id === props.photoId)
    : null;
  const heroPic = explicit || images[activePhoto] || images[0];
  const hero = heroPic?.urlCard || heroPic?.url;

  const docTitle = `${property?.type || 'נכס'} ב${property?.city || 'ישראל'}`;

  return (
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
        <span className="lp-eyebrow">{eyebrow}</span>
        <h1 className="lp-title">{title}</h1>
        <p className="lp-subtitle">{subtitle}</p>
        {property?.city && (
          <div className="lp-locator" aria-label="מיקום">
            <MapPin size={14} aria-hidden="true" />
            <span>{property.city}</span>
          </div>
        )}
      </div>
      {!props.photoId && images.length > 1 && (
        <div className="lp-hero-arrows" aria-hidden="true">
          <button type="button" onClick={prev} aria-label="תמונה קודמת"><ChevronRight size={18} /></button>
          <button type="button" onClick={next} aria-label="תמונה הבאה"><ChevronLeft size={18} /></button>
        </div>
      )}
    </header>
  );
}

// ─── GALLERY ─────────────────────────────────────────────────────

function GallerySection({ ctx }) {
  const { images, activePhoto, setActivePhoto } = ctx;
  if (images.length <= 1) return null;
  return (
    <section className="lp-gallery" aria-label="גלריית תמונות">
      <div className="lp-gallery-track">
        {images.map((img, i) => (
          <button
            type="button"
            key={img.id || img.url || i}
            className={`lp-thumb ${i === activePhoto ? 'lp-thumb-on' : ''}`}
            onClick={() => setActivePhoto(i)}
            aria-label={`תמונה ${i + 1}`}
            style={{ backgroundImage: `url(${img.urlThumb || img.url})` }}
          />
        ))}
      </div>
    </section>
  );
}

// ─── INQUIRY ─────────────────────────────────────────────────────

function InquirySection({ section, ctx }) {
  const { tpl, form, setForm, submit, submitting, submitted, formErr } = ctx;
  const { props } = section;
  const heading = props.heading || tpl.formHeading;
  const subHeading = props.subHeading || tpl.formSub;
  const ctaLabel = props.ctaLabel || tpl.submit;

  return (
    <section className="lp-form-section" id="inquiry">
      <div className="lp-form-card">
        {submitted ? (
          <div className="lp-thankyou">
            <CheckCircle2 size={40} aria-hidden="true" />
            <h2>{tpl.gratitude}</h2>
            <p>הסוכן יחזור אליכם במספר שהשארתם.</p>
          </div>
        ) : (
          <>
            <h2 className="lp-form-heading">{heading}</h2>
            <p className="lp-form-sub">{subHeading}</p>
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
                  placeholder={tpl.messagePlaceholder}
                />
              </label>
              {formErr && <div className="lp-form-err">{formErr}</div>}
              <button type="submit" className="lp-submit" disabled={submitting}>
                {submitting ? 'שולח…' : ctaLabel}
              </button>
              <p className="lp-disclaimer">
                השליחה מעבירה את פרטיכם לסוכן המפרסם בלבד.
              </p>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

// ─── AGENT CARD ──────────────────────────────────────────────────

function AgentCardSection({ ctx }) {
  const { agent } = ctx;
  if (!agent) return null;
  return (
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
  );
}
