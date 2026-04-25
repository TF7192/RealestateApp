// Lead / customer detail — port of the claude.ai/design bundle with
// inline Cream & Gold styles. Split-panel layout:
//   LEFT:  matching properties, lead summary card, tags
//   RIGHT: reminders, activity log, derived timeline
//
// Sub-panels (MatchingList, TagPicker, RemindersPanel, ActivityPanel,
// CustomerEditDialog, LeadMeetingDialog) stay as-is — they already
// render in the cream & gold palette in light mode and their
// internals aren't worth rewriting for this sprint.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight, Phone, MessageCircle, MessageSquare, Calendar, FileText,
  AlertCircle, History, Flame, Thermometer, Snowflake, Building2,
  Sparkles, Printer, Maximize2, Edit3,
} from 'lucide-react';
import { popoutCurrentRoute } from '../lib/popout';
import { printPage } from '../lib/print';
import api from '../lib/api';
import LeadMeetingDialog from '../components/LeadMeetingDialog';
import TagPicker from '../components/TagPicker';
import RemindersPanel from '../components/RemindersPanel';
import MatchingList from '../components/MatchingList';
import AiMatchesDrawer from '../components/AiMatchesDrawer';
import CustomerEditDialog from '../components/CustomerEditDialog';
import ActivityPanel from '../components/ActivityPanel';
import MeetingSummarizerCard from '../components/MeetingSummarizerCard';
import { leadMatchesProperty } from './Properties';
import { primeContactBump } from '../hooks/mobile';
import { formatPhone } from '../lib/phone';
import { relativeDate } from '../lib/relativeDate';
import { relativeTime, absoluteTime } from '../lib/time';
import haptics from '../lib/haptics';
import { useToast } from '../lib/toast';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', hot: '#b91c1c', warm: '#b45309', cold: '#475569',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

function statusMeta(status) {
  const s = (status || '').toUpperCase();
  if (s === 'HOT')  return { label: 'חם',    bg: 'rgba(185,28,28,0.12)', fg: DT.hot,  icon: <Flame size={12} /> };
  if (s === 'WARM') return { label: 'פושר',  bg: 'rgba(180,83,9,0.12)',  fg: DT.warm, icon: <Thermometer size={12} /> };
  if (s === 'COLD') return { label: 'קר',    bg: 'rgba(71,85,105,0.12)', fg: DT.cold, icon: <Snowflake size={12} /> };
  return null;
}

