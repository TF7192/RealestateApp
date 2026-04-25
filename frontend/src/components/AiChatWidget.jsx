// AiChatWidget — floating popup version of /ai. Sits next to the
// developer ChatWidget in the topbar pair, dispatched via the global
// `estia:open-ai-chat` event so the topbar button stays a single
// onClick line. Uses the same `estia-ai-chat-v1` localStorage key as
// the /ai page, so a conversation started in the popup shows up on
// the full page (and vice-versa) on the next mount.
//
// Inline DT palette to match the rest of the app's chat surfaces;
// no new CSS file (one less moving part for this drop-in).

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, Send, X, Loader2, AlertCircle, Bot, User } from 'lucide-react';
import Portal from './Portal';
import useFocusTrap from '../hooks/useFocusTrap';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const PERSIST_KEY = 'estia-ai-chat-v1';
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
    // PERF-012 — same hygiene as Ai.jsx: drop empty streaming
    // placeholders and the transient marker so reload doesn't bring
    // back ghosts.
    const cleaned = messages
      .filter((m) => !(m.__streaming && !m.content))
      .map(({ __streaming, ...rest }) => rest); // eslint-disable-line no-unused-vars
    const trimmed = cleaned.slice(-PERSIST_TURNS * 2);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(trimmed));
  } catch { /* quota errors etc. */ }
}

