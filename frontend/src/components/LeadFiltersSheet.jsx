// Sprint 7 — ScreenFilters. Full-screen slide-up mobile sheet for the
// leads list (/customers). The desktop inline pill row is too cramped
// on phones to show status + lookingFor + interestType + city + budget
// + rooms simultaneously, so on mobile we collapse it into a single
// "סינון" chip that opens this sheet.
//
// Design choices:
// - DT (cream & gold) palette matches the freshly-ported Customers.jsx.
// - Portal at document.body so the overlay escapes any transform/
//   filter/will-change ancestor. Focus-trap + Escape + aria-modal.
// - Sheet drags down to dismiss (touch-driven); 80px threshold triggers
//   onClose. Matches the OverflowSheet / LeadPickerSheet feel.
// - Parent owns the canonical filter state — this sheet commits via
//   onApply(filters) on "החל סינון" and onClose() on either close
//   button or backdrop click. No local re-derivation, single source
//   of truth with the desktop pill row.
// - Segmented pills match the desktop filter row's visual style so an
//   agent who flips between laptop + phone sees the same affordance.
// - City is free-text + <datalist> autocomplete off the existing
//   /api/lookups/cities list — matches AddressField's pattern without
//   pulling in the async SuggestPicker for what is a 1-tap mobile pick.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Portal from './Portal';
import { NumberField } from './SmartFields';
import useFocusTrap from '../hooks/useFocusTrap';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  backdrop: 'rgba(30,26,20,0.55)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Shape of `values` (matches Customers.jsx filter keys):
//   status        'all' | 'hot' | 'warm' | 'cold' | 'stale'
//   lookingFor    'BUY' | 'RENT' | ''        — '' means either
//   interestType  'PRIVATE' | 'COMMERCIAL' | ''
//   city          string
//   minBudget     number | null
//   maxBudget     number | null
//   minRooms      number | null
//   maxRooms      number | null
const EMPTY = {
  status: 'all',
  lookingFor: '',
  interestType: '',
  city: '',
  minBudget: null,
  maxBudget: null,
  minRooms: null,
  maxRooms: null,
};

const STATUS_OPTS = [
  { k: 'all',   label: 'הכול' },
  { k: 'hot',   label: 'חמים' },
  { k: 'warm',  label: 'פושרים' },
  { k: 'cold',  label: 'קרים' },
  { k: 'stale', label: 'ללא מענה 24ש' },
];

const LOOKING_OPTS = [
  { k: '',     label: 'הכול' },
  { k: 'BUY',  label: 'קנייה' },
  { k: 'RENT', label: 'שכירות' },
];

const INTEREST_OPTS = [
  { k: '',            label: 'הכול' },
  { k: 'PRIVATE',     label: 'פרטי' },
  { k: 'COMMERCIAL',  label: 'מסחרי' },
];

