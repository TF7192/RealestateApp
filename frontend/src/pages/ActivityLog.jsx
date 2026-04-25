// H3 — global activity timeline (refined).
//
// Sprint 8 refine pass (2026-04-24). Lists every activity entry across
// the authenticated agent's entities. Filter chips narrow by entityType;
// the "limit" dropdown lets the agent expand the window in 50-row steps.
// Endpoint is owner-scoped on the backend.
//
// Layout follows the "Estia Refined Pages" bundle: a two-column grid
// (timeline card + quick-filters sidebar) with day-grouped events,
// verb-tinted icon chips, and the Cream & Gold palette. Inline DT —
// the old ActivityLog.css has been retired.
//
// API contract is unchanged: api.listActivity({ entityType?, limit? }).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, RefreshCw, Calendar, Sparkles, Upload,
  CheckCircle2, Users, FileText, Tag as TagIcon,
  User, Building2, Handshake, Bell, Edit3, Trash2, Plus,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';

// DT palette — verbatim per design-bundle contract.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c', warm: '#b45309',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Filter chips — PascalCase values match what routes/*.ts write via
// logActivity(). The sidebar shows all types agents actually use; the
// backend clamps limit to 200, so we top out there too.
const ENTITY_FILTERS = [
  { key: '',         label: 'הכל' },
  { key: 'Lead',     label: 'לקוחות' },
  { key: 'Property', label: 'נכסים' },
  { key: 'Owner',    label: 'בעלי נכסים' },
  { key: 'Deal',     label: 'עסקאות' },
  { key: 'Reminder', label: 'תזכורות' },
  { key: 'Tag',      label: 'תגיות' },
  { key: 'Office',   label: 'משרד' },
  { key: 'Advert',   label: 'מודעות' },
];

const LIMITS = [50, 100, 200];

// Hebrew verb labels — the backend writes English verbs ("created",
// "updated"…) and Hebrew summaries. If a summary exists it's shown as
// the main line; the verb supplements when it doesn't.
const VERB_LABEL = {
  created:  'יצר/ה',
  updated:  'עדכן/ה',
  deleted:  'מחק/ה',
  imported: 'ייבא/ה',
  assigned: 'שייך/ה',
  shared:   'שיתף/ה',
  closed:   'סגר/ה',
  opened:   'פתח/ה',
  archived: 'העביר/ה לארכיון',
  restored: 'שחזר/ה',
  tagged:   'תייג/ה',
  untagged: 'הסיר/ה תגית',
  noted:    'הוסיף/ה הערה',
};

// Icon + tone per entity + verb. Falls back to a generic activity
// glyph. Tones map to the DT palette backgrounds below.
function iconForEvent(ev) {
  const v = String(ev.verb || ev.action || '').toLowerCase();
  const t = String(ev.entityType || '').toLowerCase();

  if (v === 'deleted')              return { Icon: Trash2,        tone: 'hot' };
  if (v === 'created')              return { Icon: Plus,          tone: 'ok' };
  if (v === 'imported')             return { Icon: Upload,        tone: 'gold' };
  if (v === 'closed')               return { Icon: CheckCircle2,  tone: 'ok' };
  if (v === 'tagged' || v === 'untagged') return { Icon: TagIcon, tone: 'default' };

  if (t === 'lead')                 return { Icon: Users,         tone: 'default' };
  if (t === 'property' || t === 'advert') return { Icon: Building2, tone: 'default' };
  if (t === 'owner')                return { Icon: User,          tone: 'default' };
  if (t === 'deal')                 return { Icon: Handshake,     tone: 'ok' };
  if (t === 'reminder')             return { Icon: Bell,          tone: 'warn' };
  if (t === 'leadmeeting')          return { Icon: Calendar,      tone: 'gold' };
  if (t === 'uploadedfile')         return { Icon: FileText,      tone: 'default' };
  if (t === 'office')               return { Icon: Building2,     tone: 'default' };
  if (t === 'leadsearchprofile')    return { Icon: Sparkles,      tone: 'gold' };
  if (t === 'tag')                  return { Icon: TagIcon,       tone: 'default' };

  return { Icon: Edit3, tone: 'default' };
}

function iconBg(tone) {
  return ({
    gold:    DT.goldSoft,
    default: DT.cream3,
    ok:      'rgba(22,101,52,0.14)',
    warn:    'rgba(180,83,9,0.14)',
    hot:     'rgba(185,28,28,0.12)',
  }[tone] || DT.cream3);
}
function iconFg(tone) {
  return ({
    gold:    DT.goldDark,
    default: DT.ink2,
    ok:      DT.success,
    warn:    DT.warm,
    hot:     DT.danger,
  }[tone] || DT.ink2);
}

// Day bucketing — same scheme LeadHistory uses, so both pages group
// events identically.
function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dayBucketLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - d) / (24 * 3600 * 1000));
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long' });
  if (diffDays === 0) return `היום · ${weekday}`;
  if (diffDays === 1) return `אתמול · ${weekday}`;
  if (diffDays < 7)   return `לפני ${diffDays} ימים · ${weekday}`;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function timeLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

