// Deal detail — standalone /deals/:id page. Port of the claude.ai/design
// bundle with the Cream & Gold DT palette and inline styles, matching
// the OwnerDetail / PropertyDetail aesthetic.
//
// The existing inline DealEditModal on Deals.jsx is reused via export —
// the "עריכה" button here simply summons it so there is a single copy
// of the deal-form validation and submit logic.
//
// No fixtures — GET /api/deals/:id is the only source, plus a call to
// /api/activity?entityType=Deal&entityId=:id for the status timeline.

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight, AlertCircle, Edit3, Building2, UserCircle,
  Phone, MessageCircle, Scale, Calendar, Clock, CheckCircle,
} from 'lucide-react';
import api from '../lib/api';
import { DealEditModal } from './Deals';
import { relativeDate } from '../lib/relativeDate';
import { absoluteTime } from '../lib/time';
import { formatPhone } from '../lib/phone';
import OfferReviewPanel from '../components/OfferReviewPanel';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', warning: '#b45309', danger: '#b91c1c',
  info: '#2563eb',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const STATUS_LABELS = {
  NEGOTIATING:      'משא ומתן',
  WAITING_MORTGAGE: 'אישור משכנתא',
  PENDING_CONTRACT: 'לקראת חתימה',
  SIGNED:           'נחתם',
  FELL_THROUGH:     'לא יצא לפועל',
  CLOSED:           'נסגרה',
  CANCELLED:        'בוטלה',
};

function assetLabel(ac) { return ac === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'; }
function categoryLabel(c) { return c === 'SALE' ? 'מכירה' : 'השכרה'; }
function formatPrice(price) {
  if (price == null) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}
function statusAccent(status) {
  if (status === 'SIGNED' || status === 'CLOSED') {
    return { bg: 'rgba(21,128,61,0.12)', fg: DT.success, icon: <CheckCircle size={12} /> };
  }
  if (status === 'WAITING_MORTGAGE' || status === 'PENDING_CONTRACT') {
    return { bg: 'rgba(180,83,9,0.12)', fg: DT.warning, icon: <Clock size={12} /> };
  }
  if (status === 'FELL_THROUGH' || status === 'CANCELLED') {
    return { bg: 'rgba(185,28,28,0.12)', fg: DT.danger, icon: <AlertCircle size={12} /> };
  }
  return { bg: DT.goldSoft, fg: DT.goldDark, icon: null };
}
function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('he-IL'); } catch { return '—'; }
}

