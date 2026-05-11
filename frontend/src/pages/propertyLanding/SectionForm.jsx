// Per-section form. Renders the right input fields for whichever
// block type the agent has selected in the editor sidebar.
//
// One file, switch on type, no abstraction layer. The eleven block
// types each have 1–5 fields and the schema is stable — pulling
// each block into its own file would be more bureaucracy than help.

import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload, Loader2 } from 'lucide-react';
import { templateCopy } from './copy.he';
import { FONT_OPTIONS } from './fontStacks';

export default function SectionForm({ section, template, property, onChange, onUploadPhoto }) {
  return (
    <>
      <TypeSpecificForm
        section={section}
        template={template}
        property={property}
        onChange={onChange}
        onUploadPhoto={onUploadPhoto}
      />
      <ThemeOverrides
        theme={section.theme}
        onChange={(theme) => onChange({ ...section, theme })}
      />
    </>
  );
}

function TypeSpecificForm({ section, template, property, onChange, onUploadPhoto }) {
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
              onUpload={onUploadPhoto}
              hint="ברירת מחדל: התמונה הראשונה של הנכס"
            />
          </Field>
          <Field label="סגנון תצוגה">
            <VariantRadio
              value={section.props.variant || 'IMAGE'}
              onChange={(v) => update('variant', v)}
              options={[
                { value: 'IMAGE',  label: 'תמונה מלאה',     hint: 'תמונה מלאת מסך עם טקסט מעליה' },
                { value: 'SPLIT',  label: 'תמונה + טקסט',   hint: 'תמונה בחצי מהמסך, טקסט בחצי השני' },
                { value: 'BANNER', label: 'באנר עם כרטיס', hint: 'תמונה למעלה, כרטיס טקסט קרם מתחתיה' },
              ]}
            />
          </Field>

          {/* Per-variant tuning. Each control only shows when its
              parent variant is selected, so the form stays focused. */}
          {(section.props.variant || 'IMAGE') === 'IMAGE' && (
            <Field label="עוצמת הצללה על התמונה">
              <SegmentedSelect
                value={section.props.imageOverlay || 'MEDIUM'}
                onChange={(v) => update('imageOverlay', v)}
                options={[
                  { value: 'NONE',   label: 'ללא' },
                  { value: 'LIGHT',  label: 'קלה' },
                  { value: 'MEDIUM', label: 'בינונית' },
                  { value: 'DARK',   label: 'חזקה' },
                ]}
              />
              <Hint>אם הטקסט קשה לקריאה על התמונה — הגבירו.</Hint>
            </Field>
          )}

          {(section.props.variant || 'IMAGE') === 'SPLIT' && (
            <Field label="מיקום התמונה">
              <SegmentedSelect
                value={section.props.splitSide || 'START'}
                onChange={(v) => update('splitSide', v)}
                options={[
                  { value: 'START', label: 'תמונה בצד התחלה' },
                  { value: 'END',   label: 'תמונה בצד סיום' },
                ]}
              />
            </Field>
          )}

          {(section.props.variant || 'IMAGE') === 'BANNER' && (
            <Field label="גובה התמונה">
              <SegmentedSelect
                value={section.props.bannerHeight || 'DEFAULT'}
                onChange={(v) => update('bannerHeight', v)}
                options={[
                  { value: 'SHORT',   label: 'קצר' },
                  { value: 'DEFAULT', label: 'רגיל' },
                  { value: 'TALL',    label: 'גבוה' },
                ]}
              />
            </Field>
          )}

          <Field label="יישור טקסט">
            <SegmentedSelect
              value={section.props.textAlign || 'START'}
              onChange={(v) => update('textAlign', v)}
              options={[
                { value: 'START',  label: 'התחלה' },
                { value: 'CENTER', label: 'מרכז' },
                { value: 'END',    label: 'סיום' },
              ]}
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
              onUpload={onUploadPhoto}
              hint="ניתן להעלות תמונה חדשה כאן או לבחור מתמונות הנכס הקיימות."
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

function ThemeOverrides({ theme = {}, onChange }) {
  const set = (key, value) => {
    const next = { ...theme, [key]: value };
    // Drop empty fields so the saved config doesn't accumulate
    // null/empty noise — the schema treats `undefined` as
    // "inherit global", which is the agent's intent when they
    // clear a picker.
    Object.keys(next).forEach((k) => {
      if (next[k] === '' || next[k] == null) delete next[k];
    });
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <details className="le-theme-overrides">
      <summary>מראה הסקציה</summary>
      <div className="le-theme-overrides-body">
        <Field label="גופן">
          <select
            value={theme.font || 'DEFAULT'}
            onChange={(e) => set('font', e.target.value === 'DEFAULT' ? '' : e.target.value)}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>
        <ColorField label="רקע" value={theme.bg} onChange={(v) => set('bg', v)} />
        <ColorField label="טקסט" value={theme.ink} onChange={(v) => set('ink', v)} />
        <ColorField label="צבע הדגשה (כפתורים / אייקונים)" value={theme.accent} onChange={(v) => set('accent', v)} />
        {(theme.font || theme.bg || theme.ink || theme.accent) && (
          <button
            type="button"
            className="le-theme-reset"
            onClick={() => onChange(undefined)}
          >
            איפוס לברירת מחדל
          </button>
        )}
      </div>
    </details>
  );
}

function ColorField({ label, value, onChange }) {
  // <input type="color"> always produces a value; track "unset"
  // separately via the explicit unset button. Empty value renders
  // the swatch in the default state.
  return (
    <Field label={label}>
      <div className="le-color-field">
        <input
          type="color"
          value={value || '#b48b4c'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v) || v === '') onChange(v);
          }}
          placeholder="#b48b4c"
          dir="ltr"
          maxLength={7}
          className="le-color-hex"
        />
        {value && (
          <button
            type="button"
            className="le-color-clear"
            onClick={() => onChange('')}
            aria-label="נקה צבע"
          >
            ✕
          </button>
        )}
      </div>
    </Field>
  );
}

