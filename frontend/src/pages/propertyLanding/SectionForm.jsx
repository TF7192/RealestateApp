// Per-section form. Renders the right input fields for whichever
// block type the agent has selected in the editor sidebar.
//
// One file, switch on type, no abstraction layer. The eleven block
// types each have 1–5 fields and the schema is stable — pulling
// each block into its own file would be more bureaucracy than help.

import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { templateCopy } from './copy.he';

export default function SectionForm({ section, template, property, onChange }) {
  const update = (k, v) => onChange({
    ...section,
    props: { ...section.props, [k]: v },
  });
  const tpl = templateCopy(template);
  const images = property?.imageList || [];

  switch (section.type) {
    case 'HERO':
      return (
        <>
          <Field label={`כותרת עליונה (eyebrow) · ברירת מחדל: ${tpl.eyebrow}`}>
            <input
              type="text"
              value={section.props.eyebrow || ''}
              onChange={(e) => update('eyebrow', e.target.value)}
              placeholder={tpl.eyebrow}
              maxLength={80}
            />
          </Field>
          <Field label={`כותרת ראשית · ברירת מחדל: ${tpl.title}`}>
            <input
              type="text"
              value={section.props.title || ''}
              onChange={(e) => update('title', e.target.value)}
              placeholder={tpl.title}
              maxLength={80}
            />
          </Field>
          <Field label="כותרת משנה">
            <textarea
              rows={3}
              value={section.props.subtitle || ''}
              onChange={(e) => update('subtitle', e.target.value)}
              placeholder={tpl.subtitle}
              maxLength={200}
            />
          </Field>
          <Field label="תמונת שער">
            <PhotoPicker
              images={images}
              value={section.props.photoId}
              onChange={(id) => update('photoId', id)}
              hint="ברירת מחדל: התמונה הראשונה של הנכס"
            />
          </Field>
        </>
      );

    case 'GALLERY':
      return (
        <Field label="כותרת קטעית (אופציונלי)">
          <input
            type="text"
            value={section.props.heading || ''}
            onChange={(e) => update('heading', e.target.value)}
            placeholder="גלריית תמונות"
            maxLength={80}
          />
        </Field>
      );

    case 'DESCRIPTION':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="קצת על הנכס"
              maxLength={80}
            />
          </Field>
          <Field label="גוף הטקסט · שורות ריקות יוצרות פסקאות">
            <textarea
              rows={6}
              value={section.props.body || ''}
              onChange={(e) => update('body', e.target.value)}
              placeholder="הוסיפו תיאור של הנכס..."
              maxLength={1000}
            />
            <Counter value={section.props.body || ''} max={1000} />
          </Field>
        </>
      );

    case 'AMENITIES':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="מה יש בנכס"
              maxLength={80}
            />
          </Field>
          <Field label="פריטים · עד 12">
            <ItemsList
              items={section.props.items || []}
              onChange={(items) => update('items', items)}
              max={12}
            />
          </Field>
        </>
      );

    case 'NEIGHBORHOOD':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="על השכונה"
              maxLength={80}
            />
          </Field>
          <Field label="פסקת תיאור">
            <textarea
              rows={5}
              value={section.props.body || ''}
              onChange={(e) => update('body', e.target.value)}
              placeholder="מרחק לחנויות, בתי ספר, תחבורה, אופי האזור..."
              maxLength={1000}
            />
          </Field>
          <Field label="הצגת מפת מיקום">
            <Toggle
              checked={!!section.props.showMap}
              onChange={(v) => update('showMap', v)}
              label="הצג מפה משובצת מתחת לתיאור"
            />
          </Field>
        </>
      );

    case 'VIDEO':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="סיור בווידאו"
              maxLength={80}
            />
          </Field>
          <Field label="כתובת YouTube או Vimeo">
            <input
              type="url"
              value={section.props.url || ''}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              maxLength={400}
              dir="ltr"
            />
            <Hint>נתמכים youtube.com / youtu.be / vimeo.com. הסרטון משובץ ישירות בדף.</Hint>
          </Field>
        </>
      );

    case 'VIRTUAL_TOUR':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="סיור וירטואלי"
              maxLength={80}
            />
          </Field>
          <Field label="כתובת הסיור (Matterport / Kuula / וכו')">
            <input
              type="url"
              value={section.props.url || ''}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://my.matterport.com/show/?m=..."
              maxLength={400}
              dir="ltr"
            />
          </Field>
          <Field label="תווית כפתור">
            <input
              type="text"
              value={section.props.ctaLabel || ''}
              onChange={(e) => update('ctaLabel', e.target.value)}
              placeholder="התחילו סיור וירטואלי"
              maxLength={32}
            />
          </Field>
        </>
      );

    case 'FLOOR_PLAN':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="תוכנית הקומה"
              maxLength={80}
            />
          </Field>
          <Field label="תמונה · בחרו מתוך תמונות הנכס">
            <PhotoPicker
              images={images}
              value={section.props.photoId}
              onChange={(id) => update('photoId', id)}
              hint="העלו את תוכנית הקומה דרך ׳ניהול תמונות הנכס׳, ואז בחרו אותה כאן."
            />
          </Field>
        </>
      );

    case 'SPECS':
      return (
        <>
          <Field label="כותרת">
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder="נתוני הנכס"
              maxLength={80}
            />
          </Field>
          <Field label="מה להציג">
            <Toggle
              checked={!!section.props.showRooms}
              onChange={(v) => update('showRooms', v)}
              label="חדרים"
            />
            <Toggle
              checked={!!section.props.showSqm}
              onChange={(v) => update('showSqm', v)}
              label="גודל במ״ר"
            />
            <Toggle
              checked={!!section.props.showFloor}
              onChange={(v) => update('showFloor', v)}
              label="קומה"
            />
            <Toggle
              checked={!!section.props.showPrice}
              onChange={(v) => update('showPrice', v)}
              label="מחיר · שימו לב, מציג מחיר עלול להוריד פניות"
            />
          </Field>
        </>
      );

    case 'INQUIRY':
      return (
        <>
          <Field label={`כותרת טופס · ברירת מחדל: ${tpl.formHeading}`}>
            <input
              type="text"
              value={section.props.heading || ''}
              onChange={(e) => update('heading', e.target.value)}
              placeholder={tpl.formHeading}
              maxLength={80}
            />
          </Field>
          <Field label="טקסט מתחת לכותרת">
            <textarea
              rows={3}
              value={section.props.subHeading || ''}
              onChange={(e) => update('subHeading', e.target.value)}
              placeholder={tpl.formSub}
              maxLength={200}
            />
          </Field>
          <Field label="תווית כפתור">
            <input
              type="text"
              value={section.props.ctaLabel || ''}
              onChange={(e) => update('ctaLabel', e.target.value)}
              placeholder={tpl.submit}
              maxLength={32}
            />
          </Field>
        </>
      );

    case 'AGENT_CARD':
      return (
        <Hint>
          כרטיס הסוכן מציג את השם והתמונה מהפרופיל שלכם. כדי לעדכן, עברו ל-/profile.
        </Hint>
      );

    default:
      return null;
  }
}

