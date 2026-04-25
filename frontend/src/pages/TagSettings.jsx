// TagSettings (/settings/tags) — refined to the "Estia Refined Pages"
// (2026-04-24) bundle. Cream & Gold, RTL, inline DT styles. Same CRUD
// contract as before:
//   api.listTags / api.createTag / api.updateTag / api.deleteTag
//
// Feature surface preserved:
//   - List every tag in the owner scope (with color swatch + scope chip
//     + usage count when the server reports one).
//   - Inline create form (name + color picker + scope select).
//   - Edit-in-place row (name / color / scope) with save/cancel.
//   - Delete with confirm-dialog so an accidental click doesn't nuke a
//     label that's already attached to dozens of entities.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tag, Plus, Trash2, Pencil, Check, X as XIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import ConfirmDialog from '../components/ConfirmDialog';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const SCOPE_OPTIONS = [
  { value: 'ALL',      label: 'הכל' },
  { value: 'PROPERTY', label: 'נכס' },
  { value: 'LEAD',     label: 'ליד' },
  { value: 'CUSTOMER', label: 'לקוח' },
];

const DEFAULT_COLOR = '#b48b4c';
const EMPTY_FORM = { name: '', color: DEFAULT_COLOR, scope: 'ALL' };

function scopeLabel(scope) {
  return SCOPE_OPTIONS.find((s) => s.value === scope)?.label || scope;
}

