// LeadHistory — full-page event stream for one lead.
//
// Sprint 7. Route: /customers/:id/history. ActivityPanel on
// CustomerDetail is a compact mini-feed; this page is the expanded
// timeline agents bounce to when they want the full story (every
// status change, meeting, note). Reads the same /api/activity surface
// via `api.listActivity({ entityType: 'Lead', entityId })` — entityType
// capitalisation is PascalCase to match how leads.ts writes entries
// (see routes/leads.ts line 282).
//
// Layout: a vertical timeline with gold bullet dots, grouped by day,
// with "היום / אתמול / <relative>" date separators. Inline DT — no
// shared CSS module; matches the Cream & Gold palette used across the
// rest of the ported pages.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, History, Loader2, AlertCircle, User, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Same bucketing scheme we use in ActivityPanel's relative helper, but
// returned as a structured bucket so we can sort groups reliably.
function dayBucketLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - d) / (24 * 3600 * 1000));
  if (diffDays === 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7)  return `לפני ${diffDays} ימים`;
  if (diffDays < 14) return 'לפני שבוע';
  if (diffDays < 30) return `לפני ${Math.round(diffDays / 7)} שבועות`;
  if (diffDays < 60) return 'לפני חודש';
  if (diffDays < 365) return `לפני ${Math.round(diffDays / 30)} חודשים`;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Key we group by — the local YYYY-MM-DD so events on the same calendar
// day cluster together even if their ISO timestamps span midnight UTC.
function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function LeadHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    return Promise.all([
      api.getLead?.(id).catch(() => null),
      api.listActivity({ entityType: 'Lead', entityId: id, limit: 200 }),
    ])
      .then(([leadRes, actRes]) => {
        setLead(leadRes?.lead || leadRes || null);
        setItems(actRes?.items || []);
      })
      .catch((e) => setError(e?.message || 'טעינת ההיסטוריה נכשלה'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  // Group events by day, preserving the newest-first ordering returned
  // by the server. We iterate in order and push into buckets on first
  // sight of each dayKey, so the day-group order naturally follows the
  // data's descending sort.
  const groups = useMemo(() => {
    const byDay = new Map();
    for (const ev of items) {
      if (!ev?.createdAt) continue;
      const key = dayKey(ev.createdAt);
      if (!byDay.has(key)) {
        byDay.set(key, {
          key,
          label: dayBucketLabel(ev.createdAt),
          date: ev.createdAt,
          events: [],
        });
      }
      byDay.get(key).events.push(ev);
    }
    return Array.from(byDay.values());
  }, [items]);

  const leadName = lead?.name || 'הלקוח';

  return (
    <div dir="rtl" style={{
      ...FONT, padding: 28, color: DT.ink, minHeight: '100%',
      background: DT.cream,
    }}>
      {/* Back + header */}
      <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            ...FONT, background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DT.muted, fontSize: 13, fontWeight: 700, padding: 0,
          }}
        >
          <ArrowRight size={16} />
          חזרה ללקוח
        </button>
      </div>

      <header style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: DT.goldSoft, color: DT.goldDark,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <History size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, color: DT.goldDark,
            background: DT.goldSoft, padding: '3px 10px', borderRadius: 99,
            letterSpacing: 0.3, marginBottom: 6,
          }}>
            היסטוריה מלאה
          </span>
          <h1 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: -0.4,
            margin: 0, color: DT.ink,
          }}>
            {leadName}
          </h1>
          <div style={{ fontSize: 12, color: DT.muted, marginTop: 4 }}>
            {items.length.toLocaleString('he-IL')} אירועים רשומים
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            to={`/customers/${id}`}
            style={secondaryBtn()}
          >
            <User size={14} /> לעמוד הלקוח
          </Link>
          <button type="button" onClick={load} style={secondaryBtn()}>
            <RefreshCw size={14} /> רענן
          </button>
        </div>
      </header>

      {/* States — loading / error / empty / timeline. */}
      {loading && items.length === 0 ? (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: 24,
          display: 'flex', alignItems: 'center', gap: 10, color: DT.muted,
        }}>
          <Loader2 size={16} className="y2-spin" />
          <span>טוען היסטוריה…</span>
        </div>
      ) : error ? (
        <div style={{
          background: 'rgba(185,28,28,0.06)',
          border: `1px solid rgba(185,28,28,0.18)`,
          color: DT.danger, borderRadius: 14, padding: 18,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1, minWidth: 180 }}>{error}</span>
          <button type="button" onClick={load} style={secondaryBtn()}>
            נסה שוב
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: 40, textAlign: 'center',
          color: DT.muted, fontSize: 14,
        }}>
          <History size={32} style={{ opacity: 0.4, marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: DT.ink, marginBottom: 4 }}>
            אין עדיין אירועים
          </div>
          <div>עדכונים אוטומטיים יופיעו כאן ככל שהלקוח מתקדם.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map((g) => (
            <DayGroup key={g.key} label={g.label} events={g.events} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayGroup({ label, events }) {
  return (
    <section
      aria-label={label}
      style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20,
      }}
    >
      {/* Day separator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800, color: DT.goldDark,
          background: DT.goldSoft, padding: '4px 12px', borderRadius: 99,
          letterSpacing: 0.3,
        }}>
          {label}
        </span>
        <span style={{
          flex: 1, height: 1, background: DT.border,
        }} />
      </div>

      {/* Timeline — vertical line with gold dots. RTL keeps the line on
          the right. `position: relative` on the ul lets the ::before
          pseudo-line run full-height through the dots; we fake it with
          a single absolutely-positioned `<span>` because inline-style
          can't set pseudo-elements. */}
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0, position: 'relative',
      }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 10, bottom: 10,
            insetInlineEnd: 7,
            width: 1, background: DT.border,
          }}
        />
        {events.map((ev) => (
          <li
            key={ev.id}
            style={{
              display: 'flex', gap: 12, padding: '8px 0',
              position: 'relative',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10, height: 10, borderRadius: 99,
                background: DT.gold, marginTop: 6, marginInlineStart: 2,
                flexShrink: 0, position: 'relative', zIndex: 1,
                boxShadow: `0 0 0 3px ${DT.white}`,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: DT.ink, lineHeight: 1.5 }}>
                {ev.actorName && (
                  <span style={{ fontWeight: 700, marginInlineEnd: 4 }}>
                    {ev.actorName}
                  </span>
                )}
                <span style={{ color: DT.ink2 }}>
                  {ev.summary || ev.action || ev.kind || 'עדכון'}
                </span>
              </div>
              {ev.createdAt && (
                <time
                  dateTime={ev.createdAt}
                  style={{ display: 'block', fontSize: 11, color: DT.muted, marginTop: 2 }}
                >
                  {timeLabel(ev.createdAt)}
                </time>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
