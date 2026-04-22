import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Tag as TagIcon, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import './TagPicker.css';

// ──────────────────────────────────────────────────────────────────
// TagPicker — entity-agnostic "tags / מדבקות" control.
//
// Renders the currently-assigned tags as chips + a "+" button that
// opens a small dropdown listing the agent's remaining tags. Detach
// happens inline on each chip via an X button. Works for any
// entityType ('LEAD' | 'PROPERTY' | 'CUSTOMER') + entityId pair.
//
// Data flow:
//   - On mount, load the agent's full tag catalog (api.listTags) + the
//     subset already assigned to this entity (api.listAssignedTags).
//   - Attach/detach optimistically update local state and then call
//     api.assignTag / api.unassignTag. Failures roll back + toast.
//
// Props:
//   entityType  'LEAD' | 'PROPERTY' | 'CUSTOMER'
//   entityId    string (required)
//   readonly    when true, only renders chips — no +/X buttons
//   onChange    optional (tags[]) => void invoked after any change
// ──────────────────────────────────────────────────────────────────
export default function TagPicker({ entityType, entityId, readonly = false, onChange }) {
  const toast = useToast();
  const [allTags, setAllTags] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  const refresh = useCallback(async () => {
    // L-9 — without an entityId we can't fetch assignments; exit the
    // loading state so the picker shows its empty UI instead of a
    // perpetual spinner (matches P-9 for RemindersPanel).
    if (!entityId) {
      setAssigned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [catalog, assignedRes] = await Promise.all([
        api.listTags(),
        api.listAssignedTags(entityType, entityId),
      ]);
      setAllTags(catalog?.items || []);
      setAssigned(assignedRes?.items || []);
    } catch (e) {
      toast.error(e?.message || 'טעינת תגים נכשלה');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const available = useMemo(() => {
    const taken = new Set(assigned.map((t) => t.id));
    return allTags.filter((t) => !taken.has(t.id));
  }, [allTags, assigned]);

  const attach = async (tag) => {
    setBusyId(tag.id);
    const next = [...assigned, tag];
    setAssigned(next);
    setOpen(false);
    try {
      await api.assignTag(tag.id, { entityType, entityId });
      onChange?.(next);
    } catch (e) {
      setAssigned(assigned);
      toast.error(e?.message || 'הוספת התג נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const detach = async (tag) => {
    setBusyId(tag.id);
    const next = assigned.filter((t) => t.id !== tag.id);
    setAssigned(next);
    try {
      await api.unassignTag(tag.id, entityType, entityId);
      onChange?.(next);
    } catch (e) {
      setAssigned(assigned);
      toast.error(e?.message || 'הסרת התג נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="tag-picker" dir="rtl">
      <ul className="tag-picker-list" aria-label="תגים משויכים">
        {assigned.length === 0 && !loading && (
          <li className="tag-picker-empty">
            <TagIcon size={12} aria-hidden />
            <span>אין תגים</span>
          </li>
        )}
        {assigned.map((tag) => (
          <li key={tag.id} className="tag-chip" style={chipStyle(tag.color)}>
            <span className="tag-chip-label">{tag.name}</span>
            {!readonly && (
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`הסר תג ${tag.name}`}
                disabled={busyId === tag.id}
                onClick={() => detach(tag)}
              >
                <X size={10} aria-hidden />
              </button>
            )}
          </li>
        ))}
        {!readonly && (
          <li className="tag-picker-add-wrap">
            <button
              ref={btnRef}
              type="button"
              className="tag-picker-add"
              aria-label="הוסף תג"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              disabled={loading}
            >
              {loading ? <Loader2 size={12} className="y2-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
              <span>הוסף</span>
            </button>
            {open && (
              <div ref={popRef} className="tag-picker-pop" role="listbox" aria-label="בחר תג">
                {available.length === 0 ? (
                  <div className="tag-picker-pop-empty">אין תגים זמינים</div>
                ) : (
                  <ul>
                    {available.map((tag) => (
                      <li key={tag.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="tag-picker-pop-item"
                          onClick={() => attach(tag)}
                        >
                          <span className="tag-swatch" style={{ background: tag.color || 'var(--gold)' }} />
                          <span>{tag.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

function chipStyle(color) {
  if (!color) return undefined;
  // P-15 — the N-5 chip CSS reads `--tag-color` (custom property) and
  // derives fill + border + text from it via color-mix(). Setting it here
  // is what makes newly-added tags actually paint instead of rendering as
  // a transparent sliver (which was the "says added but doesn't appear"
  // regression). Inline CSS custom properties work with React as plain
  // string-keyed style entries.
  return { '--tag-color': color };
}