export default function AiChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Toggle-on-event. When opening, dispatch `estia:close-chat` so the
  // developer ChatWidget closes itself — the two share a fixed-position
  // panel anchor (bottom-left in RTL) so showing both simultaneously
  // would overlap perfectly. Mutually-exclusive is the right UX.
  useEffect(() => {
    const onOpen = () => {
      setOpen((o) => {
        const next = !o;
        if (next) window.dispatchEvent(new Event('estia:close-chat'));
        return next;
      });
    };
    const onForceClose = () => setOpen(false);
    window.addEventListener('estia:open-ai-chat', onOpen);
    window.addEventListener('estia:close-ai-chat', onForceClose);
    return () => {
      window.removeEventListener('estia:open-ai-chat', onOpen);
      window.removeEventListener('estia:close-ai-chat', onForceClose);
    };
  }, []);

  // Auto-close when the user navigates to /ai — the full-page chat
  // makes the popup redundant and showing both simultaneously is
  // confusing (especially because they share localStorage and would
  // appear to mirror each other).
  useEffect(() => {
    if (location.pathname.startsWith('/ai')) setOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  return open ? <AiChatPanel onClose={() => setOpen(false)} /> : null;
}

function AiChatPanel({ onClose }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  // Mirror the /ai page's state shape so transcripts roundtrip cleanly.
  const [messages, setMessages] = useState(() => loadPersistedMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => { persistMessages(messages); }, [messages]);

  // PERF-012 — keep a handle to the in-flight SSE so the panel can
  // abort it if the user closes the widget mid-stream.
  const streamRef = useRef(null);

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
            out[out.length - 1] = { role: 'assistant', content: last.content || 'אין תשובה.' };
          }
          return out;
        });
        setLoading(false);
      },
      onError: (message, code) => {
        if (code === 'ai_not_configured') setErr('שירות ה-AI לא מוגדר בסביבה הזו');
        else setErr(message || 'שליחת ההודעה נכשלה');
        setMessages((prev) => {
          const out = prev.slice();
          if (out.length && out[out.length - 1].__streaming && !gotAnyText) {
            out.pop();
            out.pop();
          } else if (out.length && out[out.length - 1].__streaming) {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const empty = messages.length === 0 && !loading;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="צ׳אט עם Estia AI"
        dir="rtl"
        style={{
          // Match the developer ChatWidget's panel anchor exactly so
          // the two surfaces share the same screen real estate. The
          // mutual-exclusivity logic in the parent ensures only one
          // shows at a time. Mobile (≤640) gets a near-full-bleed
          // panel like the dev chat does.
          position: 'fixed',
          bottom: 'calc(78px + env(safe-area-inset-bottom))',
          insetInlineEnd: 18,
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          height: 520,
          maxHeight: 'calc(100dvh - 120px)',
          zIndex: 950,
          display: 'flex', flexDirection: 'column',
          background: DT.white,
          borderRadius: 16,
          border: `1px solid ${DT.border}`,
          boxShadow: '0 18px 48px rgba(30,26,20,0.20)',
          overflow: 'hidden',
          ...FONT,
        }}
        ref={panelRef}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px',
          background: `linear-gradient(180deg, ${DT.cream} 0%, ${DT.cream4} 100%)`,
          borderBottom: `1px solid ${DT.border}`,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
            display: 'grid', placeItems: 'center', color: DT.ink,
            boxShadow: '0 4px 12px rgba(180,139,76,0.25)',
          }}>
            <Sparkles size={15} aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: DT.ink, lineHeight: 1.2 }}>Estia AI</div>
            <div style={{ fontSize: 11, color: DT.muted, marginTop: 1 }}>עוזר מקצועי לסוכני נדל"ן</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'grid', placeItems: 'center', color: DT.muted,
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div
          ref={listRef}
          style={{
            flex: 1, overflowY: 'auto',
            padding: 14,
            display: 'flex', flexDirection: 'column', gap: 10,
            background: DT.cream4,
          }}
        >
          {empty ? (
            <EmptyState onPick={(p) => handleSend(p)} />
          ) : (
            <>
              {messages.map((m, i) => (
                // PERF-012 — see Ai.jsx; same render contract.
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

        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{
            padding: 10,
            background: DT.white,
            borderTop: `1px solid ${DT.border}`,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 12,
            padding: '4px 4px 4px 12px',
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל/י כל דבר…"
              rows={1}
              style={{
                ...FONT,
                flex: 1, resize: 'none',
                padding: '6px 2px',
                border: 'none', background: 'transparent', color: DT.ink,
                fontSize: 14, lineHeight: 1.55, outline: 'none',
                textAlign: 'right', maxHeight: 120, minHeight: 32,
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="שלח"
              style={(loading || !input.trim()) ? disabledBtn() : primaryBtn()}
            >
              {loading ? <Loader2 size={14} className="estia-spin" /> : <Send size={14} />}
            </button>
          </div>
          {err && (
            <div style={{
              marginTop: 8,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.2)',
              color: DT.danger, fontSize: 12,
            }}>
              <AlertCircle size={12} /> {err}
            </div>
          )}
        </form>

        <style>{`
          .estia-spin { animation: estia-spin 0.9s linear infinite; }
          @keyframes estia-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </Portal>
  );
}

// ── Markdown subset renderer (mirrors Ai.jsx). Kept here so the widget
//    is self-contained — duplication is a few hundred lines of pure
//    formatting code, not load-bearing logic. If we ever drift, the
//    /ai page is the source of truth.

function renderInline(text, keyPrefix) {
  const out = [];
  let i = 0;
  let idx = 0;
  const push = (node) => { out.push(node); idx += 1; };
  while (i < text.length) {
    const rest = text.slice(i);
    let m = rest.match(/^`([^`]+)`/);
    if (m) { push(<code key={`${keyPrefix}-c-${idx}`} style={{ background: '#efe9df', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em' }}>{m[1]}</code>); i += m[0].length; continue; }
    m = rest.match(/^\*\*([^*]+)\*\*/);
    if (m) { push(<strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 800 }}>{renderInline(m[1], `${keyPrefix}-b-${idx}`)}</strong>); i += m[0].length; continue; }
    m = rest.match(/^\*(\S[^*]*)\*/);
    if (m) { push(<em key={`${keyPrefix}-i-${idx}`}>{renderInline(m[1], `${keyPrefix}-i-${idx}`)}</em>); i += m[0].length; continue; }
    m = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (m) { push(<a key={`${keyPrefix}-l-${idx}`} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#b48b4c', textDecoration: 'underline' }}>{m[1]}</a>); i += m[0].length; continue; }
    const stopAt = rest.search(/`|\*\*|\*|\[[^\]]+\]\(https?/);
    const chunkEnd = stopAt === -1 ? rest.length : Math.max(1, stopAt);
    push(rest.slice(0, chunkEnd));
    i += chunkEnd;
  }
  return out;
}

function renderTable(table, key) {
  return (
    <div key={key} style={{ overflowX: 'auto', margin: '4px 0' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 12,
        background: '#ffffff', border: '1px solid rgba(30,26,20,0.08)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        <thead>
          <tr>
            {table.header.map((h, hi) => (
              <th key={hi} style={{
                padding: '6px 8px',
                background: 'rgba(180,139,76,0.12)',
                color: '#1e1a14', fontWeight: 800,
                fontSize: 11,
                textAlign: 'right',
                borderBottom: '1px solid rgba(30,26,20,0.08)',
              }}>{renderInline(h, `${key}-h-${hi}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.body.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#ffffff' : '#fbf7f0' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '5px 8px',
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

// Line-walker markdown renderer — same logic as Ai.jsx, smaller
// font/padding tuned for the floating widget. See the long comment
// in Ai.jsx renderMarkdown for the rationale on why this replaced
// the block-level approach.
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
      <p key={key} style={{ margin: '3px 0', lineHeight: 1.6, fontSize: 13 }}>
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
    if (line.trim() === '') { flush(); continue; }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flush();
      nodes.push(
        <hr key={`hr-${bi++}`} style={{
          border: 0, borderTop: `1px solid rgba(30,26,20,0.12)`, margin: '8px 0',
        }} />
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      const fontSize = level === 1 ? 15 : level === 2 ? 14 : 13;
      const key = `h-${bi++}`;
      nodes.push(
        <Tag key={key} style={{ fontWeight: 800, fontSize, margin: '8px 0 3px', color: '#1e1a14' }}>
          {renderInline(h[2].trim(), key)}
        </Tag>
      );
      continue;
    }

    // Pipe table
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

    // Blockquote
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
          margin: '4px 0', padding: '8px 12px',
          background: '#fbf7f0',
          borderInlineStart: '3px solid #b48b4c',
          borderRadius: 6,
          color: '#1e1a14', lineHeight: 1.6, fontSize: 13,
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

    // Bullet / numbered list
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
        <Tag key={key} style={{ margin: '3px 0', paddingInlineStart: 20 }}>
          {items.map((txt, li) => (
            <li key={`${key}-${li}`} style={{ margin: '1px 0', lineHeight: 1.55, fontSize: 13 }}>
              {renderInline(txt, `${key}-${li}`)}
            </li>
          ))}
        </Tag>
      );
      i = j - 1;
      continue;
    }

    buf.push(line);
  }
  flush();
  return nodes;
}

function Bubble({ role, content, loading }) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex', gap: 8,
      justifyContent: isUser ? 'flex-start' : 'flex-end',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={avatar(DT.goldSoft, DT.goldDark)}>
          <Bot size={12} aria-hidden="true" />
        </div>
      )}
      <div style={{
        maxWidth: '82%',
        padding: '8px 12px', borderRadius: 11,
        background: isUser ? DT.cream2 : DT.white,
        border: `1px solid ${DT.border}`,
        color: DT.ink,
        fontSize: 13, lineHeight: 1.6,
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
      }}>
        {loading ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, color: DT.muted, fontSize: 12,
          }}>
            <Loader2 size={12} className="estia-spin" /> חושב…
          </span>
        ) : isUser ? content : renderMarkdown(content)}
      </div>
      {isUser && (
        <div style={avatar(DT.cream2, DT.ink)}>
          <User size={12} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick }) {
  // A few starter prompts — abridged from /ai because the panel is
  // narrower; keep the brokerage-flavor though.
  const starters = [
    'תכתוב תזכורת לליד שמחפש דירת 4 חדרים בראשון לציון',
    'איזה ליד לא קיבל מענה בשבוע האחרון?',
    'סכם את העסקאות שנסגרו החודש',
  ];
  return (
    <div style={{
      margin: 'auto', textAlign: 'center', padding: 8,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <Sparkles size={26} style={{ color: DT.goldDark }} aria-hidden="true" />
      <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: DT.ink }}>
        איך אפשר לעזור?
      </h2>
      <p style={{ fontSize: 12, color: DT.muted, lineHeight: 1.6, margin: 0 }}>
        שאל/י על ניסוח הודעות, סטטוס לידים, או כל דבר אחר.
      </p>
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        marginTop: 4,
      }}>
        {starters.map((p, i) => (
          <button
            key={`s-${i}`}
            type="button"
            onClick={() => onPick(p)}
            style={{
              ...FONT,
              padding: '6px 10px', borderRadius: 99,
              border: `1px solid ${DT.border}`,
              background: DT.white, color: DT.ink,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
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
    width: 24, height: 24, borderRadius: 99,
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
    width: 32, height: 32, borderRadius: 9, cursor: 'pointer',
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
