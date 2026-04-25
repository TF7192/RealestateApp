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
import AiQuotaChips from '../components/AiQuotaChips';

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
    // PERF-012 — strip the in-flight `__streaming` flag and skip
    // empty placeholders. The trimmed transcript should look the
    // same on a refresh as it does after the stream finishes.
    const cleaned = messages
      .filter((m) => !(m.__streaming && !m.content))
      .map(({ __streaming, ...rest }) => rest); // eslint-disable-line no-unused-vars
    const trimmed = cleaned.slice(-PERSIST_TURNS * 2);
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

  // PERF-012 — keep a handle to the active stream so we can abort it
  // if the user navigates away while a long answer is generating.
  const streamRef = useRef(null);

  // Cancel any in-flight stream when the page unmounts. Without this
  // an aborted user (browser back) keeps the SSE connection open
  // until the assistant finishes — wastes Anthropic credits and the
  // backend's request slot.
  useEffect(() => () => {
    try { streamRef.current?.cancel(); } catch { /* noop */ }
  }, []);

  const handleSend = (content) => {
    const text = String(content ?? input).trim();
    if (!text || loading) return;
    setErr(null);
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);

    // Append a placeholder assistant bubble we can append text into
    // as deltas arrive. `__streaming` is a transient flag the Bubble
    // component reads to render the typing indicator (the very first
    // delta swaps it off).
    setMessages((prev) => [...prev, { role: 'assistant', content: '', __streaming: true }]);

    let gotAnyText = false;

    const handle = api.aiChatStream(next, {
      onText: (delta) => {
        gotAnyText = true;
        setMessages((prev) => {
          const out = prev.slice();
          const last = out[out.length - 1];
          if (last && last.role === 'assistant') {
            out[out.length - 1] = {
              ...last,
              content: (last.content || '') + delta,
              __streaming: true,
            };
          }
          return out;
        });
      },
      onDone: () => {
        setMessages((prev) => {
          const out = prev.slice();
          const last = out[out.length - 1];
          if (last && last.role === 'assistant') {
            out[out.length - 1] = {
              role: 'assistant',
              content: last.content || 'אין תשובה.',
            };
          }
          return out;
        });
        setLoading(false);
      },
      onError: (message, code) => {
        if (code === 'ai_not_configured') setErr('שירות ה-AI לא מוגדר בסביבה הזו');
        else setErr(message || 'שליחת ההודעה נכשלה');
        // Roll back: drop the streaming-assistant placeholder *and*
        // the user message so retry is clean.
        setMessages((prev) => {
          const out = prev.slice();
          // Drop the streaming placeholder if no text arrived.
          if (out.length && out[out.length - 1].__streaming && !gotAnyText) {
            out.pop();
            // Also drop the user message so the input feels like a
            // failed send.
            out.pop();
          } else if (out.length && out[out.length - 1].__streaming) {
            // Some text did arrive — keep it but strip the marker.
            const last = out[out.length - 1];
            out[out.length - 1] = { role: 'assistant', content: last.content };
          }
          return out;
        });
        setLoading(false);
      },
    });
    streamRef.current = handle;
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
      // ~85% of the viewport (excluding the topbar) so the chat
      // feels like a real workspace, not a widget. Caps at 1020px
      // so it doesn't get absurd on 4K screens.
      height: 'min(85vh, 1020px)',
      maxHeight: 'calc(100vh - 32px)',
      maxWidth: 980,
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: 0 }}>
            Estia AI
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 2 }}>
            עוזר מקצועי לסוכני נדל"ן — מבוסס Claude Haiku 4.5
          </div>
        </div>
        <AiQuotaChips kind="chat" />
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
                // PERF-012 — when the assistant bubble is mid-stream
                // and no text has landed yet, render the "thinking…"
                // affordance instead of an empty bubble. As soon as
                // the first delta arrives, the rendered content
                // takes over without a layout jump.
                <Bubble
                  key={`m-${i}`}
                  role={m.role}
                  content={m.content}
                  loading={m.__streaming && !m.content}
                />
              ))}
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
// QuotaChips were inlined here originally; the shared component now
// lives at frontend/src/components/AiQuotaChips.jsx so /voice-demo
// can render the voice-minute chip and /ai renders the chat-questions
// chip. See <AiQuotaChips kind="chat" /> in the header above.

