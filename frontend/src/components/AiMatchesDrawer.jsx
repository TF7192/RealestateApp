import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X, Loader2, AlertCircle, Building2, User, ChevronLeft } from 'lucide-react';
import Portal from './Portal';
import useFocusTrap from '../hooks/useFocusTrap';
import api from '../lib/api';
import { displayPrice, displayText } from '../lib/display';

// Sprint 5 — AI smart-matcher side drawer.
//
// Opens from the "✨ התאמות חכמות" button on PropertyDetail or
// CustomerDetail. Fetches up to 5 top matches from the LLM-backed
// /api/ai/match-leads or /api/ai/match-properties endpoint and renders
// a scored list with Hebrew reasons. Inline DT-palette styles per the
// Sprint 5 brief.
//
// Props:
//   - propertyId  → show leads that match this property
//   - leadId      → show properties that match this lead
//   - onClose()   → fires when the drawer is dismissed

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function AiMatchesDrawer({ propertyId, leadId, onClose }) {
  const direction = leadId ? 'lead' : propertyId ? 'property' : null;
  const title = direction === 'lead' ? 'נכסים תואמים (AI)' : 'לקוחות תואמים (AI)';
  const emptyCopy =
    direction === 'lead'
      ? 'ה-AI לא מצא נכסים תואמים בפרופיל שלך כרגע.'
      : 'ה-AI לא מצא לקוחות תואמים בפרופיל שלך כרגע.';

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const res = direction === 'lead'
          ? await api.aiMatchProperties(leadId)
          : await api.aiMatchLeads(propertyId);
        if (cancelled) return;
        setMatches(Array.isArray(res?.matches) ? res.matches : []);
      } catch (e) {
        if (cancelled) return;
        // 503 → backend explicitly told us the feature is off. Surface
        // that distinctly so agents understand it's a config issue, not
        // a transient failure.
        if (e?.status === 503) {
          setErr('שירות ה-AI אינו מוגדר כעת.');
        } else {
          setErr(e?.message || 'טעינת התאמות AI נכשלה');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (direction) load();
    return () => { cancelled = true; };
  }, [direction, leadId, propertyId]);

  if (!direction) return null;

  return (
    <Portal>
      <div
        onClick={onClose}
        style={styles.backdrop}
      >
        <aside
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-matches-title"
          style={styles.panel}
        >
          <header style={styles.head}>
            <div style={styles.headLeft}>
              <span style={styles.headIcon} aria-hidden>
                <Sparkles size={16} />
              </span>
              <div>
                <strong id="ai-matches-title" style={styles.headTitle}>{title}</strong>
                <div style={styles.headSub}>המלצות מבוססות Claude Opus</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={styles.closeBtn}
            >
              <X size={18} />
            </button>
          </header>

          <div style={styles.body}>
            {loading ? (
              <div style={styles.stateRow} role="status">
                <Loader2 size={16} className="y2-spin" aria-hidden />
                <span>ה-AI מחשב התאמות…</span>
              </div>
            ) : err ? (
              <div style={styles.errorRow} role="alert">
                <AlertCircle size={14} aria-hidden />
                <span>{err}</span>
              </div>
            ) : matches.length === 0 ? (
              <div style={styles.emptyRow}>{emptyCopy}</div>
            ) : (
              <ul style={styles.list}>
                {matches.map((m, i) => (
                  <MatchCard key={`${direction}-${i}`} match={m} direction={direction} onClose={onClose} />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </Portal>
  );
}

function MatchCard({ match, direction, onClose }) {
  const score = Math.round(Number(match?.score || 0));
  const entity = direction === 'lead' ? match?.property : match?.lead;
  const href = direction === 'lead'
    ? (entity?.id ? `/properties/${entity.id}` : null)
    : (entity?.id ? `/customers/${entity.id}` : null);
  const Icon = direction === 'lead' ? Building2 : User;

  // Primary display line.
  const nameLine = direction === 'lead'
    ? [entity?.street, entity?.city].filter(Boolean).join(', ') ||
      displayText(entity?.type)
    : (entity?.name || displayText(null));

  // Secondary (muted) line — city / price / budget depending on side.
  const subLine = direction === 'lead'
    ? (entity?.marketingPrice != null ? displayPrice(entity.marketingPrice) : '')
    : [entity?.city, entity?.budget ? displayPrice(entity.budget) : null]
        .filter(Boolean).join(' · ');

  const body = (
    <>
      <span style={styles.cardTop}>
        <span style={{ ...styles.scoreChip, ...scoreChipTone(score) }}>
          <strong style={{ fontSize: 14 }}>{score}</strong>
          <span style={{ fontSize: 10, opacity: 0.7 }}>%</span>
        </span>
        <span style={styles.cardName}>
          <Icon size={13} aria-hidden style={{ color: DT.muted }} />
          <span>{nameLine}</span>
        </span>
        {href && <ChevronLeft size={14} aria-hidden style={{ color: DT.muted }} />}
      </span>
      {subLine && <span style={styles.cardSub}>{subLine}</span>}
      {match?.reason && <span style={styles.cardReason}>{match.reason}</span>}
    </>
  );

  const cardStyle = { ...styles.card, cursor: href ? 'pointer' : 'default' };

  return (
    <li style={{ listStyle: 'none' }}>
      {href ? (
        <Link to={href} onClick={onClose} style={{ ...cardStyle, textDecoration: 'none' }}>
          {body}
        </Link>
      ) : (
        <div style={cardStyle}>{body}</div>
      )}
    </li>
  );
}

// Score chip tone — hotter matches get a solid gold gradient, mid-range
// matches get the goldSoft wash, cool matches stay neutral.
function scoreChipTone(score) {
  if (score >= 80) {
    return {
      background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
      color: DT.ink,
      borderColor: DT.gold,
    };
  }
  if (score >= 50) {
    return { background: DT.goldSoft, color: DT.goldDark, borderColor: DT.border };
  }
  return { background: DT.cream2, color: DT.muted, borderColor: DT.border };
}

const styles = {
  backdrop: {
    ...FONT,
    position: 'fixed', inset: 0,
    background: 'rgba(30,26,20,0.4)',
    backdropFilter: 'blur(2px)',
    zIndex: 1000,
    display: 'flex', justifyContent: 'flex-end',
    animation: 'fadeIn 0.15s ease-out',
  },
  panel: {
    ...FONT,
    height: '100%', width: 'min(440px, 100vw)',
    background: DT.cream4, color: DT.ink,
    borderInlineStart: `1px solid ${DT.border}`,
    boxShadow: '-12px 0 40px rgba(30,26,20,0.14)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '14px 16px',
    borderBottom: `1px solid ${DT.border}`,
    background: DT.white,
  },
  headLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 10,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    color: DT.ink,
  },
  headTitle: { fontSize: 15, fontWeight: 800, color: DT.ink },
  headSub: { fontSize: 11, color: DT.muted, marginTop: 2 },
  closeBtn: {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 10,
    background: DT.cream2, color: DT.ink,
    border: `1px solid ${DT.border}`, cursor: 'pointer',
  },
  body: {
    flex: 1, overflowY: 'auto',
    padding: 14,
  },
  stateRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 12px', color: DT.muted, fontSize: 13,
    background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 10,
  },
  errorRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 12px', color: DT.danger, fontSize: 13,
    background: '#fff4f4', border: '1px solid rgba(185,28,28,0.2)', borderRadius: 10,
  },
  emptyRow: {
    padding: '14px 12px', color: DT.muted, fontSize: 13, textAlign: 'center',
    background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 10,
  },
  list: {
    display: 'flex', flexDirection: 'column', gap: 10,
    margin: 0, padding: 0,
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 12,
    background: DT.white,
    border: `1px solid ${DT.border}`, borderRadius: 12,
    color: DT.ink,
    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
  },
  cardTop: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  scoreChip: {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '4px 10px', borderRadius: 99,
    border: '1px solid transparent',
    fontWeight: 800, minWidth: 46, justifyContent: 'center',
  },
  cardName: {
    flex: 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 13, fontWeight: 700, color: DT.ink,
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cardSub: {
    fontSize: 12, color: DT.muted,
    marginInlineStart: 54, // line up under the score chip
  },
  cardReason: {
    fontSize: 12, color: DT.goldDark,
    background: DT.goldSoft,
    padding: '6px 10px', borderRadius: 8,
    border: `1px solid ${DT.border}`,
    marginTop: 2,
  },
};
