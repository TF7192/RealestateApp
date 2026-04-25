// Notifications — Sprint 4 full-page list.
//
// DT-palette inline styles (not a .css file) so it matches the
// claude.ai/design bundle look the rest of the new pages share.
// Unread rows render on cream4 with a gold left border; read rows
// are plain white with muted text. The "סמן הכל כנקרא" button
// top-right fires the bulk mark-all endpoint and reloads.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellRing, Check, CheckCheck, AlertCircle, Users, Building2, Calendar, Activity,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';

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

// Maps the free-form `type` string from the backend to an icon + a
// human-readable Hebrew label for the secondary line. Unknown types
// fall back to the generic bell.
const TYPE_META = {
  reminder_due:       { Icon: BellRing,    label: 'תזכורת' },
  reminder_completed: { Icon: Check,       label: 'תזכורת הושלמה' },
  lead_assigned:      { Icon: Users,       label: 'ליד חדש' },
  lead_updated:       { Icon: Users,       label: 'עדכון ליד' },
  property_transfer:  { Icon: Building2,   label: 'העברת נכס' },
  property_updated:   { Icon: Building2,   label: 'עדכון נכס' },
  meeting_upcoming:   { Icon: Calendar,    label: 'פגישה מתקרבת' },
  activity:           { Icon: Activity,    label: 'פעילות' },
  alert:              { Icon: AlertCircle, label: 'התראה' },
};
function typeMeta(type) {
  return TYPE_META[type] || { Icon: Bell, label: displayText(type) };
}

function formatWhen(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('he-IL', {
      dateStyle: 'short', timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listNotifications({ limit: 100 });
      setItems(res?.items || []);
      setUnreadCount(res?.unreadCount || 0);
    } catch {
      toastRef.current?.error?.('שגיאה בטעינת ההתראות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRowClick = async (n) => {
    // Optimistically mark the clicked row as read, then navigate if a
    // deep link is present. If the server rejects, the next load()
    // restores the source of truth.
    if (!n.readAt) {
      setItems((prev) => prev.map((r) => r.id === n.id ? { ...r, readAt: new Date().toISOString() } : r));
      setUnreadCount((c) => Math.max(0, c - 1));
      try { await api.markNotificationRead(n.id); }
      catch { /* silent — reload on next visit */ }
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    if (unreadCount === 0) return;
    setMarking(true);
    try {
      await api.markAllNotificationsRead();
      // Optimistic local flip so the UI doesn't flash the old state.
      const now = new Date().toISOString();
      setItems((prev) => prev.map((r) => r.readAt ? r : { ...r, readAt: now }));
      setUnreadCount(0);
      toast.success('כל ההתראות סומנו כנקראו');
    } catch {
      toast.error('שמירת הפעולה נכשלה');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div dir="rtl" style={{
      ...FONT, minHeight: '100%', background: DT.cream, padding: '28px 28px 48px',
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, marginBottom: 20, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              ...FONT, margin: 0, fontSize: 24, fontWeight: 800, color: DT.ink,
              display: 'inline-flex', alignItems: 'center', gap: 10,
            }}>
              <Bell size={22} color={DT.gold} />
              התראות
              {unreadCount > 0 && (
                <span style={{
                  background: DT.gold, color: DT.white, fontSize: 12, fontWeight: 800,
                  borderRadius: 999, padding: '2px 10px',
                }}>
                  {unreadCount}
                </span>
              )}
            </h1>
            <p style={{
              ...FONT, margin: '6px 0 0', color: DT.muted, fontSize: 13,
            }}>
              עדכונים, תזכורות ופעילויות אחרונות
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || marking}
            style={{
              ...FONT,
              background: unreadCount > 0 ? DT.white : DT.cream2,
              border: `1px solid ${DT.border}`,
              padding: '12px 18px', borderRadius: 10, cursor: unreadCount > 0 ? 'pointer' : 'default',
              color: unreadCount > 0 ? DT.ink : DT.muted,
              display: 'inline-flex', gap: 8, alignItems: 'center',
              fontSize: 13, fontWeight: 700,
              opacity: marking ? 0.6 : 1,
              minHeight: 44,
            }}
          >
            <CheckCheck size={15} />
            סמן הכל כנקרא
          </button>
        </div>

        {/* List */}
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
          overflow: 'hidden',
        }}>
          {loading && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: DT.muted, fontSize: 13 }}>
              טוען התראות…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: 24 }}>
              <EmptyState
                icon={<Bell size={44} />}
                title="אין התראות"
                description="כשיקרה משהו חדש — תזכורת, ליד, עסקה — תראו אותו כאן"
                variant="first"
              />
            </div>
          )}
          {!loading && items.map((n, idx) => {
            const { Icon, label } = typeMeta(n.type);
            const isUnread = !n.readAt;
            const isClickable = !!n.link || isUnread;
            return (
              <div
                key={n.id}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => handleRowClick(n) : undefined}
                onKeyDown={isClickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(n);
                  }
                } : undefined}
                style={{
                  display: 'flex', gap: 14, padding: '14px 18px',
                  // F-10 — unread rows get the cream4 background + gold
                  // left border so they jump off the page. Read rows
                  // fall back to a plain white card so the history is
                  // readable but muted.
                  background: isUnread ? DT.cream4 : DT.white,
                  borderInlineStart: isUnread ? `3px solid ${DT.gold}` : `3px solid transparent`,
                  borderBottom: idx < items.length - 1 ? `1px solid ${DT.border}` : 'none',
                  cursor: isClickable ? 'pointer' : 'default',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isUnread ? DT.goldSoft : DT.cream2,
                  color: isUnread ? DT.gold : DT.muted,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    ...FONT, fontSize: 14, fontWeight: isUnread ? 700 : 500,
                    color: isUnread ? DT.ink : DT.muted,
                    marginBottom: 2,
                  }}>
                    {displayText(n.title)}
                  </div>
                  {n.body && (
                    <div style={{
                      ...FONT, fontSize: 13, color: isUnread ? DT.ink : DT.muted,
                      lineHeight: 1.5, marginBottom: 4,
                    }}>
                      {n.body}
                    </div>
                  )}
                  <div style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    fontSize: 11, color: DT.muted,
                  }}>
                    <span style={{
                      background: DT.cream2, padding: '2px 8px', borderRadius: 6,
                      color: DT.muted, fontWeight: 600,
                    }}>{label}</span>
                    <span>{formatWhen(n.createdAt)}</span>
                  </div>
                </div>
                {isUnread && (
                  <span
                    aria-label="חדש"
                    title="לא נקרא"
                    style={{
                      width: 10, height: 10, borderRadius: 99,
                      background: DT.gold, flexShrink: 0, marginTop: 10,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
