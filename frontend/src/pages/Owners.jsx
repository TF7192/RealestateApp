// Owners (property owners) list — port of the claude.ai/design bundle
// using the Cream & Gold DT palette with inline styles. Mirrors the
// dense-table treatment of the Customers screen so the two CRM read
// surfaces read the same at a glance.
//
// No fixtures: rows come from GET /api/owners. Favorites, phone +
// WhatsApp shortcuts and the "new owner" dialog all stay from the
// prior implementation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserPlus, Search, Phone, MessageCircle, Building2, Star, Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { formatPhone } from '../lib/phone';
import { useToast } from '../lib/toast';
import { relativeDate } from '../lib/relativeDate';
import OwnerEditDialog from '../components/OwnerEditDialog';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function Owners() {
  const navigate = useNavigate();
  const toast = useToast();
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [filter, setFilter] = useState('all'); // all | favorites | withProps | withoutProps
  const [editing, setEditing] = useState(null); // null | {} new | owner
  const [hoverId, setHoverId] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.listOwners();
      if (mounted.current) setOwners(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת בעלי הנכסים נכשלה');
      if (mounted.current) setOwners([]);
    }
  }, [toast]);

  useEffect(() => {
    mounted.current = true;
    load().finally(() => { if (mounted.current) setLoading(false); });
    api.listFavorites('OWNER')
      .then((r) => {
        if (mounted.current) {
          setFavoriteIds(new Set((r?.items || []).map((f) => f.entityId)));
        }
      })
      .catch(() => { /* stars stay empty */ });
    return () => { mounted.current = false; };
  }, [load]);

  const toggleFavorite = async (ownerId, nextActive) => {
    setFavoriteIds((cur) => {
      const copy = new Set(cur);
      if (nextActive) copy.add(ownerId); else copy.delete(ownerId);
      return copy;
    });
    try {
      if (nextActive) await api.addFavorite({ entityType: 'OWNER', entityId: ownerId });
      else            await api.removeFavorite('OWNER', ownerId);
    } catch (e) {
      setFavoriteIds((cur) => {
        const copy = new Set(cur);
        if (nextActive) copy.delete(ownerId); else copy.add(ownerId);
        return copy;
      });
      toast?.error?.(e?.message || 'שינוי המועדפים נכשל');
    }
  };

  const counts = useMemo(() => {
    const by = { favorites: 0, withProps: 0, withoutProps: 0 };
    for (const o of owners) {
      if (favoriteIds.has(o.id)) by.favorites++;
      if ((o.propertyCount || 0) > 0) by.withProps++;
      else by.withoutProps++;
    }
    return by;
  }, [owners, favoriteIds]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return owners.filter((o) => {
      if (s) {
        const hay = `${o.name || ''} ${o.phone || ''} ${o.email || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filter === 'favorites' && !favoriteIds.has(o.id)) return false;
      if (filter === 'withProps' && !(o.propertyCount > 0)) return false;
      if (filter === 'withoutProps' && (o.propertyCount || 0) > 0) return false;
      return true;
    });
  }, [owners, q, filter, favoriteIds]);

  const filters = [
    { k: 'all',          label: 'הכול',        count: owners.length },
    { k: 'favorites',    label: 'מועדפים',     count: counts.favorites },
    { k: 'withProps',    label: 'עם נכסים',    count: counts.withProps },
    { k: 'withoutProps', label: 'ללא נכסים',   count: counts.withoutProps },
  ];

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            בעלי נכסים
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {owners.length} סך הכול · {counts.favorites} מועדפים · {counts.withProps} עם נכסים
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setEditing({})} style={primaryBtn()}>
            <UserPlus size={14} /> בעל נכס חדש
          </button>
        </div>
      </div>

      {/* Filter pills + search */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {filters.map((f) => {
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
            >{f.label} · {f.count}</button>
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שם / טלפון / אימייל…"
            style={{
              ...FONT, padding: '8px 30px 8px 12px',
              border: `1px solid ${DT.border}`, borderRadius: 99,
              background: DT.white, fontSize: 12, color: DT.ink,
              outline: 'none', width: 240, textAlign: 'right',
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
            טוען בעלי נכסים…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <EmptyState hasAny={owners.length > 0} onCreate={() => setEditing({})} />
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${DT.border}`, background: DT.cream2 }}>
                  {['', 'שם', 'טלפון', 'אימייל', 'נכסים', 'כתובת ראשונה', 'נוסף', ''].map((h, i) => (
                    <th key={i} style={headerCell()}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const first = (o.properties || [])[0];
                  const createdRel = o.createdAt ? relativeDate(o.createdAt) : null;
                  const isFav = favoriteIds.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/owners/${o.id}`)}
                      onMouseEnter={() => setHoverId(o.id)}
                      onMouseLeave={() => setHoverId(null)}
                      style={{
                        borderBottom: `1px solid ${DT.border}`,
                        cursor: 'pointer',
                        background: hoverId === o.id ? DT.cream4 : 'transparent',
                      }}
                    >
                      <td style={{ ...bodyCell(), width: 36 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(o.id, !isFav); }}
                          aria-label={isFav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                          style={{
                            background: 'transparent', border: 'none',
                            padding: 4, cursor: 'pointer', lineHeight: 0,
                            color: isFav ? DT.gold : DT.muted,
                          }}
                        >
                          <Star size={16} fill={isFav ? DT.gold : 'none'} />
                        </button>
                      </td>
                      <td style={bodyCell()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={o.name} />
                          <div style={{ fontWeight: 700 }}>{o.name || 'בעל נכס'}</div>
                        </div>
                      </td>
                      <td style={{
                        ...bodyCell(), color: DT.muted,
                        fontVariantNumeric: 'tabular-nums',
                        direction: 'ltr', textAlign: 'right',
                      }}>
                        {o.phone ? formatPhone(o.phone) : '—'}
                      </td>
                      <td style={{ ...bodyCell(), color: DT.muted }}>{o.email || '—'}</td>
                      <td style={bodyCell()}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: DT.goldSoft, color: DT.goldDark,
                          borderRadius: 99, fontWeight: 700, fontSize: 11,
                          padding: '2px 8px',
                        }}>
                          <Building2 size={11} />
                          {o.propertyCount || 0}
                        </span>
                      </td>
                      <td style={{ ...bodyCell(), color: DT.muted, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {first ? [first.street, first.city].filter(Boolean).join(', ') : '—'}
                      </td>
                      <td style={{ ...bodyCell(), color: DT.muted, fontSize: 12 }}>
                        {createdRel ? createdRel.label : '—'}
                      </td>
                      <td style={{ ...bodyCell(), textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {o.phone && (
                            <a
                              href={`tel:${o.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="התקשר"
                              style={iconBtn(DT.cream2, DT.ink)}
                            ><Phone size={12} /></a>
                          )}
                          {o.phone && (
                            <a
                              href={`https://wa.me/${o.phone.replace(/\D/g, '')}`}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <OwnerEditDialog
          owner={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast?.success?.('בעל הנכס נשמר');
            await load();
          }}
        />
      )}
    </div>
  );
}

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
function actionBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 6, alignItems: 'center', color: DT.ink,
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

function EmptyState({ hasAny, onCreate }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: DT.muted }}>
      <Sparkles size={28} style={{ color: DT.gold, marginBottom: 10 }} aria-hidden="true" />
      <div style={{ fontSize: 16, fontWeight: 800, color: DT.ink, marginBottom: 6 }}>
        {hasAny ? 'אין תוצאות למסנן הזה' : 'עוד אין בעלי נכסים במערכת'}
      </div>
      <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.7 }}>
        {hasAny
          ? 'נסו מסנן אחר או נקו את החיפוש כדי לראות את כל בעלי הנכסים.'
          : 'הוסיפו בעל נכס ראשון כדי להתחיל לעקוב אחרי קשרי הבעלות לנכסים.'}
      </p>
      {!hasAny && (
        <button type="button" onClick={onCreate} style={primaryBtn()}>
          <UserPlus size={14} /> בעל נכס חדש
        </button>
      )}
    </div>
  );
}
