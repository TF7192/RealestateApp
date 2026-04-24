// Transfers (DTransfers / ScreenTransfers) — sprint-8.x port of the
// claude.ai/design "Estia Refined Pages" bundle. Cream + Gold DT
// palette, inline styles, RTL, Hebrew-first.
//
// Shows incoming + outgoing property-transfer handshakes between
// agents. Backed entirely by existing endpoints:
//   GET  /api/transfers                    → list
//   POST /api/transfers/:id/accept         → recipient confirms
//   POST /api/transfers/:id/decline        → recipient rejects
//   POST /api/transfers/:id/cancel         → sender withdraws
// No fixtures; rows only come from the server.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight, Check, X as XIcon, MessageCircle,
  Inbox, ArrowUpFromLine, Building2, Clock, CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { relativeTime, absoluteTime } from '../lib/time';
import { useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';

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

function statusAccent(s) {
  switch (s) {
    case 'PENDING':
      return { bg: 'rgba(180,83,9,0.12)',  fg: DT.warning, Icon: Clock,         label: 'בהמתנה' };
    case 'ACCEPTED':
      return { bg: 'rgba(21,128,61,0.12)', fg: DT.success, Icon: CheckCircle2, label: 'אושר' };
    case 'DECLINED':
      return { bg: 'rgba(185,28,28,0.12)', fg: DT.danger,  Icon: XIcon,        label: 'נדחה' };
    case 'CANCELLED':
      return { bg: 'rgba(30,26,20,0.06)',  fg: DT.muted,   Icon: XIcon,        label: 'בוטל' };
    case 'WHATSAPP_SENT':
      return { bg: 'rgba(37,99,235,0.12)', fg: DT.info,    Icon: MessageCircle, label: 'נשלח בוואטסאפ' };
    default:
      return { bg: DT.goldSoft, fg: DT.goldDark, Icon: Clock, label: s || '—' };
  }
}

export default function Transfers() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const showSkel = useDelayedFlag(loading, 220);
  const [tab, setTab] = useState('incoming');

  const load = async () => {
    try {
      const r = await api.listTransfers();
      setItems(r.items || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const incoming = useMemo(
    () => items.filter((t) => t.direction === 'incoming'),
    [items],
  );
  const outgoing = useMemo(
    () => items.filter((t) => t.direction === 'outgoing'),
    [items],
  );
  const pendingIncoming = incoming.filter((t) => t.status === 'PENDING').length;
  const pendingOutgoing = outgoing.filter((t) => t.status === 'PENDING').length;
  const acceptedCount   = items.filter((t) => t.status === 'ACCEPTED').length;

  const handleAccept = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מאשר קבלת נכס…',
        success: 'הנכס הועבר אליך בהצלחה',
        onSave: () => api.acceptTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };
  const handleDecline = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'דוחה…',
        success: 'הבקשה נדחתה',
        onSave: () => api.declineTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };
  const handleCancel = async (t) => {
    try {
      await optimisticUpdate(toast, {
        label: 'מבטל…',
        success: 'הבקשה בוטלה',
        onSave: () => api.cancelTransfer(t.id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  const list = tab === 'incoming' ? incoming : outgoing;

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      <PageTour
        pageKey="transfers"
        steps={[
          { target: 'body', placement: 'center',
            title: 'העברות נכסים',
            content: 'העברות נכנסות ויוצאות בין סוכנים. פותחים העברה מעמוד הנכס (כפתור "העבר"), הסוכן המקבל מאשר, והנכס עובר יחד עם בעל הנכס.' },
        ]}
      />

      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            העברות
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            {loading
              ? 'טוען העברות…'
              : `${items.length} העברות · ${pendingIncoming + pendingOutgoing} בהמתנה · ${acceptedCount} אושרו`}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', gap: 12, padding: '8px 14px',
          borderRadius: 12, background: DT.cream3,
          border: `1px solid ${DT.border}`,
        }}>
          <KpiChip label="נכנסות" value={incoming.length} />
          <Divider />
          <KpiChip label="יוצאות" value={outgoing.length} />
          <Divider />
          <KpiChip label="בהמתנה" value={pendingIncoming + pendingOutgoing}
                   valueColor={pendingIncoming + pendingOutgoing > 0 ? DT.warning : DT.ink} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <TabPill
          active={tab === 'incoming'}
          onClick={() => setTab('incoming')}
          icon={<Inbox size={14} />}
          label="נכנסות"
          count={incoming.length}
          badge={pendingIncoming}
        />
        <TabPill
          active={tab === 'outgoing'}
          onClick={() => setTab('outgoing')}
          icon={<ArrowUpFromLine size={14} />}
          label="יוצאות"
          count={outgoing.length}
          badge={pendingOutgoing}
        />
      </div>

      {/* List */}
      {loading && showSkel ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              borderRadius: 14, minHeight: 120,
              opacity: 0.6,
            }} />
          ))}
        </div>
      ) : loading ? null : list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((t) => (
            <TransferCard
              key={t.id}
              t={t}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiChip({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{
        fontSize: 10, color: DT.muted, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: valueColor || DT.ink }}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span style={{ width: 1, background: DT.border }} />;
}

function TabPill({ active, onClick, icon, label, count, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...FONT,
        background: active ? DT.ink : DT.white,
        color: active ? DT.cream : DT.ink,
        border: `1px solid ${active ? DT.ink : DT.border}`,
        padding: '8px 14px', borderRadius: 99,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      {icon}
      {label}
      {count != null && (
        <span style={{ opacity: 0.7, fontWeight: 600 }}>· {count}</span>
      )}
      {badge > 0 && (
        <span style={{
          background: active ? DT.goldLight : DT.gold,
          color: active ? DT.ink : DT.white,
          borderRadius: 99, fontSize: 10, fontWeight: 800,
          padding: '2px 7px', minWidth: 18, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  );
}

function TransferCard({ t, onAccept, onDecline, onCancel }) {
  const accent = statusAccent(t.status);
  const other = t.direction === 'incoming' ? t.fromAgent : t.toAgent;
  const isPending = t.status === 'PENDING';

  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, padding: 16,
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(220px, 1.3fr) auto',
      gap: 16, alignItems: 'center',
      boxShadow: '0 1px 3px rgba(30,26,20,0.04)',
    }}>
      {/* Property block */}
      <Link
        to={`/properties/${t.property.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          textDecoration: 'none', color: DT.ink, minWidth: 0,
        }}
      >
        {t.property.images?.[0] ? (
          <img
            src={t.property.images[0].url}
            alt=""
            style={{
              width: 56, height: 56, borderRadius: 10,
              objectFit: 'cover', flexShrink: 0,
              border: `1px solid ${DT.border}`,
            }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            background: DT.cream2, display: 'grid', placeItems: 'center',
            color: DT.muted, flexShrink: 0,
            border: `1px solid ${DT.border}`,
          }}>
            <Building2 size={22} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: 14,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {t.property.street}, {t.property.city}
          </div>
          {t.property.type && (
            <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>
              {t.property.type}
            </div>
          )}
        </div>
      </Link>

      {/* Middle: status + counter-agent + optional message */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: accent.bg, color: accent.fg,
          borderRadius: 99, padding: '3px 10px',
          fontSize: 11, fontWeight: 800, width: 'fit-content',
        }}>
          <accent.Icon size={12} />
          {accent.label}
        </span>

        {other ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {other.avatarUrl ? (
              <img
                src={other.avatarUrl}
                alt=""
                style={{
                  width: 32, height: 32, borderRadius: 99,
                  objectFit: 'cover',
                  border: `1px solid ${DT.border}`,
                }}
              />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: 99,
                background: DT.goldSoft, color: DT.goldDark,
                display: 'grid', placeItems: 'center',
                fontWeight: 800, fontSize: 13,
                border: `1px solid ${DT.border}`,
              }}>
                {(other.displayName || other.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                <span style={{ color: DT.muted, fontWeight: 600, marginInlineEnd: 4 }}>
                  {t.direction === 'incoming' ? 'מאת' : 'אל'}
                </span>
                {other.displayName || other.email}
              </div>
              <div style={{ fontSize: 11, color: DT.muted, marginTop: 1 }}>
                {other.agentProfile?.agency || other.email}
              </div>
            </div>
          </div>
        ) : t.status === 'WHATSAPP_SENT' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 99,
              background: 'rgba(37,99,235,0.12)', color: DT.info,
              display: 'grid', placeItems: 'center',
              border: `1px solid ${DT.border}`,
            }}>
              <MessageCircle size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>נשלח בוואטסאפ</div>
              <div style={{ fontSize: 11, color: DT.muted, marginTop: 1 }}>
                ללא סוכן רשום
              </div>
            </div>
          </div>
        ) : null}

        {t.message && (
          <p style={{
            margin: 0, padding: '6px 10px',
            background: DT.cream4, border: `1px solid ${DT.border}`,
            borderRadius: 8, fontSize: 12, color: DT.ink2,
            fontStyle: 'italic', lineHeight: 1.4,
          }}>
            “{t.message}”
          </p>
        )}

        <span
          title={absoluteTime(t.createdAt)}
          style={{ fontSize: 11, color: DT.muted }}
        >
          {relativeTime(t.createdAt)}
        </span>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        alignItems: 'stretch', justifySelf: 'end',
      }}>
        {t.direction === 'incoming' && isPending && (
          <>
            <button type="button" onClick={() => onAccept(t)} style={primaryBtn()}>
              <Check size={14} /> אשר קבלה
            </button>
            <button type="button" onClick={() => onDecline(t)} style={ghostBtn()}>
              <XIcon size={14} /> דחה
            </button>
          </>
        )}
        {t.direction === 'outgoing' && isPending && (
          <button type="button" onClick={() => onCancel(t)} style={ghostBtn()}>
            <XIcon size={14} /> בטל בקשה
          </button>
        )}
        {!isPending && (
          <span style={{ fontSize: 11, color: DT.muted, textAlign: 'center' }}>
            —
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab }) {
  return (
    <div style={{
      background: DT.white, border: `1px dashed ${DT.borderStrong}`,
      borderRadius: 14, padding: '56px 24px',
      textAlign: 'center', color: DT.muted,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 99,
        background: DT.goldSoft, color: DT.goldDark,
        display: 'grid', placeItems: 'center',
      }}>
        {tab === 'incoming' ? <Inbox size={24} /> : <ArrowLeftRight size={24} />}
      </div>
      <h3 style={{ margin: 0, color: DT.ink, fontSize: 16, fontWeight: 800 }}>
        {tab === 'incoming' ? 'אין העברות נכנסות' : 'לא ביצעת העברות יוצאות'}
      </h3>
      <p style={{ margin: 0, fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>
        {tab === 'incoming'
          ? 'כאשר סוכן אחר יעביר אליך נכס במערכת — הוא יופיע כאן.'
          : 'העבר נכס לסוכן אחר מעמוד הנכס, בכפתור "העבר נכס".'}
      </p>
      {tab === 'outgoing' && (
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: DT.goldDark,
        }}>
          <AlertCircle size={12} />
          <span>ההעברה מעבירה את הנכס יחד עם בעל הנכס</span>
        </div>
      )}
    </div>
  );
}

function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '7px 12px',
    borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    whiteSpace: 'nowrap',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center',
    color: DT.ink, whiteSpace: 'nowrap',
  };
}
