// /properties/:id/landing-editor — premium-only WYSIWYG-ish editor
// for the per-property landing page that lives at /l/<slug>/<slug>.
//
// Two-pane layout: sidebar with the section list + per-section form
// on the left, live preview rendered by LandingRenderer on the right.
// Autosave every 600 ms to localStorage so a tab close doesn't lose
// drafts; explicit "שמירה" button publishes via PATCH.
//
// Mobile (< 1024 px viewport): empty-state asks the agent to open
// the editor on a desktop. The editor's two-pane shape doesn't fold
// gracefully into a phone and the marketing surface this drives is
// inherently a desktop authoring task.

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Eye, EyeOff, GripVertical, Plus, Save, Smartphone, Monitor, Trash2, AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { track } from '../lib/analytics';
import LandingRenderer from './propertyLanding/LandingRenderer';
import SectionForm from './propertyLanding/SectionForm';
import { BLOCK_TYPES, REQUIRED_BLOCK_TYPES, newSection } from './propertyLanding/defaultConfig';
import './LandingEditor.css';

const VIEWPORT_MIN = 1100;
const AUTOSAVE_KEY = (id) => `estia-landing-draft-${id}`;

const TYPE_LABELS = {
  HERO: 'תמונת שער + כותרת',
  GALLERY: 'גלריית תמונות',
  DESCRIPTION: 'תיאור הנכס',
  AMENITIES: 'רשימת מאפיינים',
  NEIGHBORHOOD: 'על השכונה',
  VIDEO: 'סרטון',
  VIRTUAL_TOUR: 'סיור וירטואלי',
  FLOOR_PLAN: 'תוכנית קומה',
  SPECS: 'נתוני הנכס',
  INQUIRY: 'טופס יצירת קשר',
  AGENT_CARD: 'כרטיס הסוכן',
};