// Phone-number / large-integer pattern. Wrapped in <bdi dir="ltr">
// so the digits render in their natural order even inside an RTL
// paragraph — without this, "0 5 4 1 2 3 4 5 6 7" reads right-to-left
// and the agent sees "7 6 5 4 3 2 1 4 5 0".
//
// Matches Israeli mobiles (`054-1234567`, `05X-XXXXXXX`, `+972…`),
// landlines (`02-1234567`), and bare 7+ digit runs that look like
// price/large numbers (`1,250,000`, `2500000`). Leaves single small
// numbers ("3 חד׳", "4.5 מ״ר") alone — those don't need bidi help.
const PHONE_NUMBER_RE = /(\+?972[-\s]?\d[\d\-\s]{6,}|0\d[\d\-\s]{6,}|\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?|\d{7,})/;

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
    // Phone numbers / large numerics — wrap in <bdi dir="ltr"> to
    // force LTR rendering inside RTL paragraphs.
    m = rest.match(PHONE_NUMBER_RE);
    if (m && m.index !== undefined) {
      if (m.index > 0) {
        push(rest.slice(0, m.index));
        i += m.index;
        continue;
      }
      push(
        <bdi key={`${keyPrefix}-n-${idx}`} dir="ltr" style={{ unicodeBidi: 'isolate' }}>{m[0]}</bdi>
      );
      i += m[0].length;
      continue;
    }
    // Plain char — coalesce runs of plain text into one node.
    const stopAt = rest.search(/`|\*\*|\*|\[[^\]]+\]\(https?/);
    const chunkEnd = stopAt === -1 ? rest.length : Math.max(1, stopAt);
    push(rest.slice(0, chunkEnd));
    i += chunkEnd;
  }
  return out;
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

// Line-walker markdown renderer. The previous block-level approach
// (split on \n{2,}, classify each block) failed when the model emitted
// `### heading\n| table |\n|---|---|\n| row |` with no blank line
// between the heading and the table — they landed in the same block,
// `parseTableBlock` looked at lines[1] (the table header instead of
// the separator) and bailed, falling through to plain-paragraph
// rendering. The result was raw `###` and `|...|` text on screen.
//
// New approach: scan lines top-to-bottom, peek ahead for table
// separators / list runs / blockquotes / horizontal rules, and flush
// a paragraph buffer whenever a structured construct begins. Blank
// lines just close the open paragraph.
function renderMarkdown(raw) {
  const lines = String(raw || '').split(/\n/);
  const nodes = [];
  let buf = [];
  let bi = 0;
  const flush = () => {
    if (buf.length === 0) return;
    const key = `p-${bi++}`;
    const plain = buf.slice();
    nodes.push(
      <p key={key} style={{ margin: '4px 0', lineHeight: 1.65 }}>
        {plain.map((l, li) => (
          <span key={`${key}-${li}`}>
            {renderInline(l, `${key}-${li}`)}
            {li < plain.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
    buf = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Blank line — close the open paragraph buffer.
    if (line.trim() === '') { flush(); continue; }

    // Horizontal rule — `---`, `***`, `___` on their own line.
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flush();
      nodes.push(
        <hr key={`hr-${bi++}`} style={{
          border: 0, borderTop: `1px solid rgba(30,26,20,0.12)`, margin: '10px 0',
        }} />
      );
      continue;
    }

    // Heading: ### / ## / #
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      const fontSize = level === 1 ? 17 : level === 2 ? 15 : 14;
      const key = `h-${bi++}`;
      nodes.push(
        <Tag key={key} style={{ fontWeight: 800, fontSize, margin: '10px 0 4px', color: '#1e1a14' }}>
          {renderInline(h[2].trim(), key)}
        </Tag>
      );
      continue;
    }

    // Pipe table — current line is the header, next line must be the
    // GFM separator row (`|---|---|` style). Walk ahead to collect body
    // rows until we hit a non-pipe line.
    if (line.trimStart().startsWith('|') && i + 1 < lines.length) {
      const sep = (lines[i + 1] || '').trim();
      if (/^\|?[\s:\-|]+\|?$/.test(sep) && sep.includes('-')) {
        flush();
        const split = (l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());
        const header = split(line);
        const body = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trimStart().startsWith('|')) {
          const row = split(lines[j]);
          if (row.length === header.length) body.push(row);
          j += 1;
        }
        if (header.length >= 2) {
          nodes.push(renderTable({ header, body }, `t-${bi++}`));
          i = j - 1;
          continue;
        }
      }
    }

    // Blockquote — collect contiguous `> ` lines.
    if (/^\s*>/.test(line)) {
      flush();
      const inner = [];
      let j = i;
      while (j < lines.length && /^\s*>/.test(lines[j])) {
        inner.push(lines[j].replace(/^\s*>\s?/, ''));
        j += 1;
      }
      const key = `q-${bi++}`;
      nodes.push(
        <blockquote key={key} style={{
          margin: '6px 0', padding: '10px 14px',
          background: '#fbf7f0',
          borderInlineStart: '3px solid #b48b4c',
          borderRadius: 8,
          color: '#1e1a14', lineHeight: 1.7,
        }}>
          {inner.map((l, li) => (
            <span key={`${key}-${li}`}>
              {renderInline(l, `${key}-${li}`)}
              {li < inner.length - 1 ? <br /> : null}
            </span>
          ))}
        </blockquote>
      );
      i = j - 1;
      continue;
    }

    // Bullet or numbered list — collect contiguous list lines.
    if (/^(\s*[-*]\s+|\s*\d+[.)]\s+)/.test(line)) {
      flush();
      const items = [];
      let j = i;
      const numbered = /^\s*\d+[.)]/.test(line);
      while (
        j < lines.length &&
        /^(\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[j])
      ) {
        items.push(lines[j].replace(/^(\s*[-*]\s+|\s*\d+[.)]\s+)/, ''));
        j += 1;
      }
      const Tag = numbered ? 'ol' : 'ul';
      const key = `l-${bi++}`;
      nodes.push(
        <Tag key={key} style={{ margin: '4px 0', paddingInlineStart: 22 }}>
          {items.map((txt, li) => (
            <li key={`${key}-${li}`} style={{ margin: '2px 0', lineHeight: 1.6 }}>
              {renderInline(txt, `${key}-${li}`)}
            </li>
          ))}
        </Tag>
      );
      i = j - 1;
      continue;
    }

    // Plain text — accumulate into the paragraph buffer.
    buf.push(line);
  }
  flush();
  return nodes;
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