function SegmentedSelect({ value, onChange, options }) {
  return (
    <div className="le-seg-row">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`le-seg-btn ${value === opt.value ? 'is-on' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function VariantRadio({ value, onChange, options }) {
  return (
    <div className="le-variant-radio">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`le-variant-opt ${value === opt.value ? 'is-on' : ''}`}
        >
          <input
            type="radio"
            name="hero-variant"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="le-variant-label">{opt.label}</span>
          <span className="le-variant-hint">{opt.hint}</span>
        </label>
      ))}
    </div>
  );
}

function PhotoPicker({ images, value, onChange, hint, onUpload }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const pick = async (file) => {
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const newId = await onUpload(file);
      if (newId) onChange(newId);
    } catch (e) {
      setErr(e?.message || 'העלאה נכשלה');
    } finally {
      setUploading(false);
    }
  };

  // Empty state with upload still available — first photo can come
  // from right here, no need to bounce out to the photo manager.
  if (!images.length) {
    return (
      <>
        {onUpload ? (
          <>
            <UploadButton
              fileRef={fileRef}
              onPick={pick}
              uploading={uploading}
              variant="empty"
            />
            {err && <Hint>{err}</Hint>}
          </>
        ) : (
          <Hint>אין תמונות בנכס עדיין — העלו דרך ׳ניהול תמונות הנכס׳.</Hint>
        )}
      </>
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
        {onUpload && (
          <UploadButton
            fileRef={fileRef}
            onPick={pick}
            uploading={uploading}
            variant="tile"
          />
        )}
      </div>
      {err && <Hint>{err}</Hint>}
      {hint && <Hint>{hint}</Hint>}
    </>
  );
}

function UploadButton({ fileRef, onPick, uploading, variant }) {
  const open = () => fileRef.current?.click();
  return (
    <>
      <button
        type="button"
        className={`le-photo le-photo-upload ${variant === 'empty' ? 'is-empty' : ''}`}
        onClick={open}
        disabled={uploading}
      >
        {uploading ? <Loader2 size={20} className="le-spin" /> : <Upload size={20} />}
        <span>{uploading ? 'מעלה…' : 'העלאה'}</span>
      </button>
      {/* Same MIME / extension permissiveness as the photo manager
          so HEIC / JFIF / empty-MIME files from Chrome on Windows
          don't get silently dropped. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif,.jfif"
        className="le-file-hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files[0]) onPick(files[0]);
        }}
      />
    </>
  );
}
