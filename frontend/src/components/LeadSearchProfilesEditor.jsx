import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Save, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, Search,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { NumberField, SelectField, Segmented } from './SmartFields';
import EmptyState from './EmptyState';
import './LeadSearchProfilesEditor.css';

// ──────────────────────────────────────────────────────────────────
// LeadSearchProfilesEditor — repeatable search-profile manager on a
// lead (MLS K4). Each lead can define any number of "profiles" — a
// named set of search criteria (label + domain + dealType + filters).
// Adding a profile creates it server-side; saves are per-row via PATCH.
//
// Props:
//   leadId     required
//   onChange?  optional callback (profiles[]) => void after every mutation
// ──────────────────────────────────────────────────────────────────

const DOMAIN_OPTS = [
  { value: '',             label: 'כל סוג' },
  { value: 'RESIDENTIAL',  label: 'מגורים' },
  { value: 'COMMERCIAL',   label: 'מסחרי' },
];

const DEAL_OPTS = [
  { value: '',     label: 'הכל' },
  { value: 'SALE', label: 'מכירה' },
  { value: 'RENT', label: 'השכרה' },
];

const BOOL_REQ_KEYS = [
  ['parkingReq',   'חניה'],
  ['elevatorReq',  'מעלית'],
  ['balconyReq',   'מרפסת'],
  ['furnitureReq', 'ריהוט'],
  ['mamadReq',     'ממ״ד'],
  ['storeroomReq', 'מחסן'],
];

function emptyProfile() {
  return {
    label: '',
    domain: '',
    dealType: '',
    propertyTypes: [],
    cities: [],
    neighborhoods: [],
    streets: [],
    minRoom: null,
    maxRoom: null,
    minPrice: null,
    maxPrice: null,
    minFloor: null,
    maxFloor: null,
    minBuilt: null,
    maxBuilt: null,
    parkingReq: false,
    elevatorReq: false,
    balconyReq: false,
    furnitureReq: false,
    mamadReq: false,
    storeroomReq: false,
  };
}

