import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  Save,
  Sparkles,
  Home,
  Building2,
  KeyRound,
  ArrowLeftRight,
  Plus,
  AlertCircle,
  X,
  ChevronLeft,
  Check,
  Eye,
  Pencil,
  Zap,
  MapPin,
  CircleDollarSign,
  User,
  Info,
  RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast, optimisticUpdate } from '../lib/toast';
import {
  TEMPLATE_KINDS,
  PLACEHOLDERS,
  LABEL_OF,
  VAR_GROUPS,
  PRESETS,
  PRESET_LABELS,
  buildVariables,
  renderTemplate,
} from '../lib/templates';
import ChipEditor from '../components/ChipEditor';
import './Templates.css';

const KIND_ICON = {
  BUY_PRIVATE:     Home,
  RENT_PRIVATE:    KeyRound,
  BUY_COMMERCIAL:  Building2,
  RENT_COMMERCIAL: Building2,
  TRANSFER:        ArrowLeftRight,
};

const GROUP_ICON = {
  property: Home,
  location: MapPin,
  price:    CircleDollarSign,
  features: Sparkles,
  agent:    User,
};

export default function Templates() {
  const toast = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [kind, setKind] = useState('BUY_PRIVATE');
  // drafts[kind] = current editor value. Preserves work across tab switches.
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState({});
  const [savedKinds, setSavedKinds] = useState({});  // flash checkmark
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState([]);
  const [previewPropId, setPreviewPropId] = useState(null);
  const [mobileMode, setMobileMode] = useState('edit'); // 'edit' | 'preview'
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef(null);

  // ── Load templates + properties ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, p] = await Promise.all([
          api.listTemplates(),
          api.listProperties({ mine: '1' }).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setTemplates(t.templates || []);
        setProperties(p.items || []);
        // Seed drafts from loaded templates
        const ds = {};
        (t.templates || []).forEach((x) => { ds[x.kind] = x.body; });
        setDrafts(ds);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When kind changes, align preview property to its best match
  useEffect(() => {
    const best = bestPreviewProperty(properties, kind);
    setPreviewPropId(best?.id || properties[0]?.id || null);
  }, [kind, properties]);

  const currentMeta = templates.find((t) => t.kind === kind);
  const draft = drafts[kind] ?? '';
  const isDirty = !!dirty[kind];
  const justSaved = !!savedKinds[kind];

  const previewProperty = useMemo(
    () => properties.find((p) => p.id === previewPropId) || null,
    [properties, previewPropId]
  );

  const variables = useMemo(
    () => buildVariables(previewProperty, user, { stripAgent: kind === 'TRANSFER' }),
    [previewProperty, user, kind]
  );

  const rendered = useMemo(
    () => renderTemplate(draft, variables),
    [draft, variables]
  );

  // ── Handlers ────────────────────────────────────────────────
  const updateDraft = (next) => {
    setDrafts((d) => ({ ...d, [kind]: next }));
    setDirty((d) => ({ ...d, [kind]: true }));
    setSavedKinds((s) => ({ ...s, [kind]: false }));
  };

  const insertVariable = (key) => {
    editorRef.current?.insertVariable(key, LABEL_OF[key] || key);
  };

  const applyPreset = (presetId) => {
    const preset = PRESETS[kind]?.[presetId];
    if (!preset) return;
    setDrafts((d) => ({ ...d, [kind]: preset }));
    setDirty((d) => ({ ...d, [kind]: true }));
    setSavedKinds((s) => ({ ...s, [kind]: false }));
    toast.success(`הוחלף ל"${PRESET_LABELS.find((p) => p.id === presetId)?.title}"`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await optimisticUpdate(toast, {
        label: 'שומר…',
        success: 'נשמר בהצלחה',
        onSave: async () => {
          const r = await api.saveTemplate(kind, draft);
          setTemplates((cur) => {
            const existing = cur.find((t) => t.kind === kind);
            if (existing) return cur.map((t) => (t.kind === kind ? r.template : t));
            return [...cur, r.template];
          });
        },
      });
      setDirty((d) => ({ ...d, [kind]: false }));
      setSavedKinds((s) => ({ ...s, [kind]: true }));
      setTimeout(() => {
        setSavedKinds((s) => ({ ...s, [kind]: false }));
      }, 1800);
    } catch { /* toast handled */ }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm('להחזיר לברירת המחדל? הנוסח הנוכחי יוחלף.')) return;
    setSaving(true);
    try {
      const r = await api.resetTemplate(kind);
      setTemplates((cur) => {
        const next = { kind, body: r.body, custom: false, updatedAt: null };
        const existing = cur.find((t) => t.kind === kind);
        return existing ? cur.map((t) => (t.kind === kind ? next : t)) : [...cur, next];
      });
      setDrafts((d) => ({ ...d, [kind]: r.body }));
      setDirty((d) => ({ ...d, [kind]: false }));
      toast.success('הוחזר לברירת מחדל');
    } catch (e) {
      toast.error(e.message || 'איפוס נכשל');
    }
    setSaving(false);
  };

  return (
    <div className="tpl-page app-wide-cap">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <header className="tpl-hero animate-in">
        <div className="tpl-hero-meta">
          <span className="tpl-hero-eyebrow">
            <Sparkles size={12} /> סטודיו הודעות
          </span>
          <h2>תבניות הודעת ווטסאפ</h2>
          <p>
            כתוב פעם אחת — המערכת תמלא אוטומטית מפרטי כל נכס.
            <br className="only-desktop" />
            בחר שדה — הוא יופיע כגלולה זהובה בתוך ההודעה.
          </p>
        </div>
        <div className="tpl-hero-flare" aria-hidden="true">
          <svg viewBox="0 0 160 160" width="100%" height="100%">
            <defs>
              <radialGradient id="tplGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="80" cy="80" r="70" fill="url(#tplGlow)" />
            <g stroke="var(--gold)" strokeOpacity="0.3" strokeWidth="1" fill="none">
              <circle cx="80" cy="80" r="58" />
              <circle cx="80" cy="80" r="42" />
              <circle cx="80" cy="80" r="26" />
            </g>
          </svg>
        </div>
      </header>

      {/* ── Kind tabs (top, mobile + tablet ≤1099 px) ───────────── */}
      <nav className="tpl-kinds tpl-kinds-top animate-in animate-in-delay-1" aria-label="סוגי תבנית">
        {TEMPLATE_KINDS.map((k) => {
          const Icon = KIND_ICON[k.key] || Home;
          const meta = templates.find((t) => t.kind === k.key);
          const d = !!dirty[k.key];
          return (
            <button
              key={k.key}
              className={`tpl-kind ${kind === k.key ? 'active' : ''}`}
              onClick={() => setKind(k.key)}
              type="button"
            >
              <span className="tpl-kind-icon"><Icon size={16} /></span>
              <span className="tpl-kind-text">
                <strong>{k.label}</strong>
                <small>{k.subtitle}</small>
              </span>
              {(meta?.custom || d) && (
                <span className="tpl-kind-flag" title={d ? 'שינויים לא שמורים' : 'מותאם אישית'}>
                  {d ? <span className="dot-dirty" /> : <span className="dot-gold" />}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Mobile mode toggle ─────────────────────────────────── */}
      <div className="tpl-mode-toggle only-mobile animate-in animate-in-delay-1">
        <button
          className={mobileMode === 'edit' ? 'active' : ''}
          onClick={() => setMobileMode('edit')}
          type="button"
        >
          <Pencil size={14} /> עריכה
        </button>
        <button
          className={mobileMode === 'preview' ? 'active' : ''}
          onClick={() => setMobileMode('preview')}
          type="button"
        >
          <Eye size={14} /> תצוגה
        </button>
      </div>

      {loading ? (
        <div className="tpl-skel skel" />
      ) : (
        <div className="tpl-shell">
          {/* ── Vertical kind rail (≥1100 px only) ───────────────── */}
          <nav className="tpl-kinds-rail animate-in animate-in-delay-1" aria-label="סוגי תבנית">
            {TEMPLATE_KINDS.map((k) => {
              const Icon = KIND_ICON[k.key] || Home;
              const meta = templates.find((t) => t.kind === k.key);
              const d = !!dirty[k.key];
              return (
                <button
                  key={k.key}
                  className={`tpl-kind ${kind === k.key ? 'active' : ''}`}
                  onClick={() => setKind(k.key)}
                  type="button"
                >
                  <span className="tpl-kind-icon"><Icon size={16} /></span>
                  <span className="tpl-kind-text">
                    <strong>{k.label}</strong>
                    <small>{k.subtitle}</small>
                  </span>
                  {(meta?.custom || d) && (
                    <span className="tpl-kind-flag" title={d ? 'שינויים לא שמורים' : 'מותאם אישית'}>
                      {d ? <span className="dot-dirty" /> : <span className="dot-gold" />}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

        <div className={`tpl-workspace mode-${mobileMode}`}>
          {/* ═══════ EDITOR COLUMN ═══════ */}
          <section className="tpl-panel tpl-edit animate-in animate-in-delay-2">
            {/* Presets row */}
            <div className="tpl-section">
              <div className="tpl-section-head">
                <Zap size={13} />
                <span>התחלה מהירה</span>
                <small>לחץ כדי להחליף נוסח</small>
              </div>
              <div className="tpl-presets">
                {PRESET_LABELS.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`tpl-preset tpl-preset-${p.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyPreset(p.id)}
                  >
                    <span className="tpl-preset-num">0{i + 1}</span>
                    <span className="tpl-preset-body">
                      <strong>{p.title}</strong>
                      <small>{p.subtitle}</small>
                    </span>
                    <span className="tpl-preset-arr">↓</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor + toolbar */}
            <div className="tpl-section tpl-editor-wrap">
              <div className="tpl-editor-head">
                <div className="tpl-editor-head-meta">
                  <Pencil size={13} />
                  <span>הנוסח שלך</span>
                  {currentMeta?.custom ? (
                    <span className="tpl-badge tpl-badge-custom">מותאם</span>
                  ) : (
                    <span className="tpl-badge tpl-badge-default">ברירת מחדל</span>
                  )}
                </div>
                <button
                  type="button"
                  className="tpl-linkbtn"
                  onClick={handleReset}
                  disabled={saving}
                  title="החזר לברירת מחדל"
                >
                  <RotateCcw size={12} />
                  איפוס
                </button>
              </div>

              <ChipEditor
                ref={editorRef}
                value={draft}
                onChange={updateDraft}
                labelOf={LABEL_OF}
                variableValues={variables}
                placeholder="הקלד את נוסח ההודעה כאן. לחץ על גלולה מצד ימין כדי להכניס שדה שימולא אוטומטית."
              />

              {/* Inline variable picker — desktop only */}
              <div className="tpl-vars only-desktop">
                <div className="tpl-vars-head">
                  <Plus size={12} />
                  <span>הוסף שדה לתבנית</span>
                  <small>לחיצה תוסיף גלולה זהובה בתוך ההודעה</small>
                </div>
                <div className="tpl-vars-groups">
                  {VAR_GROUPS.map((g) => {
                    const GIcon = GROUP_ICON[g.id] || Sparkles;
                    const disabled = kind === 'TRANSFER' && g.transferable === false;
                    return (
                      <div
                        key={g.id}
                        className={`tpl-vars-group ${disabled ? 'disabled' : ''}`}
                      >
                        <div className="tpl-vars-group-head">
                          <span className="tpl-vars-group-icon"><GIcon size={14} /></span>
                          <strong>{g.title}</strong>
                          {disabled && <em>לא בהעברה</em>}
                        </div>
                        <div className="tpl-vars-group-chips">
                          {g.keys.map((k) => {
                            const ph = PLACEHOLDERS.find((p) => p.key === k);
                            if (!ph) return null;
                            const val = variables[k];
                            return (
                              <button
                                key={k}
                                type="button"
                                disabled={disabled}
                                className="tpl-var-btn"
                                // KEY: preventDefault on mousedown stops the
                                // button from stealing focus from the editor,
                                // so the cursor stays where the user left it.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => insertVariable(k)}
                              >
                                <span className="tpl-var-btn-label">{ph.label}</span>
                                {val && (
                                  <span className="tpl-var-btn-val" title={String(val)}>
                                    {String(val).length > 18
                                      ? String(val).slice(0, 17) + '…'
                                      : val}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Floating add-field button — mobile only */}
              <button
                className="tpl-add-fab only-mobile"
                type="button"
                onClick={() => setPickerOpen(true)}
              >
                <Plus size={18} />
                הוסף שדה
              </button>
            </div>
          </section>

          {/* ═══════ PREVIEW COLUMN ═══════ */}
          <section className="tpl-panel tpl-preview animate-in animate-in-delay-3">
            <div className="tpl-section">
              <div className="tpl-section-head">
                <Eye size={13} />
                <span>תצוגה חיה</span>
                {previewProperty && <small>מתוך נכס אמיתי שלך</small>}
              </div>

              {properties.length > 1 && (
                <div className="tpl-prop-picker">
                  <select
                    value={previewPropId || ''}
                    onChange={(e) => setPreviewPropId(e.target.value)}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.street}, {p.city}
                      </option>
                    ))}
                  </select>
                  <RefreshCw size={12} />
                </div>
              )}

              {!previewProperty ? (
                <div className="tpl-noprop">
                  <AlertCircle size={22} />
                  <p>
                    עוד אין נכסים לתצוגה מקדימה.
                    <br />
                    הוסף נכס ראשון כדי לראות איך ההודעה תיראה.
                  </p>
                </div>
              ) : (
                <PhoneMockup
                  property={previewProperty}
                  text={rendered}
                  agentName={user?.displayName || 'הסוכן'}
                />
              )}
            </div>

            {/* Reassuring help strip */}
            <div className="tpl-tip">
              <Info size={14} />
              <div>
                <strong>איך זה עובד?</strong>
                <span>
                  הגלולות בזהב מתחלפות אוטומטית בפרטי הנכס בעת שליחת ההודעה. כל נכס —
                  הערכים שלו.
                </span>
              </div>
            </div>
          </section>
        </div>
        </div>
      )}

      {/* ── Sticky save bar ────────────────────────────────────── */}
      <div className={`tpl-savebar ${isDirty ? 'visible' : ''}`}>
        <div className="tpl-savebar-inner">
          <span className="tpl-savebar-note">
            {justSaved ? (
              <>
                <Check size={14} /> הנוסח נשמר
              </>
            ) : (
              <>
                <span className="dot-dirty" /> יש שינויים שלא נשמרו
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            <Save size={14} />
            {saving ? 'שומר…' : 'שמור תבנית'}
          </button>
        </div>
      </div>

      {/* ── Mobile variable picker sheet ───────────────────────── */}
      {pickerOpen && (
        <VariableSheet
          kind={kind}
          variables={variables}
          onClose={() => setPickerOpen(false)}
          onPick={(k) => {
            insertVariable(k);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Phone mockup — a realistic iPhone + WhatsApp bubble showing the
// rendered template filled with real property data.
// ────────────────────────────────────────────────────────────
function PhoneMockup({ property, text, agentName }) {
  const now = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="phone">
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-status">
          <span className="phone-status-time">9:41</span>
          <span className="phone-status-icons">
            <span className="phone-sig" />
            <span className="phone-wifi" />
            <span className="phone-bat" />
          </span>
        </div>
        <div className="phone-wa-bar">
          <button className="phone-wa-back" type="button" aria-hidden="true">
            <ChevronLeft size={18} />
          </button>
          <div className="phone-wa-contact">
            <div className="phone-wa-avatar">
              {(property.city || 'ל').charAt(0)}
            </div>
            <div className="phone-wa-names">
              <strong>לקוח</strong>
              <small>מקוון</small>
            </div>
          </div>
        </div>
        <div className="phone-wa-body">
          <div className="phone-wa-bubble">
            {text.split('\n').map((line, i) =>
              line.trim() === '' ? (
                <br key={i} />
              ) : (
                <div key={i} className="phone-wa-line">
                  {formatBold(line)}
                </div>
              )
            )}
            <div className="phone-wa-meta">
              {now} <span className="phone-wa-ticks">✓✓</span>
            </div>
          </div>
          <small className="phone-wa-sender">{agentName}</small>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bottom sheet variable picker for mobile
// ────────────────────────────────────────────────────────────
function VariableSheet({ kind, variables, onClose, onPick }) {
  const [query, setQuery] = useState('');
  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const q = query.trim();
  return (
    <div className="tpl-sheet-back" onClick={onClose} role="dialog">
      <div className="tpl-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-sheet-handle" />
        <header className="tpl-sheet-head">
          <h3>הוסף שדה אוטומטי</h3>
          <button type="button" className="tpl-sheet-close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <input
          type="search"
          className="tpl-sheet-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש שדה…"
          autoFocus={false}
        />
        <div className="tpl-sheet-body">
          {VAR_GROUPS.map((g) => {
            const GIcon = GROUP_ICON[g.id] || Sparkles;
            const disabled = kind === 'TRANSFER' && g.transferable === false;
            if (disabled) return null;
            const keys = g.keys.filter((k) => {
              if (!q) return true;
              const ph = PLACEHOLDERS.find((p) => p.key === k);
              return ph?.label.includes(q);
            });
            if (!keys.length) return null;
            return (
              <div key={g.id} className="tpl-sheet-group">
                <div className="tpl-sheet-group-head">
                  <GIcon size={14} />
                  <strong>{g.title}</strong>
                  <small>{g.hint}</small>
                </div>
                <div className="tpl-sheet-group-grid">
                  {keys.map((k) => {
                    const ph = PLACEHOLDERS.find((p) => p.key === k);
                    if (!ph) return null;
                    const v = variables[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        className="tpl-sheet-chip"
                        onClick={() => onPick(k)}
                      >
                        <strong>{ph.label}</strong>
                        {v ? (
                          <small>
                            {String(v).length > 22 ? String(v).slice(0, 21) + '…' : v}
                          </small>
                        ) : (
                          <small className="muted">—</small>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Best-match property for preview
function bestPreviewProperty(props, kind) {
  if (!props?.length) return null;
  const match = {
    BUY_PRIVATE:     (p) => p.assetClass === 'RESIDENTIAL' && p.category === 'SALE',
    RENT_PRIVATE:    (p) => p.assetClass === 'RESIDENTIAL' && p.category === 'RENT',
    BUY_COMMERCIAL:  (p) => p.assetClass === 'COMMERCIAL'  && p.category === 'SALE',
    RENT_COMMERCIAL: (p) => p.assetClass === 'COMMERCIAL'  && p.category === 'RENT',
    TRANSFER:        () => true,
  }[kind];
  return props.find(match) || props[0];
}

// WhatsApp-style *bold* renderer
function formatBold(text) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    /^\*[^*]+\*$/.test(p)
      ? <strong key={i}>{p.slice(1, -1)}</strong>
      : <span key={i}>{p}</span>
  );
}
