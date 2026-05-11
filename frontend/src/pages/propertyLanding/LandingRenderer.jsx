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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Phone, Mail, User, MessageSquareText,
  CheckCircle2, MapPin, Check, Bed, Square, Building2, ArrowUpRight,
  Compass, Coins,
} from 'lucide-react';
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
  // Public viewers benefit from deferring heavy below-fold work
  // (YouTube/Vimeo iframes, Google Maps embeds, full-size floor
  // plans) until each block scrolls into view. The editor preview
  // disables this so the agent can see every section at all times.
  lazyBelowFold = true,
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

  // Wrap below-fold sections in a LazyMount so VIDEO iframes,
  // NEIGHBORHOOD map embeds, and FLOOR_PLAN images don't load
  // until they enter the viewport. The hero (index 0) is the LCP
  // and always renders immediately; the second visible section
  // typically sits within the initial viewport so its IO callback
  // fires on first paint anyway — the cost is just a wrapper div.
  let visibleIdx = 0;
  return (
    <div className={`lp-page ${isCommercial ? 'lp-commercial' : 'lp-residential'}`}>
      {effective.sections.map((section) => {
        if (!section.visible) return null;
        const rendered = renderSection(section, ctx);
        if (!rendered) return null;
        const idx = visibleIdx++;
        const lazy = lazyBelowFold && idx > 0;
        return (
          <SectionFrame key={section.id} lazy={lazy}>
            {rendered}
          </SectionFrame>
        );
      })}
    </div>
  );
}

function SectionFrame({ children, lazy }) {
  if (!lazy) return children;
  return <LazyMount minHeight={320}>{children}</LazyMount>;
}

// Render `children` only after the placeholder scrolls within
// `rootMargin` of the viewport. Mounts once, never re-hides — once
// visible, the block stays mounted so scrolling back up doesn't
// trigger a fresh fetch. Falls open (immediate mount) when the
// runtime lacks IntersectionObserver.
function LazyMount({ children, minHeight = 200 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const node = ref.current;
    if (!node) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [visible]);
  if (visible) return children;
  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
}

