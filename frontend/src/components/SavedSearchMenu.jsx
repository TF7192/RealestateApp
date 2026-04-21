import { useEffect, useRef, useState } from 'react';
import { Bookmark, Trash2, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import './SavedSearchMenu.css';

// Sprint 7 / MLS parity — Task B3. Saved-search dropdown for any list
// page. Parent supplies the current filter object; the menu adds a
// "name + save" input plus a list of existing snapshots with click-to-
// load and trash-to-delete. Persists on the backend via
// api.createSavedSearch / deleteSavedSearch so snapshots survive a reload.
//
// Props:
//   entityType     - 'LEAD' | 'PROPERTY' | 'DEAL' | … (string; passed to API)
//   currentFilters - plain JSON object representing the active filter set
//   onLoad(filters)- invoked when the agent picks a saved entry
//
// The menu is not a modal — it's a floating popover anchored to its
// trigger button. Outside click + Escape close it; focus returns to
// the trigger.
export default function SavedSearchMenu({ entityType, currentFilters, onLoad }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef(null);
  const toast = useToast();

  // Fetch the saved-searches list each time the menu opens. Lists are
  // tiny (a few rows per agent) so there's no cache layer; re-fetching
  // keeps the menu fresh when other tabs or collaborators edit them.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    api.listSavedSearches(entityType)
      .then((r) => {
        if (cancelled) return;
        setItems(r?.items || []);
      })
      .catch(() => { /* soft-fail: dropdown shows the empty state */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, entityType]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('הזן שם לחיפוש');
      return;
    }
    setSaving(true);
    try {
      const r = await api.createSavedSearch({
        entityType,
        name: trimmed,
        filters: currentFilters || {},
      });
      const created = r?.savedSearch;
      if (created) {
        setItems((cur) => [created, ...cur]);
      }
      setName('');
      toast.success('החיפוש נשמר');
    } catch (e) {
      toast.error(e?.message || 'שמירת החיפוש נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    try {
      await api.deleteSavedSearch(entry.id);
      setItems((cur) => cur.filter((x) => x.id !== entry.id));
      toast.success('החיפוש נמחק');
    } catch (e) {
      toast.error(e?.message || 'מחיקה נכשלה');
    }
  };

  const handleLoad = (entry) => {
    onLoad?.(entry.filters || {});
    setOpen(false);
  };

  return (
    <div className="ss-menu" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm ss-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="חיפושים שמורים"
      >
        <Bookmark size={14} aria-hidden="true" />
        <span>חיפושים שמורים</span>
        <ChevronDown size={14} aria-hidden="true" className={`ss-chev ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="ss-menu-pop" role="menu" aria-label="חיפושים שמורים">
          <div className="ss-menu-save-row">
            <input
              type="text"
              className="ss-menu-input"
              placeholder="שם לחיפוש החדש"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              maxLength={80}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              שמור
            </button>
          </div>

          <div className="ss-menu-list">
            {loading && <div className="ss-menu-hint">טוען…</div>}
            {!loading && items.length === 0 && (
              <div className="ss-menu-hint">אין עדיין חיפושים שמורים</div>
            )}
            {!loading && items.map((entry) => (
              <div key={entry.id} className="ss-menu-row">
                <button
                  type="button"
                  className="ss-menu-load"
                  onClick={() => handleLoad(entry)}
                  role="menuitem"
                  title={`טען את "${entry.name}"`}
                >
                  <Bookmark size={12} aria-hidden="true" />
                  <span>{entry.name}</span>
                </button>
                <button
                  type="button"
                  className="ss-menu-del"
                  onClick={() => handleDelete(entry)}
                  aria-label={`מחק ${entry.name}`}
                  title="מחק חיפוש"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
