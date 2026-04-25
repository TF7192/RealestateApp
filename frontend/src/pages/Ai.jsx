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

// Broker-specific prompts — wired to the agent's own data, not generic
// selling-skills chat. Each prompt implies an action the AI chat page
// can run against /api/ai/chat with context pulled from the caller's
// leads / properties / deals.
const SUGGESTED_PROMPTS = [
  'תכתוב הודעת תזכורת לכל הלידים שמחפשים דירה בראשון לציון',
  'תבדוק לי איזה ליד לא קיבל מענה בשבוע האחרון',
  'סכם לי את העסקאות שנסגרו החודש',
  'איזה נכסים במלאי שלי מתאימים לליד החם האחרון שהוספתי?',
  'הצע לי טקסט שיווק לפנטהאוז על הים שאני משווק',
  'הכן לי תזכורות מעקב לכל הלידים שבסטטוס פושר',
];

const PERSIST_KEY = 'estia-ai-chat-v1';
// Keep the last 5 user+assistant turns (10 messages) in localStorage so
// a page refresh doesn't wipe a live conversation. Anything older is
// trimmed — we never want to ship the full transcript to the server.
const PERSIST_TURNS = 5;

function loadPersistedMessages() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-PERSIST_TURNS * 2);
  } catch { return []; }
}
function persistMessages(messages) {
  try {
    const trimmed = messages.slice(-PERSIST_TURNS * 2);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(trimmed));
  } catch { /* quota errors etc. — fine, non-critical */ }
}

