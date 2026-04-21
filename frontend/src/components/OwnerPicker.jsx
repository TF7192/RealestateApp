import { useEffect, useRef, useState } from 'react';
import { Search, X, UserPlus, Phone, Mail, Building2 } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import OwnerEditDialog from './OwnerEditDialog';
import { useViewportMobile } from '../hooks/mobile';
import useFocusTrap from '../hooks/useFocusTrap';
import './OwnerPicker.css';

/**
 * OwnerPicker — search & pick an existing Owner, or create a new one inline.
 * Renders as a bottom sheet on mobile and as a centered popover on desktop.
 *
 * Props:
 *   open        boolean
 *   onClose()
 *   onPick(owner)
 */
export default function OwnerPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [allOwners, setAllOwners] = useState(null);
  const debounceRef = useRef(null);
  const isMobile = useViewportMobile(820);
  const inputRef = useRef(null);

  // Initial load — show all owners when sheet opens, then debounced search
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    api.listOwners()
      .then((res) => { if (!cancelled) { setAllOwners(res?.items || []); setResults(res?.items || []); } })
      .catch(() => { if (!cancelled) { setAllOwners([]); setResults([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Focus is handled by useFocusTrap on the panel (F-6.4). The hook focuses
  // the first tabbable child on mount — the search input sits at the top
  // so it still gets focus.

  // Debounced search via API
  useEffect(() => {
    if (!open) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (!term) {
      setResults(allOwners || []);
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchOwners(term);
        setResults(res?.items || []);
      } catch {
        // Fall back to local filter on the previously-loaded list
        const lower = term.toLowerCase();
        setResults(
          (allOwners || []).filter(
            (o) =>
              (o.name || '').toLowerCase().includes(lower) ||
              (o.phone || '').includes(term),
          ),
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, open, allOwners]);

  const handlePick = (owner) => {
    onPick?.(owner);
    onClose?.();
  };

  if (!open) return null;

  const sheetClass = isMobile ? 'owner-picker-sheet mobile' : 'owner-picker-sheet desktop';

  return (
    <>
      <OwnerPickerPanel
        onClose={onClose}
        sheetClass={sheetClass}
        isMobile={isMobile}
        inputRef={inputRef}
        q={q}
        setQ={setQ}
        loading={loading}
        results={results}
        setCreateOpen={setCreateOpen}
        handlePick={handlePick}
      />

      {createOpen && (
        <OwnerEditDialog
          onClose={() => setCreateOpen(false)}
          onSaved={(saved) => {
            setCreateOpen(false);
            if (saved) handlePick(saved);
          }}
        />
      )}
    </>
  );
}

// Inner panel mounts only when open so useFocusTrap's mount-time effect
// fires with ref.current already attached (see F-6.4).
function OwnerPickerPanel({ onClose, sheetClass, isMobile, inputRef, q, setQ, loading, results, setCreateOpen, handlePick }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });
  return (
    <Portal>
      <div
        className="owner-picker-back"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="בחר בעל נכסים"
      >
        <div ref={panelRef} className={sheetClass} onClick={(e) => e.stopPropagation()}>
          {isMobile && <div className="owner-picker-handle" aria-hidden="true" />}

          <header className="owner-picker-head">
            <h3>בחר בעל נכסים</h3>
            <button className="owner-picker-close btn-ghost" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </header>

          <button
            type="button"
            className="owner-picker-new"
            onClick={() => setCreateOpen(true)}
          >
            <span className="owner-picker-new-icon"><UserPlus size={16} /></span>
            <span className="owner-picker-new-text">
              <strong>בעל נכס חדש</strong>
              <small>צור והוסף בעל נכסים במהירות</small>
            </span>
          </button>

          <div className="owner-picker-search">
            <Search size={16} />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="חפש לפי שם או טלפון"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button
                type="button"
                className="owner-picker-clear"
                onClick={() => setQ('')}
                aria-label="נקה חיפוש"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="owner-picker-results">
            {loading && <div className="owner-picker-empty">טוען…</div>}
            {!loading && results.length === 0 && (
              <div className="owner-picker-empty">
                {/* F-22 — if the agent typed a name, let them commit it
                    via a single-click "create with this name" button.
                    Previously the empty state was a dead copy line. */}
                {q ? (
                  <>
                    <p>לא נמצא בעלים עם השם "{q}".</p>
                    <button
                      type="button"
                      className="owner-picker-create-with-q"
                      onClick={() => setCreateOpen(true)}
                    >
                      <UserPlus size={14} /> צור בעלים חדש: <strong>{q}</strong>
                    </button>
                  </>
                ) : (
                  'עוד אין בעלי נכסים במערכת'
                )}
              </div>
            )}
            {!loading && results.map((o) => (
              <button
                key={o.id}
                type="button"
                className="owner-picker-row"
                onClick={() => handlePick(o)}
              >
                <div className="owner-picker-avatar" aria-hidden="true">
                  {(o.name || '?').charAt(0)}
                </div>
                <div className="owner-picker-meta">
                  <strong>{o.name}</strong>
                  <div className="owner-picker-meta-sub">
                    {o.phone && (
                      <span className="owner-picker-phone"><Phone size={11} />{o.phone}</span>
                    )}
                    {o.email && (
                      <span className="owner-picker-email"><Mail size={11} />{o.email}</span>
                    )}
                  </div>
                </div>
                <span className="owner-picker-pill" title={`${o.propertyCount || 0} נכסים`}>
                  <Building2 size={11} />
                  <strong>{o.propertyCount || 0}</strong>
                  <span>נכסים</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