export default function DealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [activity, setActivity] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDeal(id);
      const d = res?.deal || res;
      if (!d) throw new Error('העסקה לא נמצאה');
      setDeal(d);
      // Best-effort — the timeline is nice-to-have, not required.
      api.listActivity({ entityType: 'Deal', entityId: id, limit: 50 })
        .then((r) => setActivity(r?.items || []))
        .catch(() => { /* keep empty timeline */ });
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (error || !deal) {
    return (
      <div dir="rtl" style={{
        ...FONT, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        color: DT.ink,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.danger,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error || 'העסקה לא נמצאה'}
        </div>
        <Link to="/deals" style={ghostBtn()}>
          <ArrowRight size={14} /> חזרה לעסקאות
        </Link>
      </div>
    );
  }

  const accent = statusAccent(deal.status);

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <Link to="/deals" style={{
          ...FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        }}>
          <ArrowRight size={16} />
          חזרה לעסקאות
        </Link>
        <button
          type="button"
          onClick={() => setEditing({ deal, mode: 'edit' })}
          style={primaryBtn()}
        >
          <Edit3 size={14} /> עריכה
        </button>
      </div>

      {/* Header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
              {deal.propertyStreet}, {deal.city}
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              marginTop: 10,
            }}>
              <Chip color={accent.fg} bg={accent.bg}>
                {accent.icon} {STATUS_LABELS[deal.status] || deal.status}
              </Chip>
              <Chip color={deal.assetClass === 'COMMERCIAL' ? DT.warning : DT.success}>
                {assetLabel(deal.assetClass)}
              </Chip>
              <Chip color={deal.category === 'SALE' ? DT.goldDark : DT.info}>
                {categoryLabel(deal.category)}
              </Chip>
              {deal.propertyId && (
                <Link to={`/properties/${deal.propertyId}`} style={ghostBtn()}>
                  <Building2 size={12} /> עבור לנכס
                </Link>
              )}
            </div>
          </div>
          {deal.updateDate && (
            <span
              title={absoluteTime(deal.updateDate)}
              style={{ fontSize: 12, color: DT.muted, whiteSpace: 'nowrap' }}
            >
              עודכן {relativeDate(deal.updateDate).label}
            </span>
          )}
        </div>

        {/* Price strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8, marginTop: 16, padding: '12px 14px',
          background: DT.cream4, borderRadius: 12, border: `1px solid ${DT.border}`,
        }}>
          <PriceCell label="מחיר שיווק" value={formatPrice(deal.marketingPrice)} />
          <PriceCell label="הצעה"       value={formatPrice(deal.offer)} />
          <PriceCell label="סגירה"      value={formatPrice(deal.closedPrice)} bold />
          {deal.commission != null && (
            <PriceCell label="עמלה" value={formatPrice(deal.commission)} color={DT.success} bold />
          )}
        </div>
      </div>

      {/* Two-column grid: parties + timeline */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>
        <PartiesCard deal={deal} />
        <TimelineCard deal={deal} items={activity} />
      </div>

      {/* Sprint 7 — AI offer-review. Sits below the two-column block so
          it has room for the recommended-counter card + reasoning. */}
      <div style={{ marginTop: 16 }}>
        <OfferReviewPanel deal={deal} />
      </div>

      {editing && (
        <DealEditModal
          deal={editing.deal}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function PartiesCard({ deal }) {
  return (
    <section style={sectionCard()} aria-label="צדדים ומעורבים">
      <h3 style={sectionTitle()}>
        <UserCircle size={16} /> צדדים
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PartyBlock
          role="קונה"
          fallback="ללא קונה רשום"
          person={deal.buyer}
          linkTo={deal.buyer ? `/customers/${deal.buyer.id}` : null}
          freeText={!deal.buyer && deal.buyerAgent ? deal.buyerAgent : null}
          freeTextLabel="סוכן צד קונים"
        />
        <PartyBlock
          role="מוכר"
          fallback="ללא מוכר רשום"
          person={deal.seller}
          linkTo={deal.seller ? `/owners/${deal.seller.id}` : null}
          freeText={!deal.seller && deal.sellerAgent ? deal.sellerAgent : null}
          freeTextLabel="סוכן צד מוכרים"
        />
        <div style={{ height: 1, background: DT.border }} />
        <InfoRow icon={<Scale size={14} />} label="עו״ד" value={deal.lawyer || '—'} />
        <InfoRow icon={<Calendar size={14} />} label="תאריך חתימה" value={formatDate(deal.signedAt)} />
        <InfoRow icon={<Calendar size={14} />} label="תאריך סגירה יעד" value={formatDate(deal.closeDate)} />
      </div>
    </section>
  );
}

function PartyBlock({ role, person, linkTo, fallback, freeText, freeTextLabel }) {
  if (!person && !freeText) {
    return (
      <div>
        <div style={labelStyle()}>{role}</div>
        <div style={{ fontSize: 13, color: DT.muted, marginTop: 3 }}>{fallback}</div>
      </div>
    );
  }
  if (!person && freeText) {
    return (
      <div>
        <div style={labelStyle()}>{role} · {freeTextLabel}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{freeText}</div>
      </div>
    );
  }
  return (
    <div>
      <div style={labelStyle()}>{role}</div>
      <Link
        to={linkTo}
        style={{
          display: 'flex', flexDirection: 'column', gap: 3,
          padding: '10px 12px', marginTop: 4,
          borderRadius: 10, border: `1px solid ${DT.border}`,
          background: DT.cream4, textDecoration: 'none', color: DT.ink,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14 }}>{person.name}</span>
        {/* DD-1 — phone+email row: flex-wrap so they stack on narrow phones. */}
        <span className="party-contact-row" style={{ fontSize: 12, color: DT.muted, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {person.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {formatPhone(person.phone)}</span>}
          {person.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageCircle size={10} /> {person.email}</span>}
        </span>
      </Link>
    </div>
  );
}

function TimelineCard({ deal, items }) {
  // If we don't have recorded activity yet, fall back to the deal's
  // core timestamps (created + updated + signed + target close). Still
  // useful context for brand-new deals.
  const fallback = [];
  if (deal.createdAt) fallback.push({ id: 'c', createdAt: deal.createdAt, summary: 'עסקה נוצרה', verb: 'created' });
  if (deal.signedAt)  fallback.push({ id: 's', createdAt: deal.signedAt,  summary: 'העסקה נחתמה', verb: 'signed' });
  const rows = items.length ? items : fallback;

  return (
    <section style={sectionCard()} aria-label="ציר זמן">
      <h3 style={sectionTitle()}>
        <Clock size={16} /> ציר זמן
      </h3>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: DT.muted }}>
          אין רישומי פעילות עדיין.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((it) => {
            const meta = it.metadata || {};
            const statusKey = meta.status;
            const dot = statusKey ? statusAccent(statusKey) : { bg: DT.goldSoft, fg: DT.goldDark };
            return (
              <li key={it.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 12px', borderRadius: 10,
                background: DT.cream4, border: `1px solid ${DT.border}`,
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 99,
                  background: dot.bg, color: dot.fg,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                  fontSize: 11, fontWeight: 800,
                }}>
                  {statusKey ? (statusAccent(statusKey).icon || '·') : '·'}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {it.summary || it.verb || 'פעילות'}
                  </div>
                  {statusKey && (
                    <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
                      סטטוס: {STATUS_LABELS[statusKey] || statusKey}
                    </div>
                  )}
                  <div
                    title={absoluteTime(it.createdAt)}
                    style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}
                  >
                    {relativeDate(it.createdAt).label}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PriceCell({ label, value, color, bold }) {
  return (
    <div>
      <div style={labelStyle()}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: bold ? 800 : 700, color: color || DT.ink, marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: DT.muted, fontWeight: 700,
      }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: DT.ink }}>{value}</span>
    </div>
  );
}

function Chip({ color, bg, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg || DT.goldSoft, color,
      borderRadius: 99, fontWeight: 700, fontSize: 11,
      padding: '3px 9px',
    }}>{children}</span>
  );
}

function labelStyle() {
  return {
    fontSize: 10, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.4,
  };
}
function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2,
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
function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
    fontSize: 11, fontWeight: 700,
    display: 'inline-flex', gap: 4, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
