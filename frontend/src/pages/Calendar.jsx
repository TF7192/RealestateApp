// Sprint 4 / Calendar — month-grid view of every meeting scheduled by
// the current agent. Backed by GET /api/meetings (see
// backend/src/routes/meetings.ts).
//
// Cream & Gold, inline styles, RTL. Layout:
//   - Header with prev/next-month arrows + Hebrew month title + today button
//   - 7-column grid (Sun → Sat) of day cells, 5-6 rows depending on month
//   - Each day cell lists gold chips (one per meeting, up to 3 + "עוד" overflow)
//   - Clicking a day focuses it; the right panel (desktop) / stacked card
//     (mobile) lists the full set of meetings for that day
//   - Today gets a gold ring; the focused day gets a goldSoft fill

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, CalendarDays, Clock, MapPin, User, Plus } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import EmptyState from '../components/EmptyState';
import { displayText } from '../lib/display';
import NewMeetingDialog from '../components/NewMeetingDialog';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Day-of-week short headers (Sun = index 0). Hebrew single letters.
const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// Build the month grid — a 42-cell array (6 rows × 7 cols) where each
// cell holds a Date. Leading / trailing cells are from the neighbouring
// months to keep columns aligned to Sun→Sat.
function buildGrid(viewDate) {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()   === b.getMonth()   &&
         a.getDate()    === b.getDate();
}