export default function CustomerDetail() {
  // Inline Hebrew strings — i18n was dropped (PERF-004); the Hebrew JSON
  // copy now lives directly in the JSX since the app is Hebrew-only and
  // the English locale files were empty stubs.
  const { id } = useParams();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Sprint 5 — "✨ התאמות חכמות" drawer open-state
  const [aiMatchesOpen, setAiMatchesOpen] = useState(false);
  // Sprint 5 / AI — summariser card hangs off the most-recent meeting
  // for this lead. Reload with `loadLatestMeeting` after a summarize
  // roundtrip so the UI reflects the persisted row.
  const [latestMeeting, setLatestMeeting] = useState(null);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let fetched = null;
      if (typeof api.getLead === 'function') {
        try {
          const res = await api.getLead(id);
          fetched = res?.lead ?? res;
        } catch (e) {
          if (e?.status !== 404) {
            const list = await api.listLeads();
            fetched = (list?.items || []).find((l) => String(l.id) === String(id)) || null;
          }
        }
      }
      if (!fetched) {
        const list = await api.listLeads();
        fetched = (list?.items || []).find((l) => String(l.id) === String(id)) || null;
      }
      if (!fetched) throw new Error('הלקוח לא נמצא');
      setLead(fetched);
    } catch (e) {
      setError(e.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadLead(); }, [loadLead]);

  // Load the most-recent meeting for this lead so the summariser card
  // has something to render against. listLeadMeetings returns desc-
  // ordered rows; we take the first one (most recent by startsAt).
  const loadLatestMeeting = useCallback(async () => {
    if (!lead?.id) return;
    try {
      const res = await api.listLeadMeetings(lead.id);
      const items = res?.items || [];
      setLatestMeeting(items[0] || null);
    } catch {
      setLatestMeeting(null);
    }
  }, [lead?.id]);

  useEffect(() => { loadLatestMeeting(); }, [loadLatestMeeting]);

  // Count matching properties for the gold pill in the header.
  useEffect(() => {
    if (!lead) return undefined;
    let cancelled = false;
    api.listProperties({ mine: '1' })
      .then((res) => {
        if (cancelled) return;
        const props = res?.items || [];
        setMatchCount(props.filter((p) => leadMatchesProperty(lead, p)).length);
      })
      .catch(() => { /* pill stays at 0 */ });
    return () => { cancelled = true; };
  }, [lead]);

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (error || !lead) {
    return (
      <div dir="rtl" style={{
        ...FONT, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        color: DT.ink,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.hot,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error || 'הלקוח לא נמצא'}
        </div>
        <Link to="/customers" style={ghostBtn()}>
          <ArrowRight size={14} /> חזור ללקוחות
        </Link>
      </div>
    );
  }

  const status = statusMeta(lead.status);
  const phoneDigits = (lead.phone || '').replace(/\D/g, '');
  const createdRel = lead.createdAt ? relativeDate(lead.createdAt) : null;

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Top toolbar — back link + contact actions + meeting + edit */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <Link to="/customers" style={{
          ...FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        }}>
          <ArrowRight size={16} />
          לקוחות
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link to="/templates" style={secondaryBtn()} title="ערוך תבניות הודעה">
            <FileText size={14} /> ערוך תבניות הודעה
          </Link>
          {lead.phone && (
            <>
              <a
                href={`tel:${lead.phone}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                style={secondaryBtn()}
                title={lead.phone}
              >
                <Phone size={14} /> התקשר
              </a>
              <a
                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`שלום ${lead.name}`)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                style={secondaryBtn()}
                title="וואטסאפ"
              >
                <MessageCircle size={14} /> וואטסאפ
              </a>
              <a
                href={`sms:${lead.phone}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                style={secondaryBtn()}
                title="הודעת SMS"
              >
                <MessageSquare size={14} /> SMS
              </a>
            </>
          )}
          <button
            type="button"
            onClick={() => { haptics.tap(); setMeetingOpen(true); }}
            style={primaryBtn()}
            title="קבע פגישה"
          >
            <Calendar size={14} /> קבע פגישה
          </button>
          {/* Sprint 5 — AI-backed smart matcher. Distinct gold-gradient
              pill so it visually reads as "premium / magic" and doesn't
              collide with the classic schedule/edit CTAs. */}
          <button
            type="button"
            onClick={() => { haptics.tap(); setAiMatchesOpen(true); }}
            style={{
              ...FONT,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10,
              border: 'none',
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink,
              fontSize: 12, fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 3px 8px rgba(180,139,76,0.25)',
            }}
            title="התאמות חכמות מ-AI"
          >
            <Sparkles size={14} />
            <span>✨ התאמות חכמות</span>
          </button>
          <button type="button" onClick={() => { haptics.tap(); setEditOpen(true); }} style={secondaryBtn()} title="ערוך פרטי לקוח">
            <Edit3 size={14} /> ערוך
          </button>
          <button type="button" onClick={() => printPage()} style={ghostBtn()} title="הדפס">
            <Printer size={14} />
          </button>
          <button type="button" onClick={() => popoutCurrentRoute()} style={ghostBtn()} title="פתח בחלון חדש">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Header card — avatar, name, status chip, match pill */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 99,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          fontWeight: 800, fontSize: 26, flexShrink: 0,
        }}>
          {(lead.name || '?').charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
              {lead.name}
            </h1>
            {status && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: status.bg, color: status.fg,
                padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 11,
              }}>
                {status.icon} {status.label}
              </span>
            )}
            {matchCount > 0 && (
              <Link
                to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                title="נכסים תואמים בקריטריונים שלך"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: DT.goldSoft, color: DT.goldDark,
                  padding: '3px 10px', borderRadius: 99,
                  fontWeight: 700, fontSize: 11, textDecoration: 'none',
                }}
              >
                <Sparkles size={12} />
                <strong>{matchCount}</strong>
                נכסים תואמים
              </Link>
            )}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: DT.muted, marginTop: 6, flexWrap: 'wrap',
          }}>
            {lead.phone && <span style={{ direction: 'ltr' }}>{formatPhone(lead.phone)}</span>}
            {lead.city   && <span>· {lead.city}</span>}
            {lead.email  && <span>· {lead.email}</span>}
            {createdRel  && <span>· נוסף {createdRel.label}</span>}
          </div>
        </div>
      </div>

      {/* Grid of panels */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={sectionCard()} aria-label="נכסים תואמים">
            <MatchingList leadId={lead.id} title="נכסים תואמים" />
          </section>
          <LeadSummaryPanel lead={lead} onEdit={() => setEditOpen(true)} />
          <section style={sectionCard()} aria-label="תגי לקוח">
            <h3 style={sectionTitle()}>תגים</h3>
            <TagPicker entityType="LEAD" entityId={lead.id} />
          </section>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={sectionCard()} aria-label="תזכורות">
            <RemindersPanel leadId={lead.id} />
          </section>
          {latestMeeting && (
            <MeetingSummarizerCard
              meeting={latestMeeting}
              onUpdated={(m) => setLatestMeeting(m)}
            />
          )}
          <section style={sectionCard()} aria-label="פעילות">
            <ActivityPanel entityType="Lead" entityId={lead.id} />
          </section>
          <ActivityTimeline lead={lead} />
        </div>
      </div>

      {meetingOpen && (
        <LeadMeetingDialog
          lead={lead}
          onClose={() => setMeetingOpen(false)}
          onCreated={() => { loadLatestMeeting(); }}
        />
      )}
      {editOpen && (
        <CustomerEditDialog
          lead={lead}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            toast.success('הפרטים נשמרו');
            try { await loadLead(); } catch { /* ignore */ }
          }}
        />
      )}
      {aiMatchesOpen && (
        <AiMatchesDrawer
          leadId={lead.id}
          onClose={() => setAiMatchesOpen(false)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// LeadSummaryPanel — read-only snapshot of the lead's profile.
// ──────────────────────────────────────────────────────────────────
function LeadSummaryPanel({ lead, onEdit }) {
  const fmtPrice = (n) => {
    if (!Number.isFinite(n) || n === 0) return null;
    if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₪${Math.round(n / 1_000)}K`;
    return `₪${n.toLocaleString('he-IL')}`;
  };
  const priceRange = (() => {
    const lo = fmtPrice(lead.priceMin);
    const hi = fmtPrice(lead.priceMax);
    if (lo && hi) return `${lo} – ${hi}`;
    if (lo) return `מ-${lo}`;
    if (hi) return `עד ${hi}`;
    return null;
  })();
  const roomsRange = (() => {
    const lo = Number.isFinite(lead.roomsMin) ? lead.roomsMin : null;
    const hi = Number.isFinite(lead.roomsMax) ? lead.roomsMax : null;
    if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo} – ${hi}`;
    if (lo != null) return `מ-${lo}`;
    if (hi != null) return `עד ${hi}`;
    return null;
  })();
  const lookingLabel  = lead.lookingFor === 'RENT' ? 'שכירות' : 'קנייה';
  const interestLabel = lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי';

  const rows = [
    ['טלפון',         lead.phone],
    ['אימייל',        lead.email],
    ['עיר מבוקשת',    lead.city],
    ['רחוב מבוקש',    lead.street],
    ['מחפש',          `${lookingLabel} · ${interestLabel}`],
    ['טווח מחיר',     priceRange],
    ['חדרים',         roomsRange],
    ['מקור',          lead.source],
    ['סקטור',         lead.sector],
    ['אישור עקרוני',  lead.preApproval ? 'יש' : null],
  ].filter(([, v]) => v != null && v !== '');

  return (
    <section style={sectionCard()} aria-label="פרטי לקוח">
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <h3 style={{ ...sectionTitle(), margin: 0 }}>פרטי לקוח</h3>
        <button type="button" onClick={onEdit} style={ghostBtn()} title="ערוך פרטי לקוח">
          <Edit3 size={12} /> ערוך
        </button>
      </header>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: DT.muted, margin: 0 }}>
          עוד לא מולאו פרטים על הלקוח הזה.
        </p>
      ) : (
        <dl style={{
          margin: 0, display: 'grid', gap: '8px 14px',
          gridTemplateColumns: 'max-content 1fr', fontSize: 13,
        }}>
          {rows.map(([label, value]) => (
            <ReadRow key={label} label={label} value={value} />
          ))}
        </dl>
      )}
      {lead.notes && (
        <div style={{
          marginTop: 14, padding: '12px 14px',
          background: DT.cream4, borderRadius: 10,
          border: `1px solid ${DT.border}`,
        }}>
          <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            הערות
          </span>
          <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.6 }}>{lead.notes}</p>
        </div>
      )}
    </section>
  );
}