export default function LeadSearchProfilesEditor({ leadId, onChange }) {
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listLeadSearchProfiles(leadId);
      setProfiles(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת פרופילי חיפוש נכשלה');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createLeadSearchProfile(leadId, {
        ...emptyProfile(),
        label: 'חיפוש חדש',
      });
      const created = res?.profile || res;
      setProfiles((p) => [...p, { ...emptyProfile(), ...created }]);
      setExpanded((s) => new Set([...Array.from(s), created?.id]));
      toast.success('פרופיל חיפוש נוסף');
      onChange?.([...profiles, created]);
    } catch (e) {
      toast.error(e?.message || 'יצירה נכשלה');
    } finally {
      setCreating(false);
    }
  };

  const updateLocal = (id, patch) => {
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const save = async (profile) => {
    try {
      await api.updateLeadSearchProfile(leadId, profile.id, sanitize(profile));
      toast.success('הפרופיל נשמר');
      onChange?.(profiles);
    } catch (e) {
      toast.error(e?.message || 'שמירה נכשלה');
    }
  };

  const remove = async (profile) => {
    const previous = profiles;
    setProfiles((list) => list.filter((p) => p.id !== profile.id));
    try {
      await api.deleteLeadSearchProfile(leadId, profile.id);
      toast.info('הפרופיל נמחק');
      onChange?.(profiles.filter((p) => p.id !== profile.id));
    } catch (e) {
      setProfiles(previous);
      toast.error(e?.message || 'מחיקה נכשלה');
    }
  };

  const toggle = (id) => {
    setExpanded((s) => {
      const next = new Set(Array.from(s));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="lsp-editor" aria-label="פרופילי חיפוש" dir="rtl">
      <header className="lsp-header">
        <h3 className="lsp-title">
          <Search size={16} aria-hidden />
          פרופילי חיפוש
          {profiles.length > 0 && <span className="lsp-count">{profiles.length}</span>}
        </h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={create}
          disabled={creating || loading}
        >
          {creating ? <Loader2 size={14} className="y2-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
          פרופיל חדש
        </button>
      </header>

      {loading ? (
        <div className="lsp-loading" role="status">
          <Loader2 size={16} className="y2-spin" aria-hidden />
          טוען…
        </div>
      ) : error ? (
        <div className="lsp-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          {error}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          variant="filtered"
          title="אין עדיין פרופילי חיפוש"
          description="הוסף פרופיל חיפוש כדי לקבל התאמות מדויקות לנכסים."
        />
      ) : (
        <ul className="lsp-list">
          {profiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              expanded={expanded.has(p.id)}
              onToggle={() => toggle(p.id)}
              onChange={(patch) => updateLocal(p.id, patch)}
              onSave={() => save(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function sanitize(p) {
  // Normalize empty strings → null for the enum fields; the backend
  // expects null, not "".
  return {
    ...p,
    domain: p.domain || null,
    dealType: p.dealType || null,
  };
}

function ProfileRow({ profile, expanded, onToggle, onChange, onSave, onDelete }) {
  const labelId = `lsp-label-${profile.id}`;
  return (
    <li className="lsp-row">
      <header className="lsp-row-head">
        <button
          type="button"
          className="lsp-row-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`lsp-body-${profile.id}`}
        >
          {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          <input
            id={labelId}
            className="lsp-label-input"
            dir="auto"
            placeholder="תן שם לחיפוש — למשל: גבעתיים 4ח׳"
            value={profile.label || ''}
            onChange={(e) => onChange({ label: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            aria-label="שם הפרופיל"
          />
        </button>
        <div className="lsp-row-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} aria-label={`שמור פרופיל ${profile.label || ''}`}>
            <Save size={14} aria-hidden />
            שמור
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} aria-label={`מחק פרופיל ${profile.label || ''}`}>
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </header>

      {expanded && (
        <div id={`lsp-body-${profile.id}`} className="lsp-row-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">סוג נכס</label>
              <SelectField
                value={profile.domain || ''}
                onChange={(v) => onChange({ domain: v || null })}
                options={DOMAIN_OPTS}
              />
            </div>
            <div className="form-group">
              <label className="form-label">סוג עסקה</label>
              <Segmented
                value={profile.dealType || ''}
                onChange={(v) => onChange({ dealType: v || null })}
                options={DEAL_OPTS}
                ariaLabel="סוג עסקה"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ערים</label>
              <CsvInput
                value={profile.cities || []}
                onChange={(arr) => onChange({ cities: arr })}
                placeholder="תל אביב, רמת גן"
                ariaLabel="ערים"
              />
            </div>
            <div className="form-group">
              <label className="form-label">שכונות</label>
              <CsvInput
                value={profile.neighborhoods || []}
                onChange={(arr) => onChange({ neighborhoods: arr })}
                placeholder="לב העיר, פלורנטין"
                ariaLabel="שכונות"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">חדרים מ-</label>
              <NumberField value={profile.minRoom} onChange={(n) => onChange({ minRoom: n })} placeholder="3" />
            </div>
            <div className="form-group">
              <label className="form-label">חדרים עד</label>
              <NumberField value={profile.maxRoom} onChange={(n) => onChange({ maxRoom: n })} placeholder="5" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">מחיר מ-</label>
              <NumberField value={profile.minPrice} onChange={(n) => onChange({ minPrice: n })} unit="₪" showShort />
            </div>
            <div className="form-group">
              <label className="form-label">מחיר עד</label>
              <NumberField value={profile.maxPrice} onChange={(n) => onChange({ maxPrice: n })} unit="₪" showShort />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">קומה מ-</label>
              <NumberField value={profile.minFloor} onChange={(n) => onChange({ minFloor: n })} />
            </div>
            <div className="form-group">
              <label className="form-label">קומה עד</label>
              <NumberField value={profile.maxFloor} onChange={(n) => onChange({ maxFloor: n })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">שנת בנייה מ-</label>
              <NumberField value={profile.minBuilt} onChange={(n) => onChange({ minBuilt: n })} placeholder="1980" />
            </div>
            <div className="form-group">
              <label className="form-label">שנת בנייה עד</label>
              <NumberField value={profile.maxBuilt} onChange={(n) => onChange({ maxBuilt: n })} placeholder="2025" />
            </div>
          </div>

          <div className="checkbox-grid">
            {BOOL_REQ_KEYS.map(([key, label]) => (
              <label key={key} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={!!profile[key]}
                  onChange={(e) => onChange({ [key]: e.target.checked })}
                />
                <span className="checkbox-custom" />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// Minimal comma-separated text input → string[] helper. Keeps us from
// adding a new chip-editor component just for two optional list fields.
function CsvInput({ value, onChange, placeholder, ariaLabel }) {
  const [text, setText] = useState((value || []).join(', '));
  useEffect(() => { setText((value || []).join(', ')); }, [value]);
  return (
    <input
      className="form-input"
      dir="auto"
      enterKeyHint="done"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const arr = text.split(',').map((s) => s.trim()).filter(Boolean);
        onChange(arr);
      }}
    />
  );
}