export default function Ai() {
  // messages: [{ role: 'user'|'assistant', content: string }]
  const [messages, setMessages] = useState(() => loadPersistedMessages());
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

  // Persist the (trimmed) transcript on every change so a refresh
  // doesn't wipe the conversation.
  useEffect(() => { persistMessages(messages); }, [messages]);

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
      padding: 24, color: DT.ink,
      // Cap the chat to a comfortable column (≤880 wide) and a
      // bounded height so the panel doesn't eat the whole viewport
      // — feels like a card, not a landing page. The inner panel
      // still scrolls on its own for long transcripts.
      // ~80% of the viewport (excluding the topbar) so the chat
      // feels like a proper workspace, not a widget. Still caps at
      // 960px so it doesn't get absurd on 4K screens.
      height: 'min(80vh, 960px)',
      maxHeight: 'calc(100vh - 48px)',
      maxWidth: 880,
      marginInline: 'auto',
      width: '100%',
      display: 'flex', flexDirection: 'column', gap: 14,
      overflow: 'hidden',
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
            עוזר מקצועי לסוכני נדל"ן — מבוסס Claude Sonnet 4.6
          </div>
        </div>
      </header>

      {/* Chat area — flex child with its own scrollable message list,
          so the whole page never scrolls past the composer. minHeight:0
          is the critical bit: without it, a flex child refuses to
          shrink below its content size and the overflow on the inner
          list never kicks in. */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 16, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        flex: 1, minHeight: 0,
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

        {/* Input row — textarea + send button share a single rounded
            white pill so the composer reads as one control instead of
            a floating button next to a tall textarea. Button is inset
            inside the pill, centered to the textarea's midline. */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{
            borderTop: `1px solid ${DT.border}`,
            background: DT.cream4,
            padding: 12,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 14,
            padding: '6px 6px 6px 14px',
            boxShadow: '0 2px 6px rgba(30,26,20,0.04)',
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל/י כל דבר על מכירה, ליד, או ניסוח הודעה…"
              rows={1}
              style={{
                ...FONT,
                flex: 1, resize: 'none',
                padding: '8px 2px',
                border: 'none', background: 'transparent', color: DT.ink,
                fontSize: 14, lineHeight: 1.6, outline: 'none',
                textAlign: 'right', maxHeight: 160, minHeight: 36,
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
          </div>
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

// Tiny, safe Markdown subset renderer. Supports the patterns Claude
// actually emits in this chat: **bold**, *italic*, ### headings
// (levels 1–3), "- " / "* " / "1. " bullets, `inline code`, and
// [links](href) (http/https only). No `dangerouslySetInnerHTML`, no
// external dep — every node is a regular React element so XSS can't
// slip through.
function renderInline(text, keyPrefix) {
  // Tokenise inline styling with one pass. Order matters: code first
  // so backticks don't get eaten by the bold/italic passes.
  const out = [];
  let i = 0;
  let idx = 0;
  const push = (node) => { out.push(node); idx += 1; };
  while (i < text.length) {
    const rest = text.slice(i);
    // `code`
    let m = rest.match(/^`([^`]+)`/);
    if (m) { push(<code key={`${keyPrefix}-c-${idx}`} style={{ background: '#efe9df', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em' }}>{m[1]}</code>); i += m[0].length; continue; }
    // **bold**
    m = rest.match(/^\*\*([^*]+)\*\*/);
    if (m) { push(<strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 800 }}>{renderInline(m[1], `${keyPrefix}-b-${idx}`)}</strong>); i += m[0].length; continue; }
    // *italic* (single asterisk — avoid eating bullets by requiring non-space after *)
    m = rest.match(/^\*(\S[^*]*)\*/);
    if (m) { push(<em key={`${keyPrefix}-i-${idx}`}>{renderInline(m[1], `${keyPrefix}-i-${idx}`)}</em>); i += m[0].length; continue; }
    // [label](href)
    m = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (m) { push(<a key={`${keyPrefix}-l-${idx}`} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#b48b4c', textDecoration: 'underline' }}>{m[1]}</a>); i += m[0].length; continue; }
    // Plain char — coalesce runs of plain text into one node.
    const stopAt = rest.search(/`|\*\*|\*|\[[^\]]+\]\(https?/);
    const chunkEnd = stopAt === -1 ? rest.length : Math.max(1, stopAt);
    push(rest.slice(0, chunkEnd));
    i += chunkEnd;
  }
  return out;
}

// Detect a GitHub-Flavored-Markdown pipe table. The first line is the
// header row; the second line is the separator (pipes + dashes); the
// rest are body rows. We tolerate the optional leading/trailing pipe.
function parseTableBlock(block) {
  const lines = block.split(/\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const sep = lines[1].trim();
  if (!/^\|?[\s:\-|]+\|?$/.test(sep) || !sep.includes('-')) return null;
  const split = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const header = split(lines[0]);
  const body = lines.slice(2).map(split);
  // Drop rows whose column count doesn't line up (defensive — some
  // models emit stray pipes inside cells).
  const clean = body.filter((r) => r.length === header.length);
  if (header.length < 2) return null;
  return { header, body: clean };
}

function renderTable(table, key) {
  return (
    <div key={key} style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 13,
        background: '#ffffff', border: '1px solid rgba(30,26,20,0.08)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <thead>
          <tr>
            {table.header.map((h, hi) => (
              <th key={hi} style={{
                padding: '8px 10px',
                background: 'rgba(180,139,76,0.12)',
                color: '#1e1a14', fontWeight: 800,
                fontSize: 12,
                textAlign: 'right',
                borderBottom: '1px solid rgba(30,26,20,0.08)',
              }}>{renderInline(h, `${key}-h-${hi}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.body.map((row, ri) => (
            <tr key={ri} style={{
              background: ri % 2 === 0 ? '#ffffff' : '#fbf7f0',
            }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '7px 10px',
                  borderTop: '1px solid rgba(30,26,20,0.06)',
                  color: '#1e1a14',
                  fontWeight: ci === 0 ? 600 : 500,
                }}>{renderInline(cell, `${key}-${ri}-${ci}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(raw) {
  // Block-level: split on blank lines, then decide per-block.
  const blocks = String(raw || '').split(/\n{2,}/);
  const nodes = [];
  blocks.forEach((block, bi) => {
    const key = `b-${bi}`;
    // Table first — otherwise the pipes fall through to inline and
    // render as literal characters.
    const table = parseTableBlock(block);
    if (table) { nodes.push(renderTable(table, key)); return; }
    // Fall through to existing per-block branches.
    renderBlockNonTable(block, key, nodes);
  });
  return nodes;
}

function renderBlockNonTable(block, key, nodes) {
  // Blockquote — every line begins with "> " or ">" (trims leading
  // whitespace on the way in). Render as a gold left-rule card so
  // templated messages (e.g. a WhatsApp draft) stand out from the
  // surrounding chat prose.
  const qLines = block.split(/\n/);
  if (qLines.length > 0 && qLines.every((l) => /^\s*>/.test(l))) {
    const inner = qLines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n');
    const innerLines = inner.split(/\n/);
    nodes.push(
      <blockquote key={key} style={{
        margin: '6px 0', padding: '10px 14px',
        background: '#fbf7f0',
        borderInlineStart: '3px solid #b48b4c',
        borderRadius: 8,
        color: '#1e1a14', lineHeight: 1.7,
      }}>
        {innerLines.map((l, li) => (
          <span key={`${key}-q-${li}`}>
            {renderInline(l, `${key}-q-${li}`)}
            {li < innerLines.length - 1 ? <br /> : null}
          </span>
        ))}
      </blockquote>
    );
    return;
  }
  // Heading: ### / ## / #
  const h = block.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const level = h[1].length; // 1..3
    const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
    const fontSize = level === 1 ? 17 : level === 2 ? 15 : 14;
    nodes.push(
      <Tag key={key} style={{ fontWeight: 800, fontSize, margin: '8px 0 4px', color: '#1e1a14' }}>
        {renderInline(h[2].trim(), key)}
      </Tag>
    );
    return;
  }
  // Bullet / numbered list: every line in the block starts with -, *, or a number.
  const lines = block.split(/\n/).filter(Boolean);
  const isBullet = lines.every((l) => /^(\s*[-*]\s+|\s*\d+[.)]\s+)/.test(l));
  if (isBullet && lines.length > 0) {
    const numbered = /^\s*\d+[.)]/.test(lines[0]);
    const Tag = numbered ? 'ol' : 'ul';
    nodes.push(
      <Tag key={key} style={{ margin: '4px 0', paddingInlineStart: 22 }}>
        {lines.map((l, li) => {
          const txt = l.replace(/^(\s*[-*]\s+|\s*\d+[.)]\s+)/, '');
          return (
            <li key={`${key}-${li}`} style={{ margin: '2px 0', lineHeight: 1.6 }}>
              {renderInline(txt, `${key}-${li}`)}
            </li>
          );
        })}
      </Tag>
    );
    return;
  }
  // Plain paragraph — preserve hard newlines inside with <br>.
  const plainLines = block.split(/\n/);
  nodes.push(
    <p key={key} style={{ margin: '4px 0', lineHeight: 1.65 }}>
      {plainLines.map((l, li) => (
        <span key={`${key}-${li}`}>
          {renderInline(l, `${key}-${li}`)}
          {li < plainLines.length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
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
        // User bubbles keep pre-wrap (they typed it); assistant bubbles
        // render markdown so **bold** / ### headings / bullets display
        // rich instead of raw.
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
      }}>
        {loading ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, color: DT.muted,
          }}>
            <Loader2 size={14} className="estia-spin" /> חושב…
          </span>
        ) : isUser ? content : renderMarkdown(content)}
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
    // Inset inside the composer pill — 36×36 circle, no shadow so it
    // sits flush with the white pill background instead of appearing
    // to float below it.
    width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
    display: 'grid', placeItems: 'center', flexShrink: 0,
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
