import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import Portal from './Portal';
import { useChat } from '../hooks/chat';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import { relativeTime } from '../lib/time';
import './ChatWidget.css';

// Admin allowlist is mirrored on the client so the admin user sees the
// regular widget hidden (they use /admin/chats instead).
const ADMIN_EMAILS = new Set([
  'talfuks1234@gmail.com',
]);

export default function ChatWidget() {
  const { user } = useAuth();
  const isMobile = useViewportMobile(820);
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
  useEffect(() => {
    const onOpen = () => setOpen((o) => !o);
    window.addEventListener('estia:open-chat', onOpen);
    return () => window.removeEventListener('estia:open-chat', onOpen);
  }, []);

  // Hide for logged-out users and admins (admins use /admin/chats).
  // Placed AFTER hooks so rules-of-hooks holds.
  if (!user) return null;
  if (ADMIN_EMAILS.has((user.email || '').toLowerCase())) return null;

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
      {!isMobile && (
        <button
          className={`chatw-btn ${unread > 0 ? 'has-dot' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'סגור צ׳אט' : 'פתח צ׳אט'}
          aria-expanded={open}
        >
          <MessageCircle size={20} />
          {unread > 0 && <span className="chatw-dot" aria-hidden />}
        </button>
      )}

      {open && (
        <Portal>
          <div className="chatw-panel-wrap" role="dialog" aria-label="צ׳אט עם המפתחים">
            <div className="chatw-panel">
              <header className="chatw-head">
                <div>
                  <strong>שיחה עם המפתחים</strong>
                  <span>זמין רוב הזמן — נחזור אליך במהירות</span>
                </div>
                <button className="chatw-close" onClick={() => setOpen(false)} aria-label="סגור">
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
      )}
    </>
  );
}
