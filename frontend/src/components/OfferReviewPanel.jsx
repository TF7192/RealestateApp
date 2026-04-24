// Sprint 7 / ScreenOffer — buyer-offer review with AI counter-price.
//
// Embedded inside DealDetail. The agent types the current buyer offer
// amount; "✨ המלצת AI" calls POST /api/ai/offer-review which returns
// { recommendedCounter, confidence: 'low'|'medium'|'high', reasoning }.
// The panel renders the recommended counter + confidence chip +
// Hebrew reasoning.
//
// Inline DT palette (Cream & Gold) to match DealDetail.

import { useState } from 'react';
import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { displayPrice } from '../lib/display';
import { inputPropsForPrice } from '../lib/inputProps';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', warning: '#b45309', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const CONFIDENCE_LABELS = {
  low:    { label: 'ביטחון נמוך',  color: DT.muted,   bg: DT.cream2 },
  medium: { label: 'ביטחון בינוני', color: DT.warning, bg: 'rgba(180,83,9,0.12)' },
  high:   { label: 'ביטחון גבוה',   color: DT.success, bg: 'rgba(21,128,61,0.12)' },
};

export default function OfferReviewPanel({ deal }) {
  // Default the offer field to the deal's existing `offer` (if any) so
  // the agent doesn't retype what's already on the record.
  const [offerStr, setOfferStr] = useState(deal?.offer ? String(deal.offer) : '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [review, setReview] = useState(null); // { recommendedCounter, confidence, reasoning }

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setErr(null);
    const amount = Number(String(offerStr).replace(/\D/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('הזן/י סכום הצעה תקין');
      return;
    }
    setLoading(true);
    try {
      const res = await api.aiOfferReview(deal.id, amount);
      setReview(res || null);
    } catch (e2) {
      const code = e2?.data?.error?.code;
      if (code === 'ai_not_configured') {
        setErr('שירות ה-AI לא מוגדר בסביבה הזו');
      } else {
        setErr(e2?.message || 'סקירת ההצעה נכשלה');
      }
    } finally {
      setLoading(false);
    }
  };

  const confCfg = review?.confidence ? CONFIDENCE_LABELS[review.confidence] : null;

  return (
    <section
      aria-label="סקירת הצעה"
      style={{
        ...FONT,
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: 20,
        color: DT.ink,
      }}
    >
      <h3 style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 14, fontWeight: 800, margin: '0 0 12px', color: DT.ink,
        letterSpacing: -0.2,
      }}>
        <Sparkles size={14} style={{ color: DT.goldDark }} />
        סקירת הצעה (AI)
      </h3>

      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
        marginBottom: err || review ? 12 : 0,
      }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle()} htmlFor="offer-amount">סכום ההצעה</label>
          <input
            id="offer-amount"
            {...inputPropsForPrice()}
            value={offerStr}
            onChange={(e) => setOfferStr(e.target.value)}
            placeholder="למשל 2,700,000"
            style={{
              ...FONT,
              width: '100%', marginTop: 4,
              padding: '10px 12px',
              border: `1px solid ${DT.border}`,
              borderRadius: 10, fontSize: 14,
              background: DT.cream4, color: DT.ink,
              outline: 'none', textAlign: 'right',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={loading ? disabledBtn() : primaryBtn()}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="estia-spin" /> מחשב…
            </>
          ) : (
            <>
              <Sparkles size={14} /> המלצת AI
            </>
          )}
        </button>
      </form>

      {err && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.2)',
          color: DT.danger, fontSize: 13,
        }}>
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {review && !err && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: DT.cream4, border: `1px solid ${DT.border}`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={labelStyle()}>מחיר נגדי מומלץ</span>
            <span style={{
              fontSize: 22, fontWeight: 800, color: DT.goldDark, letterSpacing: -0.4,
            }}>
              {displayPrice(review.recommendedCounter)}
            </span>
            {confCfg && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                alignSelf: 'flex-start',
                background: confCfg.bg, color: confCfg.color,
                borderRadius: 99, fontWeight: 700, fontSize: 11,
                padding: '3px 9px', marginTop: 4,
              }}>{confCfg.label}</span>
            )}
          </div>
          {review.reasoning && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: DT.goldSoft, border: `1px solid ${DT.border}`,
              color: DT.ink, fontSize: 13, lineHeight: 1.7,
            }}>
              {review.reasoning}
            </div>
          )}
        </div>
      )}

      <style>{`
        .estia-spin { animation: estia-spin 0.9s linear infinite; }
        @keyframes estia-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

function labelStyle() {
  return {
    display: 'block',
    fontSize: 11, color: DT.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.4,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
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
