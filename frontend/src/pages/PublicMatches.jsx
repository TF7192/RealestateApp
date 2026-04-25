// Sprint 10 — התאמות פומביות ("Public matches") surface. Cross-agent
// pool of properties; viewer sees a ranked list (by how many of their
// leads match each pool property) plus a duplicate CTA that clones the
// row into their own inventory. Match-first ordering is the core pitch:
// "the ones your buyers actually want float to the top."

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, Users, Building2, Copy, X as XIcon, Search,
  MapPin, Bed, BedSingle, Bath, Wallet, Tag,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayText, displayPrice, displayNumber } from '../lib/display';
import { useViewportMobile } from '../hooks/mobile';
import EmptyState from '../components/EmptyState';
import Portal from '../components/Portal';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function PublicMatches() {
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useViewportMobile(820);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('matching'); // matching | all
  const [q, setQ] = useState('');
  const [dupeFor, setDupeFor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listPublicMatches();
      setItems(res?.items || []);
    } catch {
      toast.error('טעינת התאמות פומביות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = items;
    if (filter === 'matching') rows = rows.filter((r) => r.matchCount > 0);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((r) => {
        const hay = [r.street, r.city, r.neighborhood, r.owner?.displayName, r.owner?.officeName]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      });
    }
    return rows;
  }, [items, filter, q]);

  const handleDuplicate = async (row) => {
    setBusyId(row.id);
    try {
      const res = await api.duplicatePublicMatch(row.id);
      toast.success('הנכס שוכפל לרשימה שלך');
      window.dispatchEvent(new CustomEvent('estia:public-matches-changed'));
      const newId = res?.property?.id;
      setDupeFor(null);
      if (newId) navigate(`/properties/${newId}`);
    } catch (e) {
      toast.error(e?.message || 'שכפול הנכס נכשל');
    } finally {
      setBusyId(null);
    }
  };

  const matchingCount = items.filter((r) => r.matchCount > 0).length;

  return (
    <div dir="rtl" style={{
      ...FONT, color: DT.ink, minHeight: '100%',
      padding: isMobile ? '18px 14px 40px' : 28,
    }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: isMobile ? 14 : 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            color: DT.goldDark, fontSize: 11, fontWeight: 700, letterSpacing: 1,
          }}>
            <Sparkles size={12} /> ESTIA · מאגר שיתוף
          </div>
          <h1 style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 800,
            letterSpacing: -0.7, margin: '4px 0 0',
          }}>התאמות פומביות</h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4, lineHeight: 1.6 }}>
            {items.length} נכסים שסוכנים אחרים שיתפו לשיתוף ושכפול.
            {matchingCount > 0 && (
              <>
                {' · '}
                <strong style={{ color: DT.goldDark, fontWeight: 700 }}>
                  {matchingCount} תואמים ללידים שלך
                </strong>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter chips + search */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <Chip active={filter === 'matching'} onClick={() => setFilter('matching')}>
          תואמים ללידים שלי · {matchingCount}
        </Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          כל הנכסים · {items.length}
        </Chip>
        <div style={{
          marginInlineStart: 'auto', position: 'relative',
          minWidth: isMobile ? '100%' : 260,
        }}>
          <span style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            insetInlineEnd: 12, color: DT.muted, pointerEvents: 'none',
          }}><Search size={14} /></span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש עיר / סוכן / משרד"
            style={{
              ...FONT, width: '100%', padding: '8px 34px 8px 12px',
              border: `1px solid ${DT.border}`, borderRadius: 9,
              background: DT.white, color: DT.ink, fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* List */}
      {loading && !items.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              height: 128, borderRadius: 14,
              background: `linear-gradient(90deg, ${DT.cream2}, ${DT.white}, ${DT.cream2})`,
              backgroundSize: '200% 100%',
              animation: 'pm-shimmer 1.4s infinite linear',
              border: `1px solid ${DT.border}`,
            }} />
          ))}
          <style>{`
            @keyframes pm-shimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === 'matching' ? 'אין התאמות כרגע' : 'המאגר ריק כעת'}
          description={
            filter === 'matching'
              ? 'הוסיפו לידים או הוסיפו פרופילי חיפוש — כשיצטבר מלאי מתאים, הוא יופיע כאן.'
              : 'עדיין לא שותפו נכסים למאגר. אפשר לשתף נכס משלכם מדף הנכס.'
          }
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 14,
        }}>
          {filtered.map((r) => (
            <PoolCard
              key={r.id}
              row={r}
              busy={busyId === r.id}
              onDuplicate={() => setDupeFor(r)}
            />
          ))}
        </div>
      )}

      {/* Duplicate confirm sheet */}
      {dupeFor && (
        <DuplicateSheet
          row={dupeFor}
          busy={busyId === dupeFor.id}
          onCancel={() => setDupeFor(null)}
          onConfirm={() => handleDuplicate(dupeFor)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...FONT,
        background: active ? DT.ink : DT.white,
        color: active ? DT.cream : DT.ink,
        border: `1px solid ${active ? DT.ink : DT.border}`,
        padding: '7px 14px', borderRadius: 99,
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function PoolCard({ row, busy, onDuplicate }) {
  const assetLabel = row.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים';
  const dealLabel = row.category === 'RENT' ? 'להשכרה' : 'למכירה';
  const priceLabel = row.marketingPrice != null ? displayPrice(row.marketingPrice) : '—';
  return (
    <article style={{
      background: DT.white,
      border: row.matchCount > 0 ? `1px solid ${DT.gold}` : `1px solid ${DT.border}`,
      borderRadius: 14, padding: 0, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: row.matchCount > 0 ? '0 4px 12px rgba(180,139,76,0.15)' : '0 1px 0 rgba(30,26,20,0.03)',
    }}>
      {/* Photo or placeholder */}
      <div style={{
        height: 156, background: DT.cream3,
        backgroundImage: row.image ? `url(${row.image})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
        position: 'relative',
      }}>
        {/* Match badge — top start. Always drawn so "0 match" cards
            still read as part of the same grid, just tonally muted. */}
        <div style={{
          position: 'absolute', top: 10, insetInlineStart: 10,
          background: row.matchCount > 0 ? DT.gold : 'rgba(30,26,20,0.72)',
          color: row.matchCount > 0 ? DT.ink : DT.cream,
          fontSize: 11, fontWeight: 800,
          padding: '4px 10px', borderRadius: 99,
          display: 'inline-flex', gap: 4, alignItems: 'center',
          boxShadow: '0 2px 6px rgba(30,26,20,0.25)',
        }}>
          <Users size={11} /> {row.matchCount} לידים
        </div>
        {/* Copies badge — top end */}
        {row.copies > 0 && (
          <div style={{
            position: 'absolute', top: 10, insetInlineEnd: 10,
            background: 'rgba(30,26,20,0.72)', color: DT.cream,
            fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 99,
            display: 'inline-flex', gap: 4, alignItems: 'center',
          }}>
            <Copy size={11} /> {row.copies}
          </div>
        )}
      </div>

      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>
            {displayText(row.street)}, {displayText(row.city)}
          </div>
          {row.neighborhood && (
            <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>
              <MapPin size={11} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
              {displayText(row.neighborhood)}
            </div>
          )}
        </div>

        {/* Attribute row */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          fontSize: 12, color: DT.muted,
        }}>
          {row.rooms != null && (
            <span><BedSingle size={11} style={{ verticalAlign: '-2px' }} /> {row.rooms} חד׳</span>
          )}
          {row.sqm != null && (
            <span><Building2 size={11} style={{ verticalAlign: '-2px' }} /> {displayNumber(row.sqm)} מ״ר</span>
          )}
          {row.bathrooms != null && (
            <span><Bath size={11} style={{ verticalAlign: '-2px' }} /> {row.bathrooms} אמב׳</span>
          )}
          <span><Tag size={11} style={{ verticalAlign: '-2px' }} /> {assetLabel} · {dealLabel}</span>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, borderTop: `1px solid ${DT.border}`, paddingTop: 10,
        }}>
          <div>
            <div style={{
              fontSize: 10, color: DT.muted, fontWeight: 600, letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>מחיר שיווק</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: DT.goldDark }}>
              <Wallet size={12} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
              {priceLabel}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onDuplicate}
            style={{
              ...FONT,
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              border: 'none', color: DT.ink,
              padding: '9px 14px', borderRadius: 10,
              fontSize: 12, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              boxShadow: '0 2px 6px rgba(180,139,76,0.28)',
            }}
          >
            <Copy size={13} /> {busy ? 'משכפל…' : 'שכפל לרשימה שלי'}
          </button>
        </div>

        {/* Published-by strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: DT.muted, marginTop: 2,
        }}>
          {row.owner?.avatarUrl ? (
            <img
              src={row.owner.avatarUrl}
              alt=""
              style={{ width: 22, height: 22, borderRadius: 99, objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: 99,
              background: DT.goldSoft, color: DT.goldDark,
              fontSize: 11, fontWeight: 800,
              display: 'grid', placeItems: 'center',
            }}>{(row.owner?.displayName || '?').slice(0, 1)}</div>
          )}
          <span>
            פורסם ע״י <strong style={{ color: DT.ink }}>{row.owner?.displayName || 'סוכן'}</strong>
            {row.owner?.officeName ? ` · ${row.owner.officeName}` : ''}
          </span>
        </div>

        {/* Publisher note + top matches */}
        {row.publicMatchNote && (
          <div style={{
            fontSize: 12, color: DT.ink, background: DT.cream4,
            borderInlineStart: `3px solid ${DT.gold}`,
            padding: '8px 10px', borderRadius: 8, lineHeight: 1.5,
          }}>
            „{row.publicMatchNote}"
          </div>
        )}
        {row.matchCount > 0 && row.topMatches?.length > 0 && (
          <div style={{ fontSize: 11, color: DT.muted, lineHeight: 1.6 }}>
            מתאים ל:{' '}
            {row.topMatches.map((m, i) => (
              <span key={m.id}>
                <Link to={`/customers/${m.id}`} style={{ color: DT.gold, fontWeight: 700, textDecoration: 'none' }}>
                  {m.name || 'ליד'}
                </Link>
                {i < row.topMatches.length - 1 ? ', ' : ''}
              </span>
            ))}
            {row.matchCount > row.topMatches.length ? ` ועוד ${row.matchCount - row.topMatches.length}` : ''}
          </div>
        )}
      </div>
    </article>
  );
}