function ReadRow({ label, value }) {
  return (
    <>
      <dt style={{ color: DT.muted, fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: 0, color: DT.ink, wordBreak: 'break-word' }}>{value}</dd>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// ActivityTimeline — events derived from the lead's fields.
// ──────────────────────────────────────────────────────────────────
function ActivityTimeline({ lead }) {
  const events = useMemo(() => {
    const items = [];
    if (lead.lastContact) {
      const rel = relativeDate(lead.lastContact);
      const days = Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000);
      const title = days >= 0
        ? `קשר אחרון לפני ${days} ימים`
        : 'קשר אחרון מתוכנן';
      items.push({
        kind: 'contact', ts: new Date(lead.lastContact).getTime(),
        icon: Phone, title, sub: rel.label, absolute: absoluteTime(lead.lastContact),
      });
    }
    if (lead.statusUpdatedAt) {
      const s = statusMeta(lead.status);
      items.push({
        kind: 'status', ts: new Date(lead.statusUpdatedAt).getTime(),
        icon: Sparkles,
        title: `סטטוס עודכן ל${s?.label || lead.status}`,
        sub: relativeTime(lead.statusUpdatedAt),
        absolute: absoluteTime(lead.statusUpdatedAt),
      });
    }
    if (lead.createdAt) {
      items.push({
        kind: 'created', ts: new Date(lead.createdAt).getTime(),
        icon: Building2,
        title: 'הליד נוצר',
        sub: relativeTime(lead.createdAt),
        absolute: absoluteTime(lead.createdAt),
      });
    }
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return items;
  }, [lead]);

  return (
    <section style={sectionCard()} aria-label="ציר פעילות">
      <h3 style={sectionTitle()}>
        <History size={16} /> ציר פעילות
      </h3>
      {events.length === 0 ? (
        <p style={{ fontSize: 13, color: DT.muted, margin: 0 }}>עדיין אין פעילות לתצוגה. עדכן קשר או חתום הסכם כדי להתחיל לעקוב.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev, idx) => {
            const Icon = ev.icon || Calendar;
            return (
              <li key={`${ev.kind}-${idx}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 99,
                  background: DT.goldSoft, color: DT.goldDark,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <Icon size={14} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.title}</div>
                  <div title={ev.absolute || ''} style={{ fontSize: 12, color: DT.muted }}>
                    {ev.sub}
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

function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 12px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    display: 'inline-flex', gap: 5, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
