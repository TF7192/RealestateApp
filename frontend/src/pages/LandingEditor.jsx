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
import LandingRenderer from './propertyLanding/LandingRenderer';
import SectionForm from './propertyLanding/SectionForm';
import { BLOCK_TYPES, REQUIRED_BLOCK_TYPES, newSection } from './propertyLanding/defaultConfig';
import './LandingEditor.css';

const VIEWPORT_MIN = 1024;
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
    } catch (e) {
      toast?.error?.(e?.message || 'שמירת דף הנחיתה נכשלה');
    } finally {
      setSaving(false);
    }
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
        <p>עורך דף הנחיתה דורש מסך רחב מ-1024 פיקסלים. הקישור יישמר — חזרו ממחשב לשולחן עבודה.</p>
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
        <aside className="le-sidebar">
          <h2 className="le-sidebar-title">סדר וסקצריות</h2>
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

          {selected && (
            <div className="le-form">
              <h3 className="le-form-title">
                {TYPE_LABELS[selected.type]}
              </h3>
              <SectionForm
                section={selected}
                template={config.template}
                property={property}
                onChange={updateSection}
              />
            </div>
          )}
        </aside>

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
            />
          </div>
        </main>
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