// ── Tiny field primitives ────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="le-field">
      <span className="le-field-label">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }) {
  return <p className="le-field-hint">{children}</p>;
}

function Counter({ value, max }) {
  const n = (value || '').length;
  return <span className="le-counter">{n} / {max}</span>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="le-toggle">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ItemsList({ items, onChange, max }) {
  const set = (i, v) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, '']);
  return (
    <div className="le-items">
      {items.map((it, i) => (
        <div key={i} className="le-item-row">
          <input
            type="text"
            value={it}
            onChange={(e) => set(i, e.target.value)}
            placeholder={`פריט ${i + 1}`}
            maxLength={60}
          />
          <button type="button" onClick={() => remove(i)} aria-label="מחק פריט">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="le-item-add" onClick={add}>
          + הוסיפו פריט
        </button>
      )}
    </div>
  );
}

function PhotoPicker({ images, value, onChange, hint }) {
  if (!images.length) {
    return (
      <Hint>אין תמונות בנכס עדיין — העלו דרך ׳ניהול תמונות הנכס׳.</Hint>
    );
  }
  return (
    <>
      <div className="le-photo-grid">
        <button
          type="button"
          className={`le-photo ${!value ? 'is-on' : ''}`}
          onClick={() => onChange(null)}
          title="ברירת מחדל"
        >
          <ImageIcon size={20} />
          <span>אוטומטי</span>
        </button>
        {images.map((img) => (
          <button
            type="button"
            key={img.id}
            className={`le-photo ${value === img.id ? 'is-on' : ''}`}
            onClick={() => onChange(img.id)}
            style={{ backgroundImage: `url(${img.urlThumb || img.urlCard || img.url})` }}
            aria-label="בחר תמונה"
          />
        ))}
      </div>
      {hint && <Hint>{hint}</Hint>}
    </>
  );
}
