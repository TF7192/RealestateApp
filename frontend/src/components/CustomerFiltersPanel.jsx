import { useEffect, useMemo, useRef, useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { NumberField } from './SmartFields';
import Portal from './Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  LEAD_HEAT_LABELS,
  CUSTOMER_STATUS_LABELS,
  QUICK_LEAD_STATUS_LABELS,
  SERIOUSNESS_LABELS,
  PROPERTY_TYPE_LABELS,
  labelOptions,
} from '../lib/mlsLabels';
import api from '../lib/api';
import './CustomerFiltersPanel.css';

// Sprint 2 / MLS parity — Task C2. Nadlan-parity filter drawer for the
// Customers page. Opens from the "סנן" button, shows every filter the
// backend accepts (listed in spec / routes/leads.ts), and yields a
// filters object via `onApply(filters)` when the agent submits.
//
// Shape of the yielded object mirrors the backend's query params so the
// caller can pass it straight to api.listLeads. Empty arrays / null
// values are stripped so we don't serialize `?cities=` or `?heat=`.
//
// Modal a11y: role="dialog", aria-modal="true", useFocusTrap. Escape
// closes, backdrop click closes, "החל סינון" commits + closes.
//
// Props:
//   open      boolean
//   filters   current filter object (used as initial state each open)
//   onApply(filters)  commit handler — parent re-fetches /leads with it
//   onClose() close handler
export default function CustomerFiltersPanel({
  open,
  filters = {},
  onApply,
  onClose,
}) {
  // Keep a local editable copy of the filters so toggling chips doesn't
  // refetch the whole list on every click — we only commit on "החל סינון".
  const [draft, setDraft] = useState(filters);
  const [tags, setTags] = useState([]);
  const panelRef = useRef(null);

  // Re-seed draft when the drawer (re)opens so a stale edit doesn't
  // carry between sessions.
  useEffect(() => {
    if (open) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch the agent's tag library once the drawer opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.listTags()
      .then((r) => { if (!cancelled) setTags(r?.items || []); })
      .catch(() => { /* soft-fail: the tag group renders empty */ });
    return () => { cancelled = true; };
  }, [open]);

  useFocusTrap(panelRef, { onEscape: onClose });

  // Helpers to toggle array entries / flip booleans on the draft.
  const toggleInArray = (key, value) => {
    setDraft((prev) => {
      const arr = Array.isArray(prev[key]) ? prev[key] : [];
      const has = arr.includes(value);
      const next = has ? arr.filter((x) => x !== value) : [...arr, value];
      const copy = { ...prev };
      if (next.length) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  };

  const toggleBool = (key) => {
    setDraft((prev) => {
      const copy = { ...prev };
      if (copy[key]) delete copy[key];
      else copy[key] = true;
      return copy;
    });
  };

  const setNumber = (key, n) => {
    setDraft((prev) => {
      const copy = { ...prev };
      if (n == null || n === '' || !Number.isFinite(Number(n))) delete copy[key];
      else copy[key] = Number(n);
      return copy;
    });
  };

  const clearAll = () => setDraft({});

  const apply = () => {
    onApply?.(draft);
    onClose?.();
  };

  // Active count for the header summary. Each key contributes 1; the
  // actual UI intentionally doesn't dissect arrays into sub-pills because
  // "Filters" surfaces only top-level groups.
  const activeCount = useMemo(() => (
    Object.entries(draft).filter(([, v]) => {
      if (Array.isArray(v)) return v.length > 0;
      return v !== null && v !== undefined && v !== '' && v !== false;
    }).length
  ), [draft]);

  if (!open) return null;

  // Reusable group of on/off chips. value is a string; selected => aria-pressed.
  const ChipGroup = ({ group, values }) => (
    <div className="cfp-chips" role="group">
      {values.map(({ value, label }) => {
        const selected = (draft[group] || []).includes(value);
        return (
          <button
            key={value}
            type="button"
            className={`cfp-chip ${selected ? 'sel' : ''}`}
            aria-pressed={selected}
            onClick={() => toggleInArray(group, value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const BoolChip = ({ k, label }) => {
    const selected = !!draft[k];
    return (
      <button
        type="button"
        className={`cfp-chip ${selected ? 'sel' : ''}`}
        aria-pressed={selected}
        onClick={() => toggleBool(k)}
      >
        {label}
      </button>
    );
  };

  return (
    <Portal>
      <div className="cfp-backdrop" onClick={onClose}>
        <aside
          className="cfp-panel"
          role="dialog"
          aria-modal="true"
          aria-label="סינון מתקדם"
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          <header className="cfp-head">
            <div className="cfp-head-title">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <h3>סינון מתקדם</h3>
              {activeCount > 0 && (
                <span className="cfp-count" aria-label={`${activeCount} סינונים פעילים`}>
                  {activeCount}
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost cfp-close"
              onClick={onClose}
              aria-label="סגור"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="cfp-body">
            {/* Lead heat (HOT/WARM/COLD) */}
            <section className="cfp-section">
              <h4>חום ליד</h4>
              <ChipGroup group="heat" values={labelOptions(LEAD_HEAT_LABELS)} />
            </section>

            {/* Quick lead status (Nadlan LeadStatusID) */}
            <section className="cfp-section">
              <h4>סטטוס ליד</h4>
              <ChipGroup
                group="leadStatus"
                values={labelOptions(QUICK_LEAD_STATUS_LABELS)}
              />
            </section>

            {/* Customer lifecycle */}
            <section className="cfp-section">
              <h4>סטטוס לקוח</h4>
              <ChipGroup
                group="customerStatus"
                values={labelOptions(CUSTOMER_STATUS_LABELS)}
              />
            </section>

            {/* Seriousness */}
            <section className="cfp-section">
              <h4>רצינות</h4>
              <ChipGroup
                group="seriousness"
                values={labelOptions(SERIOUSNESS_LABELS)}
              />
            </section>

            {/* Property types */}
            <section className="cfp-section">
              <h4>סוגי נכס</h4>
              <ChipGroup
                group="types"
                values={labelOptions(PROPERTY_TYPE_LABELS)}
              />
            </section>

            {/* Budget range */}
            <section className="cfp-section">
              <h4>תקציב</h4>
              <div className="cfp-range-pair">
                <label className="cfp-range-cell">
                  <span className="cfp-range-cap">מ</span>
                  <NumberField
                    aria-label="תקציב מינימום"
                    value={draft.minPrice ?? null}
                    onChange={(n) => setNumber('minPrice', n)}
                    unit="₪"
                    placeholder="0"
                  />
                </label>
                <label className="cfp-range-cell">
                  <span className="cfp-range-cap">עד</span>
                  <NumberField
                    aria-label="תקציב מקסימום"
                    value={draft.maxPrice ?? null}
                    onChange={(n) => setNumber('maxPrice', n)}
                    unit="₪"
                    placeholder="ללא הגבלה"
                  />
                </label>
              </div>
            </section>

            {/* Rooms + floor ranges */}
            <section className="cfp-section">
              <h4>חדרים וקומות</h4>
              <div className="cfp-mini-grid">
                <label>
                  <span>מינ׳ חדרים</span>
                  <NumberField
                    aria-label="מינימום חדרים"
                    value={draft.minRoom ?? null}
                    onChange={(n) => setNumber('minRoom', n)}
                    placeholder="0"
                  />
                </label>
                <label>
                  <span>מקס׳ חדרים</span>
                  <NumberField
                    aria-label="מקסימום חדרים"
                    value={draft.maxRoom ?? null}
                    onChange={(n) => setNumber('maxRoom', n)}
                    placeholder="ללא"
                  />
                </label>
                <label>
                  <span>מינ׳ קומה</span>
                  <NumberField
                    aria-label="מינימום קומה"
                    value={draft.minFloor ?? null}
                    onChange={(n) => setNumber('minFloor', n)}
                    placeholder="0"
                  />
                </label>
                <label>
                  <span>מקס׳ קומה</span>
                  <NumberField
                    aria-label="מקסימום קומה"
                    value={draft.maxFloor ?? null}
                    onChange={(n) => setNumber('maxFloor', n)}
                    placeholder="ללא"
                  />
                </label>
              </div>
            </section>

            {/* Boolean requirements */}
            <section className="cfp-section">
              <h4>דרישות חובה</h4>
              <div className="cfp-chips">
                <BoolChip k="parkingRequired"  label="חניה" />
                <BoolChip k="balconyRequired"  label="מרפסת" />
                <BoolChip k="elevatorRequired" label="מעלית" />
                <BoolChip k="safeRoomRequired" label="ממ״ד" />
                <BoolChip k="acRequired"       label="מיזוג" />
                <BoolChip k="storageRequired"  label="מחסן" />
              </div>
            </section>

            {/* Tag library (A2). Empty until the agent creates tags. */}
            {tags.length > 0 && (
              <section className="cfp-section">
                <h4>תגיות</h4>
                <div className="cfp-chips">
                  {tags.map((t) => {
                    const selected = (draft.tags || []).includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`cfp-chip cfp-tag ${selected ? 'sel' : ''}`}
                        aria-pressed={selected}
                        onClick={() => toggleInArray('tags', t.id)}
                        style={t.color ? { ['--tag-color']: t.color } : undefined}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <footer className="cfp-foot">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearAll}
            >
              נקה הכל
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={apply}
            >
              החל סינון
            </button>
          </footer>
        </aside>
      </div>
    </Portal>
  );
}
