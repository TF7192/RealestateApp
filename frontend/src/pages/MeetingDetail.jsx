// Sprint 7 / ScreenMeetingDetail — single-meeting detail page with a
// pre-meeting AI brief.
//
// Route: /meetings/:id. The page loads the meeting via the existing
// cross-lead list endpoint (filtered client-side for now — a dedicated
// GET /api/meetings/:id would be cleaner, but the list view already
// returns the full row and hitting it once is cheap). The "צור brief"
// button hits POST /api/ai/meeting-brief for the structured prep card,
// and below that the existing MeetingSummarizerCard handles the
// post-meeting voice summary.
//
// Inline DT palette (Cream & Gold) — matches DealDetail / OwnerDetail.

import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight, AlertCircle, CalendarDays, MapPin, User, Sparkles,
  CheckCircle, Loader2, Mic,
} from 'lucide-react';
import api from '../lib/api';
import MeetingSummarizerCard from '../components/MeetingSummarizerCard';
import { absoluteTime } from '../lib/time';
import { displayDateTime, displayText } from '../lib/display';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function MeetingDetail() {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // AI brief state — separate from meeting fetch so a brief failure
  // doesn't break the page.
  const [brief, setBrief] = useState(null); // { brief, checklist, talkingPoints }
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No dedicated GET /meetings/:id yet — the flat list already
      // returns the full row including the linked lead.
      const res = await api.listMeetings();
      const found = (res?.items || []).find((m) => m.id === id);
      if (!found) throw new Error('הפגישה לא נמצאה');
      setMeeting(found);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינת הפגישה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleGenerateBrief = async () => {
    setBriefErr(null);
    setBriefLoading(true);
    try {
      const res = await api.aiMeetingBrief(id);
      setBrief(res || null);
    } catch (e) {
      const code = e?.data?.error?.code;
      if (code === 'ai_not_configured') {
        setBriefErr('שירות ה-AI לא מוגדר בסביבה הזו');
      } else {
        setBriefErr(e?.message || 'יצירת ה-brief נכשלה');
      }
    } finally {
      setBriefLoading(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (error || !meeting) {
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
          <AlertCircle size={16} /> {error || 'הפגישה לא נמצאה'}
        </div>
        <Link to="/calendar" style={ghostBtn()}>
          <ArrowRight size={14} /> חזרה ליומן
        </Link>
      </div>
    );
  }

  const lead = meeting.lead;

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Back link */}
      <div style={{ marginBottom: 18 }}>
        <Link to="/calendar" style={{
          ...FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        }}>
          <ArrowRight size={16} />
          חזרה ליומן
        </Link>
      </div>

      {/* Header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            {meeting.title || 'פגישה'}
          </h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip bg={DT.goldSoft} color={DT.goldDark}>
              <CalendarDays size={12} />
              <span title={absoluteTime(meeting.startsAt)}>
                {displayDateTime(meeting.startsAt)}
              </span>
            </Chip>
            {meeting.location && (
              <Chip bg={DT.cream2} color={DT.ink}>
                <MapPin size={12} /> {meeting.location}
              </Chip>
            )}
            {lead && (
              <Link to={`/customers/${lead.id}`} style={{ textDecoration: 'none' }}>
                <Chip bg={DT.cream2} color={DT.ink}>
                  <User size={12} /> {displayText(lead.name)}
                </Chip>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Three cream4 sub-cards */}
      <div style={{
        display: 'grid', gap: 16, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      }}>
        {/* Description */}
        <section style={subCard()} aria-label="תיאור הפגישה">
          <h3 style={sectionTitle()}>
            <CalendarDays size={16} /> תיאור הפגישה
          </h3>
          {meeting.notes ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: DT.ink }}>
              {meeting.notes}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: DT.muted, lineHeight: 1.7 }}>
              לא נוספו הערות לפגישה הזו.
            </p>
          )}
        </section>

        {/* Pre-meeting brief */}
        <section style={subCard()} aria-label="לפני הפגישה">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, marginBottom: 10,
          }}>
            <h3 style={{ ...sectionTitle(), margin: 0 }}>
              <Sparkles size={16} style={{ color: DT.goldDark }} /> לפני הפגישה
            </h3>
            <button
              type="button"
              onClick={handleGenerateBrief}
              disabled={briefLoading}
              style={briefLoading ? disabledBtn() : primaryBtn()}
            >
              {briefLoading ? (
                <>
                  <Loader2 size={12} className="estia-spin" /> מכין…
                </>
              ) : (
                <>
                  <Sparkles size={12} /> צור brief
                </>
              )}
            </button>
          </div>
          {briefErr && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.2)',
              color: DT.danger, fontSize: 12.5, marginBottom: 8,
            }}>
              <AlertCircle size={12} /> {briefErr}
            </div>
          )}
          {brief?.brief ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: DT.ink }}>
              {brief.brief}
            </p>
          ) : !briefErr && (
            <p style={{ margin: 0, fontSize: 13, color: DT.muted, lineHeight: 1.7 }}>
              לחצו "צור brief" כדי לקבל סיכום מקדים של הלקוח ומטרות הפגישה.
            </p>
          )}
        </section>

        {/* Checklist */}
        <section style={subCard()} aria-label="צ'ק-ליסט">
          <h3 style={sectionTitle()}>
            <CheckCircle size={16} style={{ color: DT.success }} /> צ'ק-ליסט
          </h3>
          {Array.isArray(brief?.checklist) && brief.checklist.length > 0 ? (
            <ul style={bulletList()}>
              {brief.checklist.map((item, i) => <li key={`c-${i}`}>{item}</li>)}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: DT.muted, lineHeight: 1.7 }}>
              ה-brief של ה-AI יצור צ'ק-ליסט מותאם לפגישה.
            </p>
          )}
        </section>

        {/* Talking points */}
        <section style={subCard()} aria-label="נקודות שיחה">
          <h3 style={sectionTitle()}>
            <User size={16} /> נקודות שיחה
          </h3>
          {Array.isArray(brief?.talkingPoints) && brief.talkingPoints.length > 0 ? (
            <ul style={bulletList()}>
              {brief.talkingPoints.map((item, i) => <li key={`t-${i}`}>{item}</li>)}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: DT.muted, lineHeight: 1.7 }}>
              כאן יופיעו נקודות השיחה המותאמות ללקוח וליעדי הפגישה.
            </p>
          )}
        </section>
      </div>

      {/* Recording CTA + existing summarizer */}
      <section aria-label="הקלטה וסיכום" style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          color: DT.muted, fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          <Mic size={14} /> הקלטת הפגישה
        </div>
        <MeetingSummarizerCard
          meeting={meeting}
          onUpdated={(m) => setMeeting(m)}
        />
      </section>

      <style>{`
        .estia-spin { animation: estia-spin 0.9s linear infinite; }
        @keyframes estia-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Chip({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color,
      borderRadius: 99, fontWeight: 700, fontSize: 12,
      padding: '4px 10px',
    }}>{children}</span>
  );
}

function subCard() {
  return {
    background: DT.cream4, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 18,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 10px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function bulletList() {
  return {
    margin: 0, paddingInlineStart: 20,
    display: 'flex', flexDirection: 'column', gap: 6,
    fontSize: 13, lineHeight: 1.6, color: DT.ink,
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
  };
}
function disabledBtn() {
  return {
    ...primaryBtn(),
    background: DT.cream2,
    color: DT.muted,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 4, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