const ENTITY_LABEL = {
  Lead:              'לקוח',
  Property:          'נכס',
  Advert:            'נכס',
  Deal:              'עסקה',
  Owner:             'בעל נכס',
  Reminder:          'תזכורת',
  LeadMeeting:       'פגישה',
  UploadedFile:      'מסמך',
  LeadSearchProfile: 'פרופיל חיפוש',
  Office:            'משרד',
  Tag:               'תגית',
  // Legacy uppercase that might sneak in from older rows:
  LEAD:              'לקוח',
  PROPERTY:          'נכס',
  DEAL:              'עסקה',
  OWNER:             'בעל נכס',
  REMINDER:          'תזכורת',
  TAG:               'תגית',
};

export default function ActivityLog() {
  const toast = useToast();
  const [entityType, setEntityType] = useState('');
  const [limit, setLimit] = useState(50);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const p = { limit };
    if (entityType) p.entityType = entityType;
    return p;
  }, [entityType, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listActivity(params);
      setItems(res?.items || []);
    } catch {
      toast.error('שגיאה בטעינת יומן הפעילות');
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => { load(); }, [load]);

  // Group events by day, preserving newest-first order.
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

  // Counts per entity type — drives the sidebar chips' numbers.
  const counts = useMemo(() => {
    const out = { '': items.length };
    for (const ev of items) {
      const k = ev?.entityType || '';
      out[k] = (out[k] || 0) + 1;
      // Legacy uppercase rows still contribute to their PascalCase chip.
      const lc = String(k).toLowerCase();
      if (lc === 'lead')     out.Lead     = (out.Lead     || 0) + (k === 'Lead'     ? 0 : 1);
      if (lc === 'property') out.Property = (out.Property || 0) + (k === 'Property' ? 0 : 1);
      if (lc === 'deal')     out.Deal     = (out.Deal     || 0) + (k === 'Deal'     ? 0 : 1);
      if (lc === 'owner')    out.Owner    = (out.Owner    || 0) + (k === 'Owner'    ? 0 : 1);
      if (lc === 'reminder') out.Reminder = (out.Reminder || 0) + (k === 'Reminder' ? 0 : 1);
      if (lc === 'tag')      out.Tag      = (out.Tag      || 0) + (k === 'Tag'      ? 0 : 1);
    }
    return out;
  }, [items]);

  const activeLabel = ENTITY_FILTERS.find((f) => f.key === entityType)?.label || 'הכל';

  return (
    <div
      dir="rtl"
      style={{
        ...FONT,
        padding: 28,
        color: DT.ink,
        minHeight: '100%',
        background: DT.cream,
      }}
    >
      {/* Page header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: DT.goldSoft, color: DT.goldDark,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <Activity size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{
            fontSize: 24, fontWeight: 800, letterSpacing: -0.4,
            margin: 0, color: DT.ink,
          }}>
            יומן פעילות
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
            כל האירועים · {items.length.toLocaleString('he-IL')} רשומות · {activeLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="רענן"
          aria-busy={loading}
          style={secondaryBtn()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>רענן</span>
        </button>
      </header>

      {/* Two-column grid — timeline card on the right (RTL-primary),
          quick filters on the left. Collapses to a single column
          below the large breakpoint. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 300px',
          gap: 20,
        }}
        className="activity-refined-grid"
      >
        {/* Timeline card */}
        <section
          aria-busy={loading ? 'true' : 'false'}
          style={{
            background: DT.white,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${DT.border}`,
              display: 'flex', alignItems: 'center', gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 700, color: DT.ink }}>
              {items.length.toLocaleString('he-IL')} אירועים
              <span style={{ color: DT.muted, fontWeight: 500 }}>
                {' '}· מציג {Math.min(items.length, limit).toLocaleString('he-IL')} מתוך החלון האחרון
              </span>
            </div>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: DT.muted, fontWeight: 600,
              }}
            >
              <span>חלון</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                aria-label="מספר שורות"
                style={{
                  ...FONT,
                  background: DT.white,
                  border: `1px solid ${DT.border}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12, fontWeight: 700, color: DT.ink,
                  cursor: 'pointer',
                }}
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          {loading && items.length === 0 ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 56, borderRadius: 10,
                    background: `linear-gradient(90deg, ${DT.cream4}, ${DT.cream2}, ${DT.cream4})`,
                    backgroundSize: '200% 100%',
                    animation: 'activityShimmer 1.4s ease-in-out infinite',
                  }}
                />
              ))}
              <style>{`@keyframes activityShimmer {
                0% { background-position: 100% 0; }
                100% { background-position: -100% 0; }
              }`}</style>
            </div>
          ) : items.length === 0 ? (
            <div
              style={{
                padding: 48, textAlign: 'center',
                color: DT.muted,
              }}
            >
              <div
                style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: DT.goldSoft, color: DT.goldDark,
                  display: 'grid', placeItems: 'center',
                  margin: '0 auto 14px',
                }}
                aria-hidden="true"
              >
                <Activity size={28} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: DT.ink, marginBottom: 4 }}>
                אין פעילות להצגה
              </div>
              <div style={{ fontSize: 13 }}>
                כאשר תבצע שינויים ברשומות הם יופיעו כאן.
              </div>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div
                  style={{
                    padding: '12px 20px',
                    background: DT.cream4,
                    fontSize: 11, fontWeight: 800,
                    color: DT.muted, letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    borderTop: `1px solid ${DT.border}`,
                  }}
                >
                  {g.label}
                </div>
                {g.events.map((ev, ei) => {
                  const { Icon, tone } = iconForEvent(ev);
                  const entityName = ENTITY_LABEL[ev.entityType] || ev.entityType || '';
                  const verbLabel = VERB_LABEL[String(ev.verb || ev.action || '').toLowerCase()]
                    || ev.verb || ev.action || '';
                  const main = ev.summary
                    || (entityName && verbLabel ? `${verbLabel} ${entityName}` : verbLabel || entityName || 'עדכון');
                  return (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex',
                        gap: 14,
                        padding: '14px 20px',
                        borderTop: ei === 0 ? 'none' : `1px solid ${DT.border}`,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: iconBg(tone), color: iconFg(tone),
                          display: 'grid', placeItems: 'center',
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        <Icon size={15} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: DT.ink }}>
                          {ev.actorName && (
                            <strong style={{ marginInlineEnd: 4 }}>{ev.actorName}</strong>
                          )}
                          <span style={{ color: DT.ink2 }}>
                            {main}
                          </span>
                        </div>
                        {entityName && (
                          <div
                            style={{
                              fontSize: 11, color: DT.muted,
                              marginTop: 3, display: 'flex', gap: 6,
                              flexWrap: 'wrap', alignItems: 'center',
                            }}
                          >
                            <span
                              style={{
                                background: DT.cream3,
                                color: DT.ink2,
                                padding: '2px 8px',
                                borderRadius: 99,
                                fontSize: 10, fontWeight: 700,
                                letterSpacing: 0.3,
                              }}
                            >
                              {entityName}
                            </span>
                            {verbLabel && ev.summary && (
                              <span>· {verbLabel}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <time
                        dateTime={ev.createdAt}
                        style={{
                          fontSize: 11, color: DT.muted,
                          fontVariantNumeric: 'tabular-nums',
                          flexShrink: 0,
                        }}
                      >
                        {timeLabel(ev.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </section>

        {/* Sidebar — quick filters + window presets. */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div
            style={{
              background: DT.white,
              border: `1px solid ${DT.border}`,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 800,
                color: DT.muted, letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              סינונים מהירים
            </div>
            <div role="group" aria-label="סוג ישות">
              {ENTITY_FILTERS.map((f) => {
                const active = entityType === f.key;
                const n = counts[f.key] || 0;
                return (
                  <button
                    key={f.key || 'all'}
                    type="button"
                    onClick={() => setEntityType(f.key)}
                    aria-pressed={active}
                    style={{
                      ...FONT,
                      width: '100%',
                      padding: '10px 12px',
                      marginBottom: 6,
                      border: `1px solid ${active ? DT.gold : DT.border}`,
                      borderRadius: 8,
                      background: active ? DT.goldSoft : DT.white,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      color: active ? DT.goldDark : DT.ink,
                      textAlign: 'right',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{f.label}</span>
                    <span style={{ color: active ? DT.goldDark : DT.muted, fontSize: 11, fontWeight: 700 }}>
                      {n.toLocaleString('he-IL')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              background: DT.white,
              border: `1px solid ${DT.border}`,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 800,
                color: DT.muted, letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              חלון זמן
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {LIMITS.map((n) => {
                const active = limit === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLimit(n)}
                    aria-pressed={active}
                    style={{
                      ...FONT,
                      padding: '8px 10px',
                      border: `1px solid ${active ? DT.gold : DT.border}`,
                      borderRadius: 8,
                      background: active ? DT.goldSoft : DT.white,
                      fontSize: 12,
                      fontWeight: active ? 800 : 600,
                      color: active ? DT.goldDark : DT.ink,
                      cursor: 'pointer',
                    }}
                  >
                    {n} שורות
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 10, fontSize: 11, color: DT.muted, lineHeight: 1.5,
              }}
            >
              חלון ההצגה מוגבל ל-200 אירועים אחרונים כדי לשמור על ביצועים.
            </div>
          </div>
        </aside>
      </div>

      {/* Responsive collapse — matches the sidebar layout of the other
          refined pages: single column under 960px. */}
      <style>{`
        @media (max-width: 960px) {
          .activity-refined-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function secondaryBtn() {
  return {
    ...FONT,
    background: DT.white,
    border: `1px solid ${DT.border}`,
    padding: '8px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    display: 'inline-flex',
    gap: 6,
    alignItems: 'center',
    color: DT.ink,
  };
}
