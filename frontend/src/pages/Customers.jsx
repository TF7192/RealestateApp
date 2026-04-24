// Customers (leads) list — port of the claude.ai/design bundle's
// DLeads (estia-new-project/project/src/desktop/screens-1.jsx).
// Filter pill row + dense data table. No fixtures: rows come from
// GET /api/leads. Row click → /customers/:id. Actions cell has
// direct phone + WhatsApp launchers so the agent never has to open
// the detail page for a one-tap outreach.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Upload, Filter, Phone, MessageCircle, Sparkles, Search,
} from 'lucide-react';
import api from '../lib/api';
import { formatPhone } from '../lib/phone';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  hot: '#b91c1c', warm: '#b45309', cold: '#475569',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const FILTERS = [
  { k: 'all',    label: 'הכול' },
  { k: 'hot',    label: 'חמים' },
  { k: 'warm',   label: 'פושרים' },
  { k: 'cold',   label: 'קרים' },
  { k: 'stale',  label: 'ללא מענה 24ש' },
];

export default function Customers() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listLeads();
        if (!cancelled) setLeads(res?.items || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const by = { hot: 0, warm: 0, cold: 0, stale: 0 };
    const now = Date.now();
    for (const l of leads) {
      const s = (l.status || '').toUpperCase();
      if (s === 'HOT')  by.hot++;
      if (s === 'WARM') by.warm++;
      if (s === 'COLD') by.cold++;
      const lastContact = l.lastContact ? new Date(l.lastContact).getTime() : 0;
      if (!lastContact || now - lastContact > 24 * 60 * 60 * 1000) by.stale++;
    }
    return by;
  }, [leads]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (qq) {
        const haystack = `${l.name || ''} ${l.phone || ''} ${l.city || ''} ${l.email || ''}`.toLowerCase();
        if (!haystack.includes(qq)) return false;
      }
      const status = (l.status || '').toUpperCase();
      if (filter === 'hot'  && status !== 'HOT')  return false;
      if (filter === 'warm' && status !== 'WARM') return false;
      if (filter === 'cold' && status !== 'COLD') return false;
      if (filter === 'stale') {
        const lastContact = l.lastContact ? new Date(l.lastContact).getTime() : 0;
        if (lastContact && Date.now() - lastContact <= 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [leads, filter, q]);

  const pillCount = (k) => {
    if (k === 'all')  return leads.length;
    return counts[k] || 0;
  };

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>לידים</h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {leads.length} סך הכול · {counts.hot} חמים · {counts.warm} פושרים · {counts.cold} קרים
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              const el = document.querySelector('[data-customers-search]');
              if (el) el.focus();
            }}
            style={actionBtn()}
          >
            <Filter size={14} /> מסננים
          </button>
          <Link to="/import/leads" style={actionBtn()}>
            <Upload size={14} /> ייבוא
          </Link>
          <Link to="/customers/new" style={primaryBtn()}>
            <Plus size={14} /> ליד חדש
          </Link>
        </div>
      </div>

      {/* Filter pills + search */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {FILTERS.map((f) => {
          const on = filter === f.k;
          return (
            <button
              key={f.k}
              type="button"
              onClick={() => setFilter(f.k)}
              style={{
                ...FONT,
                background: on ? DT.ink : DT.white,
                color: on ? DT.cream : DT.ink,
                border: `1px solid ${on ? DT.ink : DT.border}`,
                padding: '7px 12px', borderRadius: 99,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >{f.label} · {pillCount(f.k)}</button>
          );
        })}
        <div style={{
          marginInlineStart: 'auto', position: 'relative',
          display: 'inline-flex', alignItems: 'center',
        }}>
          <Search size={14} style={{
            position: 'absolute', insetInlineEnd: 10,
            top: '50%', transform: 'translateY(-50%)',
            color: DT.muted, pointerEvents: 'none',
          }} />
          <input
            data-customers-search
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שם / טלפון / עיר…"
            style={{
              ...FONT, padding: '8px 30px 8px 12px',
              border: `1px solid ${DT.border}`, borderRadius: 99,
              background: DT.white, fontSize: 12, color: DT.ink,
              outline: 'none', width: 220, textAlign: 'right',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: DT.muted, fontSize: 13 }}>
            טוען לידים…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <EmptyState filter={filter} hasAny={leads.length > 0} />
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${DT.border}`, background: DT.cream2 }}>
                  {['שם', 'טלפון', 'עיר', 'תקציב', 'מה מחפש', 'מקור', 'עודכן', ''].map((h) => (
                    <th key={h} style={headerCell()}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/customers/${l.id}`)}
                    onMouseEnter={() => setHoverId(l.id)}
                    onMouseLeave={() => setHoverId(null)}
                    style={{
                      borderBottom: `1px solid ${DT.border}`,
                      cursor: 'pointer',
                      background: hoverId === l.id ? DT.cream4 : 'transparent',
                    }}
                  >
                    <td style={bodyCell()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={l.name} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{l.name || 'ליד'}</div>
                          <StatusChip status={l.status} />
                        </div>
                      </div>
                    </td>
                    <td style={{ ...bodyCell(), color: DT.muted, fontVariantNumeric: 'tabular-nums', direction: 'ltr', textAlign: 'right' }}>
                      {l.phone ? formatPhone(l.phone) : '—'}
                    </td>
                    <td style={bodyCell()}>{l.city || '—'}</td>
                    <td style={{ ...bodyCell(), fontWeight: 700 }}>
                      {l.budget ? `₪${Math.round(l.budget / 1000)}K` : (l.priceRangeLabel || '—')}
                    </td>
                    <td style={{
                      ...bodyCell(), color: DT.muted,
                      maxWidth: 220, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {[l.rooms ? `${l.rooms} חד׳` : null, l.lookingFor === 'BUY' ? 'קנייה' : 'שכירות']
                        .filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ ...bodyCell(), color: DT.muted, fontSize: 12 }}>{l.source || '—'}</td>
                    <td style={{ ...bodyCell(), color: DT.muted, fontSize: 12 }}>
                      {l.updatedAt
                        ? new Date(l.updatedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td style={{ ...bodyCell(), textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {l.phone && (
                          <a
                            href={`tel:${l.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="התקשר"
                            style={iconBtn(DT.cream2, DT.ink)}
                          ><Phone size={12} /></a>
                        )}
                        {l.phone && (
                          <a
                            href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="WhatsApp"
                            style={iconBtn('rgba(21,128,61,0.12)', DT.success)}
                          ><MessageCircle size={12} /></a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cells / atoms ──────────────────────────────────────────
function headerCell() {
  return {
    padding: '12px 14px', textAlign: 'right',
    fontSize: 11, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
  };
}
function bodyCell() {
  return { padding: '12px 14px', verticalAlign: 'middle' };
}
function actionBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function iconBtn(bg, color) {
  return {
    background: bg, border: 'none',
    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
    color, display: 'grid', placeItems: 'center', textDecoration: 'none',
  };
}

function Avatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
      color: DT.ink, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: size * 0.4, flexShrink: 0,
    }}>{name ? name.charAt(0) : '?'}</div>
  );
}

function StatusChip({ status }) {
  const s = (status || '').toUpperCase();
  const map = {
    HOT:  { label: '🔥 חם', color: DT.hot,  bg: 'rgba(185,28,28,0.12)' },
    WARM: { label: 'פושר',  color: DT.warm, bg: 'rgba(180,83,9,0.12)' },
    COLD: { label: 'קר',    color: DT.cold, bg: 'rgba(71,85,105,0.12)' },
  };
  const cfg = map[s];
  if (!cfg) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: cfg.bg, color: cfg.color,
      borderRadius: 99, fontWeight: 700, fontSize: 10,
      padding: '2px 7px', marginTop: 2,
    }}>{cfg.label}</span>
  );
}

function EmptyState({ filter, hasAny }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: DT.muted }}>
      <Sparkles size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        {hasAny ? 'אין תוצאות למסנן הזה' : 'עדיין אין לידים'}
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        {hasAny
          ? 'נסו מסנן אחר או נקו את החיפוש כדי לראות את כל הלידים.'
          : 'התחילו עם ליד ראשון — הקלדה ידנית או ייבוא מ-Excel.'}
      </p>
      {!hasAny && (
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <Link to="/customers/new" style={primaryBtn()}>
            <Plus size={14} /> ליד חדש
          </Link>
          <Link to="/import/leads" style={actionBtn()}>
            <Upload size={14} /> ייבוא מ-Excel
          </Link>
        </div>
      )}
    </div>
  );
}
