// Sprint 7 / ScreenAI — Estia AI chat page.
//
// Route: /ai. A simple client-side chat surface — messages live in
// component state (no server-side history for now) and every send
// replays the full transcript to POST /api/ai/chat which forwards it
// to Claude Opus 4.7. Premium-gated on the backend; free-tier users
// see the global PremiumGateDialog as soon as they submit.
//
// Inline DT palette (Cream & Gold), RTL, Hebrew UI copy.

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, AlertCircle, Bot, User } from 'lucide-react';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const SUGGESTED_PROMPTS = [
  'נסח לי הודעת WhatsApp ללקוח חמים שעדיין לא חזר',
  'איך אני מטפל בהתנגדות על מחיר?',
  'הצע לי סקריפט פתיחה לפגישה עם קונה ראשון',
];

export default function Ai() {
  // messages: [{ role: 'user'|'assistant', content: string }]
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);

  // Auto-scroll to the newest message when the list grows.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleSend = async (content) => {
    const text = String(content ?? input).trim();
    if (!text || loading) return;
    setErr(null);
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await api.aiChat(next);
      const reply = res?.reply ?? '';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || 'אין תשובה.' }]);
    } catch (e) {
      const code = e?.data?.error?.code;
      if (code === 'ai_not_configured') {
        setErr('שירות ה-AI לא מוגדר בסביבה הזו');
      } else {
        setErr(e?.message || 'שליחת ההודעה נכשלה');
      }
      // Roll back the optimistic user message so they can retry without
      // the previous turn showing as "sent but unanswered".
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const empty = messages.length === 0 && !loading;

  return (
    <div dir="rtl" style={{
      ...FONT,
      padding: 28, color: DT.ink,
      minHeight: '100%',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          display: 'grid', placeItems: 'center', color: DT.ink,
          boxShadow: '0 8px 20px rgba(180,139,76,0.28)',
        }}>
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: 0 }}>
            Estia AI
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            עוזר מקצועי לסוכני נדל"ן — מבוסס Claude Opus 4.7
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 16, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        minHeight: 420, flex: 1,
      }}>
        <div
          ref={listRef}
          style={{
            flex: 1, overflowY: 'auto', padding: 20,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          {empty ? (
            <EmptyState onPick={(p) => handleSend(p)} />
          ) : (
            <>
              {messages.map((m, i) => (
                <Bubble key={`m-${i}`} role={m.role} content={m.content} />
              ))}
              {loading && (
                <Bubble role="assistant" loading />
              )}
            </>
          )}
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{
            borderTop: `1px solid ${DT.border}`,
            background: DT.cream4,
            padding: 12,
            display: 'flex', gap: 10, alignItems: 'flex-end',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל/י כל דבר על מכירה, ליד, או ניסוח הודעה…"
            rows={2}
            style={{
              ...FONT,
              flex: 1, resize: 'none',
              padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${DT.border}`,
              background: DT.white, color: DT.ink,
              fontSize: 14, lineHeight: 1.6, outline: 'none',
              textAlign: 'right',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="שלח"
            style={(loading || !input.trim()) ? disabledBtn() : primaryBtn()}
          >
            {loading ? <Loader2 size={16} className="estia-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>

      {err && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.2)',
          color: DT.danger, fontSize: 13,
        }}>
          <AlertCircle size={14} /> {err}
        </div>
      )}

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

function Bubble({ role, content, loading }) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex', gap: 10,
      justifyContent: isUser ? 'flex-start' : 'flex-end',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={avatar(DT.goldSoft, DT.goldDark)}>
          <Bot size={14} aria-hidden="true" />
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        padding: '10px 14px', borderRadius: 12,
        background: isUser ? DT.cream2 : DT.cream4,
        border: `1px solid ${DT.border}`,
        color: DT.ink,
        fontSize: 14, lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
      }}>
        {loading ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, color: DT.muted,
          }}>
            <Loader2 size={14} className="estia-spin" /> חושב…
          </span>
        ) : content}
      </div>
      {isUser && (
        <div style={avatar(DT.cream2, DT.ink)}>
          <User size={14} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div style={{
      margin: 'auto', textAlign: 'center', padding: 16,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      maxWidth: 520,
    }}>
      <Sparkles size={32} style={{ color: DT.goldDark }} aria-hidden="true" />
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: DT.ink }}>
        איך אפשר לעזור?
      </h2>
      <p style={{ fontSize: 13, color: DT.muted, lineHeight: 1.7, margin: 0 }}>
        שאל/י על ניסוח הודעות, טיפול בהתנגדויות, הכנה לפגישה,
        או כל דבר אחר שיעזור לך היום.
      </p>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
        marginTop: 6,
      }}>
        {SUGGESTED_PROMPTS.map((p, i) => (
          <button
            key={`s-${i}`}
            type="button"
            onClick={() => onPick(p)}
            style={{
              ...FONT,
              padding: '8px 12px', borderRadius: 99,
              border: `1px solid ${DT.border}`,
              background: DT.cream4, color: DT.ink,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textAlign: 'right',
            }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}

function avatar(bg, color) {
  return {
    width: 28, height: 28, borderRadius: 99,
    background: bg, color,
    display: 'grid', placeItems: 'center',
    flexShrink: 0,
    border: `1px solid ${DT.border}`,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    width: 44, height: 44, borderRadius: 10, cursor: 'pointer',
    display: 'grid', placeItems: 'center',
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