function DuplicateSheet({ row, busy, onCancel, onConfirm }) {
  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="שכפול נכס"
        style={{
          // Portal + z:1000 so the backdrop covers the topbar (z:20)
          // and the sidebar (z:30) — the inline render was clipped
          // by the <main> stacking context and left the app chrome
          // fully bright behind the modal.
          position: 'fixed', inset: 0, background: 'rgba(30,26,20,0.6)',
          display: 'grid', placeItems: 'center', padding: 16, zIndex: 1000,
          overflowY: 'auto',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
      <div style={{
        ...FONT, background: DT.white, borderRadius: 16,
        padding: 22, maxWidth: 420, width: '100%',
        border: `1px solid ${DT.border}`,
        boxShadow: '0 10px 30px rgba(30,26,20,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: DT.ink }}>שכפל לרשימה שלך?</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="סגור"
            style={{
              border: 'none', background: DT.cream3, borderRadius: 9,
              width: 32, height: 32, cursor: 'pointer',
              display: 'grid', placeItems: 'center', color: DT.ink,
            }}
          ><XIcon size={15} /></button>
        </div>
        <p style={{ fontSize: 13, color: DT.muted, lineHeight: 1.6, marginTop: 8 }}>
          ייווצר עותק של <strong>{row.street}, {row.city}</strong> ברשימה שלך.
          הסוכן שפרסם את הנכס ({row.owner?.displayName || '—'}) יקבל התראה על השכפול.
          העותק יתחיל במצב פנוי ללא לקוחות פעילים — תוכלו לערוך פרטים לאחר שכפול.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...FONT, background: DT.white, color: DT.ink,
              border: `1px solid ${DT.border}`, padding: '9px 14px',
              borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >ביטול</button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              ...FONT, background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink, border: 'none', padding: '9px 14px',
              borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 800,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Copy size={14} /> {busy ? 'משכפל…' : 'שכפל עכשיו'}
          </button>
        </div>
      </div>
      </div>
    </Portal>
  );
}