export default function TagSettings() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // {id, name, color, scope}
  const [pendingDelete, setPendingDelete] = useState(null);

  // `toast` from useToast() is a fresh object per render — including
  // it in useCallback's deps made `load` unstable, which made the
  // mount useEffect fire every render (load → setState → re-render →
  // new load → …). Stashing the latest toast in a ref keeps `load`
  // stable without losing access to the toast helpers.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listTags();
      // Backend returns `{ tags }`, not `{ items }` — keep the
      // dual-read so a future rename stays safe.
      setItems(res?.tags ?? res?.items ?? []);
    } catch {
      toastRef.current?.error?.('שגיאה בטעינת התגיות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.createTag({ name, color: form.color || null, scope: form.scope });
      toast.success('התגית נוספה');
      setForm(EMPTY_FORM);
      await load();
    } catch {
      toast.error('יצירת התגית נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (tag) => {
    setEditing({
      id: tag.id,
      name: tag.name,
      color: tag.color || DEFAULT_COLOR,
      scope: tag.scope || 'ALL',
    });
  };

  const handleCancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing?.id) return;
    const name = editing.name.trim();
    if (!name) return;
    try {
      await optimisticUpdate(toast, {
        label: 'שומר…',
        success: 'התגית עודכנה',
        onSave: () => api.updateTag(editing.id, {
          name,
          color: editing.color || null,
          scope: editing.scope,
        }),
      });
      setEditing(null);
      await load();
    } catch { /* toast handled */ }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await optimisticUpdate(toast, {
        label: 'מוחק…',
        success: 'התגית נמחקה',
        onSave: () => api.deleteTag(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const totalUsage = items.reduce((acc, t) => acc + (Number(t.usageCount) || 0), 0);
  const hasUsageData = items.some((t) => typeof t.usageCount === 'number');

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 1,
          }}>
            <Tag size={12} /> ESTIA · הגדרות
          </div>
          <h1 style={{
            fontSize: 26, fontWeight: 800, letterSpacing: -0.7,
            margin: '4px 0 0',
          }}>
            תגיות
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4, lineHeight: 1.6 }}>
            ניהול ספריית התגיות לשיוך נכסים, לקוחות ולידים.
            {items.length > 0 && (
              <>
                {' · '}
                {items.length} תגיות
                {hasUsageData && totalUsage > 0 && (
                  <>{' · '}{totalUsage} שיוכים</>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create form */}
      <section
        aria-label="תגית חדשה"
        style={sectionCard({ marginBottom: 16 })}
      >
        <h3 style={sectionTitle()}>
          <Plus size={16} /> תגית חדשה
        </h3>
        <form
          onSubmit={handleCreate}
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <FormField label="שם התגית" style={{ flex: '1 1 150px', minWidth: 180 }}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="למשל: VIP"
              aria-label="שם התגית"
              required
              style={inputStyle()}
            />
          </FormField>
          <FormField label="צבע" style={{ flex: '0 0 auto' }}>
            <input
              type="color"
              value={form.color}
              onChange={(e) => update('color', e.target.value)}
              aria-label="צבע התגית"
              style={colorInputStyle()}
            />
          </FormField>
          <FormField label="תחום" style={{ flex: '0 0 160px' }}>
            <select
              value={form.scope}
              onChange={(e) => update('scope', e.target.value)}
              aria-label="תחום תגית"
              style={inputStyle()}
            >
              {SCOPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </FormField>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            style={primaryBtn(saving || !form.name.trim())}
          >
            <Plus size={14} aria-hidden="true" />
            <span>{saving ? 'שומר…' : 'הוסף תגית'}</span>
          </button>
        </form>
      </section>

      {/* List */}
      <section
        aria-label="רשימת תגיות"
        aria-busy={loading ? 'true' : 'false'}
        style={sectionCard()}
      >
        <h3 style={sectionTitle()}>
          <Tag size={16} /> ספריית התגיות
          {items.length > 0 && (
            <span style={{ color: DT.muted, fontWeight: 700, fontSize: 12 }}>
              · {items.length}
            </span>
          )}
        </h3>

        {loading && items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{
                height: 56, borderRadius: 12,
                background: `linear-gradient(90deg, ${DT.cream2}, ${DT.white}, ${DT.cream2})`,
                backgroundSize: '200% 100%',
                animation: 'tags-shimmer 1.4s infinite linear',
                border: `1px solid ${DT.border}`,
              }} />
            ))}
            <style>{`
              @keyframes tags-shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </div>
        ) : items.length === 0 ? (
          <EmptyTags />
        ) : (
          <ul style={listReset}>
            {items.map((t) => {
              const isEditing = editing?.id === t.id;
              return (
                <li key={t.id}>
                  {isEditing ? (
                    <EditRow
                      editing={editing}
                      setEditing={setEditing}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                    />
                  ) : (
                    <ViewRow
                      tag={t}
                      onEdit={() => handleStartEdit(t)}
                      onDelete={() => setPendingDelete(t)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="מחיקת תגית"
          message={`האם למחוק את התגית "${pendingDelete.name}"? השיוכים הקיימים יוסרו.`}
          confirmLabel="מחק"
          onConfirm={handleDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Rows ──────────────────────────────────────────────────

function ViewRow({ tag, onEdit, onDelete }) {
  const color = tag.color || DEFAULT_COLOR;
  const usage = Number(tag.usageCount);
  const hasUsage = Number.isFinite(usage);
  return (
    <div style={rowBase()}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '5px 14px', borderRadius: 99,
          background: color,
          color: readableFg(color),
          fontWeight: 800, fontSize: 13,
          boxShadow: '0 1px 0 rgba(30,26,20,0.06)',
        }}
      >
        {displayText(tag.name)}
      </span>
      <span style={chipStyle()}>
        {scopeLabel(tag.scope || 'ALL')}
      </span>
      {hasUsage && (
        <span style={{
          fontSize: 12, color: DT.muted, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {usage} {usage === 1 ? 'שיוך' : 'שיוכים'}
        </span>
      )}
      <div style={{
        marginInlineStart: 'auto',
        display: 'flex', gap: 6, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`ערוך: ${tag.name}`}
          title="ערוך"
          style={iconBtn()}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`מחק: ${tag.name}`}
          title="מחק"
          style={iconBtn({ danger: true })}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function EditRow({ editing, setEditing, onSave, onCancel }) {
  const canSave = !!editing.name.trim();
  return (
    <div style={{
      ...rowBase(),
      background: DT.cream4,
      borderColor: 'rgba(180,139,76,0.35)',
      flexWrap: 'wrap',
    }}>
      <input
        type="text"
        value={editing.name}
        onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
        aria-label="שם תגית"
        style={{ ...inputStyle(), flex: '1 1 180px', minWidth: 160 }}
      />
      <input
        type="color"
        value={editing.color}
        onChange={(e) => setEditing((p) => ({ ...p, color: e.target.value }))}
        aria-label="צבע תגית"
        style={colorInputStyle()}
      />
      <select
        value={editing.scope}
        onChange={(e) => setEditing((p) => ({ ...p, scope: e.target.value }))}
        aria-label="תחום תגית"
        style={{ ...inputStyle(), flex: '0 0 140px' }}
      >
        {SCOPE_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <div style={{
        marginInlineStart: 'auto',
        display: 'flex', gap: 6, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          aria-label="שמור שינויים"
          title="שמור"
          style={primaryBtn(!canSave)}
        >
          <Check size={14} aria-hidden="true" />
          <span>שמור</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="בטל עריכה"
          title="בטל"
          style={ghostBtn()}
        >
          <XIcon size={14} aria-hidden="true" />
          <span>בטל</span>
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────
function EmptyTags() {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center', color: DT.muted,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: DT.goldSoft, color: DT.goldDark,
        display: 'grid', placeItems: 'center',
        margin: '0 auto 12px',
      }}>
        <Tag size={24} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        עדיין אין תגיות
      </div>
      <p style={{
        fontSize: 13, color: DT.muted, margin: '0 auto',
        maxWidth: 360, lineHeight: 1.7,
      }}>
        הוסף/י תגית ראשונה בטופס שלמעלה כדי לסווג נכסים, לקוחות ולידים.
      </p>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────
function FormField({ label, children, style }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      ...(style || {}),
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Style helpers ─────────────────────────────────────────
function sectionCard(extra) {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20, ...(extra || {}),
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function inputStyle() {
  return {
    ...FONT,
    background: DT.white, color: DT.ink,
    border: `1px solid ${DT.border}`, borderRadius: 10,
    padding: '10px 12px', fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };
}
function colorInputStyle() {
  return {
    width: 44, height: 44, padding: 2,
    background: DT.white,
    border: `1px solid ${DT.border}`, borderRadius: 10,
    cursor: 'pointer',
  };
}
function chipStyle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: DT.goldSoft, color: DT.goldDark,
    padding: '3px 10px', borderRadius: 99,
    fontWeight: 700, fontSize: 11,
  };
}
function rowBase() {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 12,
    background: DT.cream4, border: `1px solid ${DT.border}`,
  };
}
function primaryBtn(disabled) {
  return {
    ...FONT,
    background: disabled
      ? DT.cream3
      : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 16px', borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: disabled ? 'none' : '0 4px 10px rgba(180,139,76,0.3)',
    opacity: disabled ? 0.75 : 1,
  };
}
function ghostBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function iconBtn(opts = {}) {
  const { danger } = opts;
  return {
    ...FONT,
    background: danger ? 'rgba(185,28,28,0.06)' : DT.white,
    border: `1px solid ${danger ? 'rgba(185,28,28,0.2)' : DT.border}`,
    padding: 8, borderRadius: 10, cursor: 'pointer',
    color: danger ? DT.danger : DT.ink,
    display: 'inline-grid', placeItems: 'center',
    flexShrink: 0,
    minWidth: 44, minHeight: 44,
  };
}

const listReset = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 8,
};

// Cheap YIQ heuristic to pick ink vs cream text for a given swatch.
// Enough for inline chips; we don't need a full WCAG contrast engine.
function readableFg(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return DT.ink;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return DT.ink;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? DT.ink : DT.cream;
}
