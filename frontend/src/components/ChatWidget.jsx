import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import Portal from './Portal';
import { useChat } from '../hooks/chat';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/time';
import useFocusTrap from '../hooks/useFocusTrap';
import './ChatWidget.css';

// SEC-010 — admin uses /admin/chats, so the regular widget is hidden
// for them. Reads role off the publicUser; the legacy email allowlist
// is gone.
const isAdminUser = (u) => !!u && u.role === 'ADMIN';

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { messages, loading, unread, send, markRead } = useChat({ autoLoad: !!user });
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [messages.length, open]);

  // Mark admin messages read when opening the panel
  useEffect(() => {
    if (open && unread > 0) markRead();
  }, [open, unread, markRead]);

  // Task 1 · the mobile header's chat button dispatches this event since
  // the standalone .chatw-btn is hidden on mobile (it used to overlap
  // the profile pill in the header).
  // 2026-04-25 — also listens to `estia:close-chat` from the AI chat
  // widget so opening AI chat auto-closes this one (they share a
  // fixed-position panel anchor; only one should ever be visible).
  useEffect(() => {
    const onOpen = () => {
      setOpen((o) => {
        const next = !o;
        if (next) window.dispatchEvent(new Event('estia:close-ai-chat'));
        return next;
      });
    };
    const onForceClose = () => setOpen(false);
    window.addEventListener('estia:open-chat', onOpen);
    window.addEventListener('estia:close-chat', onForceClose);
    return () => {
      window.removeEventListener('estia:open-chat', onOpen);
      window.removeEventListener('estia:close-chat', onForceClose);
    };
  }, []);

  // Hide for logged-out users and admins (admins use /admin/chats).
  // Placed AFTER hooks so rules-of-hooks holds.
  if (!user) return null;
  if (isAdminUser(user)) return null;

  const onSubmit = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try { await send(text); } catch { /* ignore */ }
  };

  return (
    <>
      {/* Standalone floating chat button — DESKTOP ONLY. On mobile the
          launcher lives inside the header trailing slot (Layout.jsx
          `.mh-chat-btn`). Returning null instead of relying on a CSS
          display:none keeps stale CSS bundles from accidentally
          surfacing the old position — there's literally no DOM node
          to render. */}
      {/* Floating launcher removed — the topbar chat button is the
          single entry point across desktop and mobile. ChatWidget
          still mounts (just headless) so it keeps listening for the
          `estia:open-chat` event and renders the panel. */}

      {open && (
        <ChatPanel
          onClose={() => setOpen(false)}
          messages={messages}
          loading={loading}
          listRef={listRef}
          draft={draft}
          setDraft={setDraft}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
}

// Separate component so useFocusTrap's effect fires on open (it runs once
// on mount when ref.current is already attached) and cleanup restores
// focus to the launcher on close.
function ChatPanel({ onClose, messages, loading, listRef, draft, setDraft, onSubmit }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });
  return (
    <Portal>
      <div className="chatw-panel-wrap" role="dialog" aria-modal="true" aria-label="צ׳אט עם המפתחים">
        <div ref={panelRef} className="chatw-panel">
          <header className="chatw-head">
            <div>
              <strong>שיחה עם המפתחים</strong>
              <span>זמין רוב הזמן — נחזור אליך במהירות</span>
            </div>
            <button className="chatw-close" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </header>

          {messages.length === 0 && !loading && (
            <div className="chatw-welcome">
              <p>
                יש לכם שאלה? דברו ישירות עם המפתחים של הפלטפורמה.
                השאירו הודעה ונחזור אליכם.
              </p>
            </div>
          )}

          <div className="chatw-list" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chatw-msg ${m.senderRole === 'admin' ? 'is-admin' : 'is-me'}`}
              >
                <div className="chatw-bubble">{m.body}</div>
                <div className="chatw-meta">
                  <time>{relativeTime(m.createdAt)}</time>
                  {m.senderRole === 'user' && m.readAt && <span> · נקרא</span>}
                </div>
              </div>
            ))}
          </div>

          <form className="chatw-compose" onSubmit={onSubmit}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="כתבו הודעה…"
              rows={2}
              dir="auto"
              autoCapitalize="sentences"
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
              }}
            />
            <button type="submit" disabled={!draft.trim()} aria-label="שלח">
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </Portal>
  );
}