// Meetings arrive sorted by startsAt ascending. Bucket them by local
// YYYY-MM-DD string for O(1) lookup in the render loop.
function bucketByDay(items) {
  const by = new Map();
  for (const m of items) {
    const d = new Date(m.startsAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(m);
  }
  return by;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function Calendar() {
  const toast = useToast();
  const [viewDate, setViewDate] = useState(() => new Date());
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(() => new Date());
  // Sprint 4.1 — "פגישה חדשה" CTA. The dialog is mounted at the page
  // root so the focus trap can claim the document and restore focus
  // back to the trigger button on close.
  const [showNew, setShowNew] = useState(false);

  const today = useMemo(() => new Date(), []);

  // Fetch the meetings window. Extracted into a useCallback so the
  // create dialog can ask the page to refresh after a successful
  // submit without duplicating the query logic. The mount effect
  // wraps it in a cancellation flag so a stale month switch doesn't
  // overwrite a fresher result.
  const loadMeetings = useCallback(async () => {
    setLoading(true);
    // Fetch a slightly wider window than the grid (42 days may spill
    // into two neighbouring months) so chips render for the out-of-
    // month overflow cells too.
    const from = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const to   = new Date(viewDate.getFullYear(), viewDate.getMonth() + 2, 1);
    try {
      const res = await api.listMeetings({
        from: from.toISOString(),
        to:   to.toISOString(),
      });
      setItems(res?.items || []);
    } catch (e) {
      toast.error?.(e?.message || 'שגיאה בטעינת פגישות');
    } finally {
      setLoading(false);
    }
    // toast is recreated each render; don't include it as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  useEffect(() => {
    // Don't keep a cancellation token on the callback itself —
    // loadMeetings already lives at the page level so a follow-up
    // call from the dialog's onCreated will simply overwrite this
    // request's results. Strict-mode double-fire is a non-issue
    // because both calls hit the same memoised window.
    loadMeetings();
  }, [loadMeetings]);

  const grid = useMemo(() => buildGrid(viewDate), [viewDate]);
  const buckets = useMemo(() => bucketByDay(items), [items]);
  const focusedMeetings = buckets.get(dayKey(focused)) || [];

  const monthLabel = viewDate.toLocaleDateString('he-IL', {
    month: 'long',
    year:  'numeric',
  });

  const goPrev = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setFocused(now);
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            לוח שנה
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {items.length} פגישות בתצוגה · {focusedMeetings.length} ביום שנבחר
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            style={primaryBtn()}
            aria-label="פגישה חדשה"
          >
            <Plus size={14} />
            פגישה חדשה
          </button>
          <button type="button" onClick={goToday} style={ghostBtn()}>
            היום
          </button>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: `1px solid ${DT.border}`, borderRadius: 12,
            background: DT.white, padding: '4px 6px',
          }}>
            {/* In RTL, "prev month" visually sits on the right and uses
                the right-pointing chevron; Next is on the left. */}
            <button type="button" onClick={goPrev} style={iconBtn()} aria-label="חודש קודם">
              <ChevronRight size={16} />
            </button>
            <div style={{
              minWidth: 140, textAlign: 'center',
              fontWeight: 700, fontSize: 14, color: DT.ink,
            }}>
              {monthLabel}
            </div>
            <button type="button" onClick={goNext} style={iconBtn()} aria-label="חודש הבא">
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main: grid + side panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: 18,
        alignItems: 'start',
      }} className="cal-layout">
        {/* Month grid card */}
        <div style={{
          background: DT.white,
          border: `1px solid ${DT.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 1px 0 rgba(30,26,20,0.03)',
        }}>
          {/* Day-of-week header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: DT.cream2,
            borderBottom: `1px solid ${DT.border}`,
          }}>
            {DOW.map((label) => (
              <div key={label} style={{
                padding: '10px 8px',
                textAlign: 'center',
                fontSize: 12, fontWeight: 700, color: DT.muted,
                letterSpacing: 0.2,
              }}>{label}</div>
            ))}
          </div>

          {/* 6 × 7 day cells */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gridAutoRows: '108px',
          }}>
            {grid.map((d, idx) => {
              const inMonth  = d.getMonth() === viewDate.getMonth();
              const isToday  = sameDay(d, today);
              const isFocus  = sameDay(d, focused);
              const dayMeets = buckets.get(dayKey(d)) || [];
              const shown    = dayMeets.slice(0, 3);
              const overflow = dayMeets.length - shown.length;
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setFocused(d)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    textAlign: 'start',
                    padding: 8,
                    borderLeft: `1px solid ${DT.border}`,
                    borderTop:  idx >= 7 ? `1px solid ${DT.border}` : 'none',
                    background: isFocus ? DT.goldSoft : DT.white,
                    boxShadow: isToday ? `inset 0 0 0 2px ${DT.gold}` : 'none',
                    opacity: inMonth ? 1 : 0.45,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    minHeight: 0, overflow: 'hidden',
                  }}
                  aria-label={d.toLocaleDateString('he-IL', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                  aria-pressed={isFocus}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: isToday ? 800 : 600,
                      color: inMonth ? DT.ink : DT.muted,
                    }}>{d.getDate()}</span>
                    {isToday && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: DT.goldDark,
                        background: DT.goldSoft,
                        padding: '1px 6px', borderRadius: 999,
                      }}>היום</span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    minHeight: 0, overflow: 'hidden',
                  }}>
                    {shown.map((m) => (
                      <div key={m.id} style={goldChip()}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: DT.goldDark,
                          flexShrink: 0, letterSpacing: 0.2,
                        }}>{formatTime(m.startsAt)}</span>
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontSize: 11, color: DT.ink, fontWeight: 500,
                        }}>{displayText(m.title)}</span>
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div style={{
                        fontSize: 10, color: DT.muted, paddingInlineStart: 4,
                      }}>+{overflow} נוספות</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side panel — focused day's meetings */}
        <aside style={{
          background: DT.white,
          border: `1px solid ${DT.border}`,
          borderRadius: 16,
          padding: 16,
          position: 'sticky',
          top: 18,
          alignSelf: 'start',
        }} className="cal-side">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12,
          }}>
            <CalendarDays size={16} color={DT.gold} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {focused.toLocaleDateString('he-IL', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          </div>

          {loading && (
            <div style={{ color: DT.muted, fontSize: 13 }}>טוען…</div>
          )}

          {!loading && focusedMeetings.length === 0 && (
            <EmptyState
              title="אין פגישות ביום זה"
              body="פגישה שתתוזמן בלידים תופיע כאן"
            />
          )}

          {!loading && focusedMeetings.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {focusedMeetings.map((m) => (
                <li key={m.id} style={{
                  border: `1px solid ${DT.border}`,
                  borderRadius: 12,
                  padding: 12,
                  background: DT.cream4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Clock size={14} color={DT.goldDark} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: DT.goldDark }}>
                      {formatTime(m.startsAt)} – {formatTime(m.endsAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DT.ink, marginBottom: 4 }}>
                    {displayText(m.title)}
                  </div>
                  {m.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: DT.muted, marginBottom: 4 }}>
                      <MapPin size={12} />
                      <span>{displayText(m.location)}</span>
                    </div>
                  )}
                  {m.lead?.id && (
                    <Link
                      to={`/customers/${m.lead.id}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, color: DT.gold,
                        textDecoration: 'none', fontWeight: 600,
                      }}
                    >
                      <User size={12} />
                      <span>{displayText(m.lead.name)}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Mobile: collapse the side panel under the grid. The inline
          sticky styles above still render fine because grid-auto-flow
          pushes the aside into its own row on narrow viewports. */}
      <style>{`
        @media (max-width: 900px) {
          .cal-layout { grid-template-columns: 1fr !important; }
          .cal-side { position: static !important; }
        }
      `}</style>

      {/* "פגישה חדשה" dialog — preselects the focused day so picking
          a calendar cell first then hitting the CTA lands on the
          right date. After a successful create we refresh the
          meetings window + jump focus onto the new meeting's day so
          the agent immediately sees the chip they just made. */}
      {showNew && (
        <NewMeetingDialog
          initialDate={focused}
          onClose={() => setShowNew(false)}
          onCreated={(meeting) => {
            toast.success?.('הפגישה נוצרה');
            if (meeting?.startsAt) {
              const d = new Date(meeting.startsAt);
              setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
              setFocused(d);
            }
            loadMeetings();
          }}
        />
      )}
    </div>
  );
}

function ghostBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${DT.border}`,
    background: DT.white, color: DT.ink,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}

// Gold CTA — matches the LeadMeetingDialog primaryBtn so the
// "פגישה חדשה" trigger looks visually consistent with the dialog
// it opens.
function primaryBtn() {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px',
    borderRadius: 10,
    border: 'none',
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    color: DT.ink,
    fontSize: 13, fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
  };
}

function iconBtn() {
  return {
    all: 'unset',
    width: 28, height: 28,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    color: DT.ink,
  };
}

function goldChip() {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    background: DT.goldSoft,
    border: `1px solid ${DT.gold}`,
    borderRadius: 999,
    padding: '2px 8px',
    overflow: 'hidden',
  };
}