function renderSection(section, ctx) {
  switch (section.type) {
    case 'HERO':         return <HeroSection section={section} ctx={ctx} />;
    case 'GALLERY':      return <GallerySection section={section} ctx={ctx} />;
    case 'DESCRIPTION':  return <DescriptionSection section={section} />;
    case 'AMENITIES':    return <AmenitiesSection section={section} />;
    case 'NEIGHBORHOOD': return <NeighborhoodSection section={section} ctx={ctx} />;
    case 'VIDEO':        return <VideoSection section={section} />;
    case 'VIRTUAL_TOUR': return <VirtualTourSection section={section} />;
    case 'FLOOR_PLAN':   return <FloorPlanSection section={section} ctx={ctx} />;
    case 'SPECS':        return <SpecsSection section={section} ctx={ctx} />;
    case 'INQUIRY':      return <InquirySection section={section} ctx={ctx} />;
    case 'AGENT_CARD':   return <AgentCardSection ctx={ctx} />;
    default:             return null;
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

  // Two visual variants. IMAGE = full-bleed background photo with
  // gradient + overlay text (current default). SPLIT = photo on one
  // side, text on the other on desktop; stacks photo-over-text on
  // mobile. The DOM stays similar so the gallery arrow controls and
  // the content block keep working in both layouts.
  const variant = props.variant === 'SPLIT' ? 'SPLIT' : 'IMAGE';

  const content = (
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
  );

  const arrows = !props.photoId && images.length > 1 && (
    <div className="lp-hero-arrows" aria-hidden="true">
      <button type="button" onClick={prev} aria-label="תמונה קודמת"><ChevronRight size={18} /></button>
      <button type="button" onClick={next} aria-label="תמונה הבאה"><ChevronLeft size={18} /></button>
    </div>
  );

  if (variant === 'SPLIT') {
    return (
      <header className="lp-hero lp-hero-split">
        <div
          className="lp-hero-split-image"
          style={hero ? { backgroundImage: `url(${hero})` } : undefined}
          role="img"
          aria-label={docTitle}
        />
        <div className="lp-hero-split-content">
          {content}
        </div>
        {arrows}
      </header>
    );
  }

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
      {content}
      {arrows}
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

// ─── DESCRIPTION ─────────────────────────────────────────────────

function DescriptionSection({ section }) {
  const { heading, body } = section.props;
  if (!heading && !body) return null;
  return (
    <section className="lp-block lp-description">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      {body && (
        <div className="lp-block-body">
          {/* Newlines preserved so an agent can paragraph their copy
              without us shipping a rich-text editor or Markdown
              parser. Plain text only — copy-paste from Word strips
              cleanly. */}
          {body.split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── AMENITIES ───────────────────────────────────────────────────

function AmenitiesSection({ section }) {
  const { heading, items = [] } = section.props;
  const real = items.filter((s) => (s || '').trim());
  if (!heading && real.length === 0) return null;
  return (
    <section className="lp-block lp-amenities">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      {real.length > 0 && (
        <ul className="lp-amenities-list">
          {real.map((label, i) => (
            <li key={i}>
              <Check size={16} aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── NEIGHBORHOOD ────────────────────────────────────────────────

function NeighborhoodSection({ section, ctx }) {
  const { heading, body, showMap } = section.props;
  const city = ctx.property?.city;
  const street = ctx.property?.street;
  if (!heading && !body && !showMap) return null;

  // Google Maps embed via the unauthenticated "?q=" iframe form —
  // no API key, no SDK. Address is the property's street + city; if
  // we have lat/lng we'd prefer those, but the agents pasted in raw
  // strings on most rows so the address fallback is what reliably
  // works. Keep loading="lazy" so off-screen sections don't pull
  // the iframe in until they enter the viewport.
  const mapQ = encodeURIComponent([street, city].filter(Boolean).join(', '));

  return (
    <section className="lp-block lp-neighborhood">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      {body && (
        <div className="lp-block-body">
          {body.split(/\n+/).map((para, i) => <p key={i}>{para}</p>)}
        </div>
      )}
      {showMap && mapQ && (
        <div className="lp-map-wrap">
          <iframe
            title="מיקום על המפה"
            className="lp-map"
            src={`https://www.google.com/maps?q=${mapQ}&hl=he&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </section>
  );
}

// ─── VIDEO ───────────────────────────────────────────────────────

function parseEmbedUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      // /shorts/<id> and /embed/<id> formats
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/);
      if (m) return `https://www.youtube.com/embed/${encodeURIComponent(m[1])}`;
    }
    if (host.endsWith('vimeo.com')) {
      const m = u.pathname.match(/\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${encodeURIComponent(m[1])}`;
    }
  } catch { /* not a URL */ }
  return null;
}

function VideoSection({ section }) {
  const { heading, url } = section.props;
  const embed = parseEmbedUrl(url);
  if (!embed) return null; // editor will show a "url חסר / לא נתמך" hint instead
  return (
    <section className="lp-block lp-video">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      <div className="lp-video-wrap">
        <iframe
          title={heading || 'סרטון הנכס'}
          src={embed}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </section>
  );
}

// ─── VIRTUAL TOUR ────────────────────────────────────────────────

function VirtualTourSection({ section }) {
  const { heading, url, ctaLabel } = section.props;
  if (!url) return null;
  return (
    <section className="lp-block lp-tour">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="lp-tour-cta"
      >
        <Compass size={18} aria-hidden="true" />
        <span>{ctaLabel || 'התחילו סיור וירטואלי'}</span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

// ─── FLOOR PLAN ──────────────────────────────────────────────────

function FloorPlanSection({ section, ctx }) {
  const { heading, photoId } = section.props;
  const img = photoId ? ctx.images.find((i) => i.id === photoId) : null;
  const src = img?.urlCard || img?.url;
  if (!src) return null;
  return (
    <section className="lp-block lp-floor">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      <div className="lp-floor-wrap">
        <img src={src} alt={heading || 'תוכנית הקומה'} loading="lazy" decoding="async" />
      </div>
    </section>
  );
}

// ─── SPECS ───────────────────────────────────────────────────────

function SpecsSection({ section, ctx }) {
  const { heading, showPrice, showRooms, showSqm, showFloor } = section.props;
  const p = ctx.property || {};
  const chips = [];
  if (showRooms && p.rooms != null) {
    chips.push({ icon: <Bed size={14} />, label: `${formatRooms(p.rooms)} חדרים` });
  }
  if (showSqm && p.sqm != null) {
    chips.push({ icon: <Square size={14} />, label: `${p.sqm} מ״ר` });
  }
  if (showFloor && p.floor != null) {
    const total = p.totalFloors ? ` / ${p.totalFloors}` : '';
    chips.push({ icon: <Building2 size={14} />, label: `קומה ${p.floor}${total}` });
  }
  if (showPrice && p.marketingPrice) {
    chips.push({ icon: <Coins size={14} />, label: `₪${Number(p.marketingPrice).toLocaleString('he-IL')}` });
  }
  if (chips.length === 0 && !heading) return null;
  return (
    <section className="lp-block lp-specs">
      {heading && <h2 className="lp-block-heading">{heading}</h2>}
      {chips.length > 0 && (
        <ul className="lp-specs-list">
          {chips.map((c, i) => (
            <li key={i} className="lp-spec-chip">{c.icon}<span>{c.label}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRooms(r) {
  if (r == null) return '';
  return String(r);
}