export default function LandingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [viewportOk, setViewportOk] = useState(window.innerWidth >= VIEWPORT_MIN);
  useEffect(() => {
    const onResize = () => setViewportOk(window.innerWidth >= VIEWPORT_MIN);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [property, setProperty] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [previewMode, setPreviewMode] = useState('desktop'); // 'desktop' | 'mobile'

  // ── Load property + saved config ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [pr, cfg] = await Promise.all([
          api.getProperty(id),
          api.getLandingConfig(id),
        ]);
        if (cancelled) return;
        const prop = pr?.property || pr;
        setProperty(prop);

        // localStorage draft wins over the saved server config — the
        // agent had unfinished work in this browser tab and we should
        // honor it. Server config is loaded as the "discard draft"
        // baseline.
        const draftRaw = readDraft(id);
        const initial = draftRaw || cfg?.config;
        if (initial) {
          setConfig(initial);
          setSelectedId(initial.sections?.[0]?.id || null);
          setDirty(!!draftRaw);
        }
        // PostHog — fired once per editor open. `hasExistingConfig`
        // separates "agent is iterating on a published page" from
        // "first time touching the editor for this property", which
        // matters for funnel analysis.
        track('landing_editor_opened', {
          propertyId: id,
          hasExistingConfig: !!cfg?.hasSaved,
          hadLocalDraft: !!draftRaw,
        });
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || 'טעינת הנכס נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Autosave drafts to localStorage ────────────────────────────
  const autosaveTimer = useRef(null);
  useEffect(() => {
    if (!config || !dirty) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY(id), JSON.stringify(config)); }
      catch { /* quota, private mode — ignore */ }
    }, 600);
    return () => clearTimeout(autosaveTimer.current);
  }, [config, dirty, id]);

  // ── Mutators ───────────────────────────────────────────────────
  const updateSection = (next) => {
    setConfig((cur) => ({
      ...cur,
      sections: cur.sections.map((s) => (s.id === next.id ? next : s)),
    }));
    setDirty(true);
  };
  const toggleVisible = (sectionId) => {
    setConfig((cur) => ({
      ...cur,
      sections: cur.sections.map((s) => (
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      )),
    }));
    setDirty(true);
  };
  const deleteSection = (sectionId) => {
    const s = config.sections.find((x) => x.id === sectionId);
    if (!s || REQUIRED_BLOCK_TYPES.has(s.type)) return;
    setConfig((cur) => ({
      ...cur,
      sections: cur.sections.filter((x) => x.id !== sectionId),
    }));
    if (selectedId === sectionId) setSelectedId(null);
    setDirty(true);
    track('landing_editor_section_removed', { propertyId: id, type: s.type });
  };
  const addSection = (type) => {
    const section = newSection(type);
    // Insert before the trailing AGENT_CARD if it exists; otherwise
    // append. Keeps the agent footer at the bottom by default.
    setConfig((cur) => {
      const footerIdx = cur.sections.findIndex((s) => s.type === 'AGENT_CARD');
      const insertAt = footerIdx >= 0 ? footerIdx : cur.sections.length;
      const next = [...cur.sections];
      next.splice(insertAt, 0, section);
      return { ...cur, sections: next };
    });
    setSelectedId(section.id);
    setDirty(true);
    track('landing_editor_section_added', { propertyId: id, type });
  };

  // ── Drag-reorder (native HTML5, same pattern as PropertyPhotoManager) ─
  const [dragId, setDragId] = useState(null);
  const onDragStart = (sectionId) => (e) => {
    setDragId(sectionId);
    try { e.dataTransfer.setData('text/plain', sectionId); } catch { /* */ }
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (targetId) => (e) => {
    e.preventDefault();
    const src = dragId;
    setDragId(null);
    if (!src || src === targetId) return;
    setConfig((cur) => {
      const from = cur.sections.findIndex((s) => s.id === src);
      const to = cur.sections.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur.sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...cur, sections: next };
    });
    setDirty(true);
  };

  // ── Save / publish ─────────────────────────────────────────────
  const onSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.saveLandingConfig(id, config);
      try { localStorage.removeItem(AUTOSAVE_KEY(id)); } catch { /* */ }
      setDirty(false);
      toast?.success?.('דף הנחיתה פורסם בהצלחה');
      // PostHog — captures the published shape so we can chart which
      // blocks agents actually use vs. ignore. `blocksUsed` only
      // includes visible sections (an agent who staged but hid a
      // block didn't ship it).
      const visible = config.sections.filter((s) => s.visible);
      track('landing_editor_published', {
        propertyId: id,
        sectionsCount: visible.length,
        blocksUsed: visible.map((s) => s.type),
        template: config.template,
      });
    } catch (e) {
      toast?.error?.(e?.message || 'שמירת דף הנחיתה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  // ── Photo upload from inside the editor ────────────────────────
  // PhotoPicker (in SectionForm) calls this for "+ העלאת תמונה".
  // We POST to /api/properties/:id/images (existing endpoint —
  // already runs the variant pipeline), then refetch the property
  // so the imageList in the picker shows the new photo and we
  // return its id so the picker can auto-select it.
  const uploadPhoto = async (file) => {
    const res = await api.uploadPropertyImage(id, file);
    const newImage = res?.image;
    try {
      const pr = await api.getProperty(id);
      setProperty(pr?.property || pr);
    } catch { /* refetch failed but image is uploaded — leave it */ }
    return newImage?.id || null;
  };

  const onDiscardDraft = () => {
    try { localStorage.removeItem(AUTOSAVE_KEY(id)); } catch { /* */ }
    // Reload server config
    api.getLandingConfig(id).then((cfg) => {
      if (cfg?.config) {
        setConfig(cfg.config);
        setSelectedId(cfg.config.sections?.[0]?.id || null);
        setDirty(false);
      }
    }).catch(() => {});
  };

  // ── Render guards ──────────────────────────────────────────────
  if (!viewportOk) {
    return (
      <div className="le-narrow">
        <Monitor size={48} aria-hidden="true" />
        <h1>פתחו במחשב לעריכה</h1>
        <p>עורך דף הנחיתה דורש מסך רחב מ-1100 פיקסלים. הקישור יישמר — חזרו ממחשב לשולחן עבודה.</p>
        <button className="btn btn-secondary" onClick={() => navigate(`/properties/${id}`)}>
          חזרה לנכס
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="le-loading">
        <div className="le-skel" />
      </div>
    );
  }

  if (loadErr || !property || !config) {
    return (
      <div className="le-error">
        <AlertCircle size={36} />
        <h1>לא הצלחנו לטעון את הנכס</h1>
        <p>{loadErr || 'אנא נסו שוב בעוד מספר רגעים.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate(`/properties/${id}`)}>
          חזרה לנכס
        </button>
      </div>
    );
  }

  const selected = config.sections.find((s) => s.id === selectedId);
  const availableToAdd = BLOCK_TYPES.filter((t) => {
    // HERO / INQUIRY / AGENT_CARD are required → can't add (there's
    // always exactly one). Everything else can be added even if one
    // already exists — an agent can repeat AMENITIES blocks for
    // "features" and "what's nearby", for example.
    if (REQUIRED_BLOCK_TYPES.has(t) && config.sections.some((s) => s.type === t)) return false;
    return true;
  });

  return (
    <div className="le-page">
      <header className="le-header">
        <button className="le-back" onClick={() => navigate(`/properties/${id}`)} aria-label="חזרה לנכס">
          <ArrowRight size={18} />
          חזרה
        </button>
        <div className="le-title">
          <h1>עריכת דף נחיתה</h1>
          <p>{property.street}{property.city ? `, ${property.city}` : ''}</p>
        </div>
        <div className="le-actions">
          {dirty && (
            <button className="le-discard" onClick={onDiscardDraft} title="חזרה לגרסה השמורה">
              ביטול שינויים
            </button>
          )}
          <button
            className="btn btn-primary le-save"
            onClick={onSave}
            disabled={saving || !dirty}
          >
            <Save size={16} />
            {saving ? 'שומר…' : dirty ? 'שמירה' : 'נשמר'}
          </button>
        </div>
      </header>

      <div className="le-body">
        {/* Column 1 — STRUCTURE: global theme + ordered section list +
            add menu. Narrow column (240 px), nothing here is type-
            specific, so it stays compact while the agent focuses on
            the details column. */}
        <aside className="le-structure">
          <ThemePanel
            theme={config.theme || { font: 'DEFAULT', palette: 'CREAM_GOLD' }}
            onChange={(theme) => {
              setConfig((cur) => ({ ...cur, theme }));
              setDirty(true);
            }}
          />
          <h2 className="le-sidebar-title">סקציות</h2>
          <ul className="le-section-list">
            {config.sections.map((section) => {
              const isSelected = section.id === selectedId;
              const isRequired = REQUIRED_BLOCK_TYPES.has(section.type);
              return (
                <li
                  key={section.id}
                  className={`le-section-row ${isSelected ? 'is-on' : ''} ${dragId === section.id ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={onDragStart(section.id)}
                  onDragOver={onDragOver}
                  onDrop={onDrop(section.id)}
                  onClick={() => setSelectedId(section.id)}
                >
                  <GripVertical size={14} className="le-grip" aria-hidden="true" />
                  <span className="le-section-name">{TYPE_LABELS[section.type] || section.type}</span>
                  <button
                    type="button"
                    className="le-eye"
                    title={section.visible ? 'הסתר סקציה' : 'הצג סקציה'}
                    onClick={(e) => { e.stopPropagation(); toggleVisible(section.id); }}
                  >
                    {section.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  {!isRequired && (
                    <button
                      type="button"
                      className="le-del"
                      title="הסר סקציה"
                      onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {availableToAdd.length > 0 && (
            <details className="le-add">
              <summary>
                <Plus size={14} /> הוסיפו סקציה
              </summary>
              <ul className="le-add-menu">
                {availableToAdd.map((t) => (
                  <li key={t}>
                    <button type="button" onClick={() => addSection(t)}>
                      {TYPE_LABELS[t]}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>

        {/* Column 2 — DETAILS: the selected section's full form,
            visible without scrolling past the section list. Empty
            state nudges the agent to click a section in column 1. */}
        <section className="le-details">
          {selected ? (
            <>
              <header className="le-details-head">
                <div>
                  <span className="le-details-eyebrow">סקציה נבחרה</span>
                  <h2>{TYPE_LABELS[selected.type]}</h2>
                </div>
                <div className="le-details-actions">
                  <button
                    type="button"
                    className="le-details-eye"
                    title={selected.visible ? 'הסתר סקציה' : 'הצג סקציה'}
                    onClick={() => toggleVisible(selected.id)}
                  >
                    {selected.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    <span>{selected.visible ? 'מוצגת' : 'מוסתרת'}</span>
                  </button>
                  {!REQUIRED_BLOCK_TYPES.has(selected.type) && (
                    <button
                      type="button"
                      className="le-details-del"
                      title="הסר סקציה זו"
                      onClick={() => deleteSection(selected.id)}
                    >
                      <Trash2 size={15} /> הסר
                    </button>
                  )}
                </div>
              </header>
              <div className="le-details-body">
                <SectionForm
                  section={selected}
                  template={config.template}
                  property={property}
                  onChange={updateSection}
                  onUploadPhoto={uploadPhoto}
                />
              </div>
            </>
          ) : (
            <div className="le-details-empty">
              <p>בחרו סקציה מהרשימה משמאל כדי לערוך אותה.</p>
            </div>
          )}
        </section>

        <main className={`le-preview le-preview-${previewMode}`}>
          <div className="le-preview-toolbar">
            <button
              type="button"
              className={previewMode === 'desktop' ? 'is-on' : ''}
              onClick={() => setPreviewMode('desktop')}
              aria-label="תצוגת דסקטופ"
            >
              <Monitor size={14} /> דסקטופ
            </button>
            <button
              type="button"
              className={previewMode === 'mobile' ? 'is-on' : ''}
              onClick={() => setPreviewMode('mobile')}
              aria-label="תצוגת מובייל"
            >
              <Smartphone size={14} /> מובייל
            </button>
            {dirty && <span className="le-draft-pill">טיוטה לא שמורה</span>}
          </div>
          <div className="le-preview-frame">
            <LandingRenderer
              config={config}
              property={property}
              agent={agentShape(user)}
              inquiryDisabled
              lazyBelowFold={false}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function ThemePanel({ theme, onChange }) {
  const set = (key, value) => onChange({ ...theme, [key]: value });
  return (
    <div className="le-theme">
      <h2 className="le-sidebar-title">מראה כללי</h2>
      <div className="le-theme-row">
        <span className="le-theme-row-label">גופן</span>
        <div className="le-segmented">
          {[
            { v: 'DEFAULT', label: 'קלאסי' },
            { v: 'MODERN',  label: 'מודרני' },
            { v: 'CLASSIC', label: 'אקדמי' },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              className={`le-seg ${theme.font === opt.v ? 'is-on' : ''}`}
              onClick={() => set('font', opt.v)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="le-theme-row">
        <span className="le-theme-row-label">פלטה</span>
        <div className="le-palette-row">
          {[
            { v: 'CREAM_GOLD',      label: 'קרם וזהב',     colors: ['#faf7f1', '#b48b4c'] },
            { v: 'CHARCOAL_BRONZE', label: 'פחם וברונזה',  colors: ['#1a1612', '#c89967'] },
            { v: 'OLIVE_SAND',      label: 'זית וחול',      colors: ['#f3eedf', '#6e7a3e'] },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              className={`le-palette ${theme.palette === opt.v ? 'is-on' : ''}`}
              onClick={() => set('palette', opt.v)}
              title={opt.label}
            >
              <span className="le-palette-swatch" style={{ background: opt.colors[0] }} />
              <span className="le-palette-swatch" style={{ background: opt.colors[1] }} />
              <span className="le-palette-name">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function agentShape(user) {
  if (!user) return null;
  return {
    id: user.id,
    slug: user.slug,
    displayName: user.displayName || user.name || user.email,
    avatarUrl: user.avatarUrl || null,
  };
}

function readDraft(id) {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sections) return null;
    return parsed;
  } catch {
    return null;
  }
}