export default function LeadFiltersSheet({
  open,
  values,
  onApply,
  onClose,
  cities = [],
}) {
  const panelRef = useRef(null);
  // Local draft so toggling a chip doesn't re-filter the list on every
  // click — we only commit on "החל סינון".
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...(values || {}) }));
  // drag-to-dismiss state. touchY is the starting Y; dragY is the
  // live offset; beyond 80px on release → onClose.
  const touchY = useRef(null);
  const [dragY, setDragY] = useState(0);

  useFocusTrap(panelRef, { onEscape: onClose });

  // Re-seed draft every time the sheet (re)opens so a stale edit
  // doesn't carry between sessions.
  useEffect(() => {
    if (open) {
      setDraft({ ...EMPTY, ...(values || {}) });
      setDragY(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const update = (key, value) => setDraft((p) => ({ ...p, [key]: value }));

  const clearAll = () => setDraft({ ...EMPTY });

  const apply = () => {
    onApply?.(draft);
    onClose?.();
  };

  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchY.current = t.clientY;
  };
  const onTouchMove = (e) => {
    const t = e.touches?.[0];
    if (!t || touchY.current == null) return;
    const dy = t.clientY - touchY.current;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (dragY > 80) {
      onClose?.();
    }
    setDragY(0);
    touchY.current = null;
  };

  return (
    <Portal>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: DT.backdrop,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'lfs-fade 0.18s ease',
        }}
      >
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="סינון לידים"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
          style={{
            ...FONT, color: DT.ink,
            width: '100%', maxWidth: 640, maxHeight: '92vh',
            background: DT.cream,
            borderRadius: '22px 22px 0 0',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -12px 48px rgba(30,26,20,0.25)',
            transform: `translateY(${dragY}px)`,
            transition: touchY.current == null ? 'transform 0.24s cubic-bezier(0.2,1.1,0.4,1)' : 'none',
            animation: touchY.current == null && dragY === 0 ? 'lfs-rise 0.32s cubic-bezier(0.2,1.1,0.4,1)' : 'none',
            overflow: 'hidden',
          }}
        >
          {/* Drag handle */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              padding: '10px 0 2px', display: 'grid', placeItems: 'center',
              cursor: 'grab', touchAction: 'none',
            }}
            aria-hidden="true"
          >
            <div style={{
              width: 44, height: 5, borderRadius: 99, background: DT.cream3,
            }} />
          </div>

          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 18px 12px', borderBottom: `1px solid ${DT.border}`,
          }}>
            <h3 style={{
              margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: -0.3,
            }}>סינון לידים</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                width: 34, height: 34, borderRadius: 99,
                border: `1px solid ${DT.border}`, background: DT.white,
                color: DT.ink2, display: 'grid', placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </header>

          {/* Scroll body */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 18px 10px',
            WebkitOverflowScrolling: 'touch',
          }}>
            <Section title="סטטוס">
              <Segmented
                options={STATUS_OPTS}
                value={draft.status}
                onChange={(v) => update('status', v)}
                ariaLabel="סטטוס ליד"
              />
            </Section>

            <Section title="מה מחפש">
              <Segmented
                options={LOOKING_OPTS}
                value={draft.lookingFor}
                onChange={(v) => update('lookingFor', v)}
                ariaLabel="סוג עסקה"
              />
            </Section>

            <Section title="אופי נכס">
              <Segmented
                options={INTEREST_OPTS}
                value={draft.interestType}
                onChange={(v) => update('interestType', v)}
                ariaLabel="סוג נכס"
              />
            </Section>

            <Section title="עיר">
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={draft.city || ''}
                onChange={(e) => update('city', e.target.value)}
                placeholder="תל אביב, חיפה…"
                list="lfs-city-list"
                aria-label="עיר"
                style={{
                  ...FONT, width: '100%', padding: '12px 14px',
                  background: DT.white,
                  border: `1px solid ${DT.border}`, borderRadius: 12,
                  fontSize: 15, color: DT.ink, outline: 'none',
                  textAlign: 'right',
                }}
              />
              <datalist id="lfs-city-list">
                {cities.map((c) => (<option key={c} value={c} />))}
              </datalist>
            </Section>

            <Section title="תקציב">
              <div style={pairRow()}>
                <label style={pairCell()}>
                  <span style={pairCap()}>מ-</span>
                  <NumberField
                    aria-label="תקציב מינימום"
                    value={draft.minBudget}
                    onChange={(n) => update('minBudget', n)}
                    unit="₪"
                    placeholder="0"
                  />
                </label>
                <label style={pairCell()}>
                  <span style={pairCap()}>עד</span>
                  <NumberField
                    aria-label="תקציב מקסימום"
                    value={draft.maxBudget}
                    onChange={(n) => update('maxBudget', n)}
                    unit="₪"
                    placeholder="ללא הגבלה"
                  />
                </label>
              </div>
            </Section>

            <Section title="חדרים">
              <div style={pairRow()}>
                <label style={pairCell()}>
                  <span style={pairCap()}>מ-</span>
                  <NumberField
                    aria-label="מינימום חדרים"
                    value={draft.minRooms}
                    onChange={(n) => update('minRooms', n)}
                    placeholder="0"
                  />
                </label>
                <label style={pairCell()}>
                  <span style={pairCap()}>עד</span>
                  <NumberField
                    aria-label="מקסימום חדרים"
                    value={draft.maxRooms}
                    onChange={(n) => update('maxRooms', n)}
                    placeholder="ללא"
                  />
                </label>
              </div>
            </Section>
          </div>

          {/* Footer actions */}
          <footer style={{
            display: 'flex', gap: 10,
            padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${DT.border}`,
            background: DT.cream4,
          }}>
            <button
              type="button"
              onClick={clearAll}
              style={{
                ...FONT, flex: '0 0 auto',
                padding: '12px 18px', borderRadius: 12,
                background: 'transparent', border: `1px solid ${DT.border}`,
                color: DT.ink2, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              נקה
            </button>
            <button
              type="button"
              onClick={apply}
              style={{
                ...FONT, flex: 1,
                padding: '12px 18px', borderRadius: 12, border: 'none',
                background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
                color: DT.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(180,139,76,0.32)',
              }}
            >
              החל סינון
            </button>
          </footer>
        </aside>

        {/* Keyframes — scoped via a <style> tag next to the Portal. Keeps
            the component self-contained without touching the global CSS. */}
        <style>{`
          @keyframes lfs-fade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes lfs-rise { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
      </div>
    </Portal>
  );
}

// ─── Section + Segmented atoms ──────────────────────────────
function Section({ title, children }) {
  return (
    <section style={{ margin: '0 0 14px' }}>
      <h4 style={{
        ...FONT, fontSize: 12, fontWeight: 700, color: DT.muted,
        margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5,
      }}>{title}</h4>
      {children}
    </section>
  );
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{
      display: 'flex', flexWrap: 'wrap', gap: 6,
    }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button
            key={o.k || '__empty'}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange?.(o.k)}
            style={{
              ...FONT,
              background: on ? DT.ink : DT.white,
              color: on ? DT.cream : DT.ink,
              border: `1px solid ${on ? DT.ink : DT.border}`,
              padding: '10px 14px', borderRadius: 99,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              minHeight: 40,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function pairRow() {
  return {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  };
}
function pairCell() {
  return {
    display: 'flex', flexDirection: 'column', gap: 4,
    fontSize: 12, color: DT.muted,
  };
}
function pairCap() {
  return { fontWeight: 600 };
}
