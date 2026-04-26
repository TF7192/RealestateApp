import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Search, Send, MessageCircle, X, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/time';
import { useViewportMobile } from '../hooks/mobile';
import './AdminChats.css';

// SEC-010 — admin gate now reads role off the user object.
const isAdminUser = (u) => !!u && u.role === 'ADMIN';

// Admin inbox — list left, thread right (RTL inverts visually).
// Reuses the same WebSocket so replies appear instantly on the user's
// side without needing to re-fetch.
export default function AdminChats() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('open'); // 'open' | 'all' | 'archived'
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const wsRef = useRef(null);
  const isMobile = useViewportMobile(820);

  // Admin gate — if not admin, kick out.
  useEffect(() => {
    if (authLoading) return;
    if (!isAdminUser(user)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminChatList({ filter, search: search.trim() });
      setItems(res.items || []);
    } finally { setLoading(false); }
  }, [filter, search]);
  useEffect(() => { loadList(); }, [loadList]);

  const openThread = useCallback(async (id) => {
    setSelectedId(id);
    try {
      const res = await api.adminChatGet(id);
      setThread(res.conversation);
      setMessages(res.messages || []);
      await api.adminChatRead(id).catch(() => {});
      setItems((cur) => cur.map((c) => c.id === id ? { ...c, unread: 0 } : c));
    } catch { /* ignore */ }
  }, []);

  // Task 5 — pin to newest message whenever the message list grows or
  // the thread first opens. Without this, the thread renders the
  // oldest message at the top of the visible area and the admin has to
  // manually scroll down to see what they're replying to.
  useEffect(() => {
    if (!listRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, [messages.length, selectedId]);

  // Task 5 — mobile master-detail back. Clearing selectedId returns
  // the layout to the conversations-list view.
  const closeThread = useCallback(() => {
    setSelectedId(null);
    setThread(null);
    setMessages([]);
  }, []);

  // WebSocket — append new messages / update read receipts live
  useEffect(() => {
    let cancelled = false;
    let retry = null;
    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/api/chat/ws`;
      let ws;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'message:new') {
            // If it's the open thread, append; either way update the list.
            // Dedupe by id — the admin's own reply is also appended
            // optimistically by sendReply() when the POST resolves, and
            // the server echoes it back over the same WS.
            if (msg.conversationId === selectedId) {
              setMessages((cur) => (cur.some((m) => m.id === msg.message.id) ? cur : [...cur, msg.message]));
            }
            setItems((cur) => {
              const found = cur.find((c) => c.id === msg.conversationId);
              const isOpen = msg.conversationId === selectedId;
              const delta = msg.message.senderRole === 'user' && !isOpen ? 1 : 0;
              if (!found) {
                // unknown conversation — reload the list on next tick
                loadList();
                return cur;
              }
              const next = cur.map((c) =>
                c.id === msg.conversationId
                  ? {
                      ...c,
                      lastMessage: msg.message,
                      lastMessageAt: msg.message.createdAt,
                      unread: (c.unread || 0) + delta,
                    }
                  : c
              );
              // Keep the "just got a new message" convo at the top
              next.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
              return next;
            });
          } else if (msg.type === 'message:read') {
            if (msg.conversationId === selectedId) {
              setMessages((cur) =>
                cur.map((m) => (m.senderRole === 'admin' && !m.readAt) ? { ...m, readAt: msg.at } : m)
              );
            }
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (cancelled) return;
        retry = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      try { wsRef.current?.close(); } catch { /* ignore */ }
    };
  }, [selectedId, loadList]);

  // Auto-scroll thread on new messages
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const sendReply = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    setDraft('');
    try {
      const { message } = await api.adminChatSend(selectedId, text);
      setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
    } catch { /* ignore */ }
  };

  const archive = async (id) => {
    await api.adminChatArchive(id);
    setItems((cur) => cur.map((c) => c.id === id ? { ...c, status: 'ARCHIVED' } : c));
  };
  const unarchive = async (id) => {
    await api.adminChatUnarchive(id);
    setItems((cur) => cur.map((c) => c.id === id ? { ...c, status: 'OPEN' } : c));
  };

  // Task 5 — mobile master-detail. Show ONE pane at a time:
  //   • no selection → list (full screen)
  //   • selection    → thread (full screen, with back button)
  // Desktop unaffected — both panes render side-by-side.
  const showList   = !isMobile || !selectedId;
  const showThread = !isMobile || !!selectedId;

  return (
    <div className={`ac-page ${selectedId ? 'has-selection' : ''}`}>
      {showList && (
      <aside className="ac-list">
        <header className="ac-list-head">
          <h2><MessageCircle size={18} /> שיחות</h2>
          <div className="ac-filters">
            {[
              { key: 'open', label: 'פעילות' },
              { key: 'all', label: 'הכול' },
              { key: 'archived', label: 'בארכיון' },
            ].map((f) => (
              <button
                key={f.key}
                className={`ac-filter ${filter === f.key ? 'on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ac-search">
            <Search size={14} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש שם/אימייל/טקסט…"
            />
            {search && <button onClick={() => setSearch('')} aria-label="נקה"><X size={14} /></button>}
          </div>
        </header>
        <div className="ac-list-items">
          {loading && items.length === 0 ? (
            <div className="ac-empty">טוען…</div>
          ) : items.length === 0 ? (
            <div className="ac-empty">אין שיחות</div>
          ) : items.map((c) => (
            <button
              key={c.id}
              className={`ac-item ${c.id === selectedId ? 'on' : ''} ${c.unread ? 'has-unread' : ''}`}
              onClick={() => openThread(c.id)}
            >
              <div className="ac-item-avatar">
                {c.user?.avatarUrl
                  ? <img src={c.user.avatarUrl} alt="" />
                  : <span>{(c.user?.displayName || '?').charAt(0)}</span>}
              </div>
              <div className="ac-item-meta">
                <div className="ac-item-row">
                  <strong>{c.user?.displayName || 'משתמש'}</strong>
                  <time>{relativeTime(c.lastMessageAt)}</time>
                </div>
                <div className="ac-item-row">
                  <p>{c.lastMessage?.body || '—'}</p>
                  {c.unread > 0 && <span className="ac-unread-dot" aria-label={`${c.unread} לא נקראו`} />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>
      )}

      {showThread && (
      <main className="ac-thread">
        {!thread ? (
          <div className="ac-thread-empty">
            <MessageCircle size={36} />
            <p>בחר שיחה כדי להתחיל</p>
          </div>
        ) : (
          <>
            <header className="ac-thread-head">
              {/* Task 5 mobile back — clears selection so the list
                  shows again. Desktop hides this via CSS. */}
              <button
                className="ac-thread-back"
                onClick={closeThread}
                aria-label="חזרה לרשימת השיחות"
                type="button"
              >
                <ArrowRight size={18} />
              </button>
              <div className="ac-thread-head-meta">
                <strong>{thread.user?.displayName || 'משתמש'}</strong>
                <span>{thread.user?.email || ''}</span>
              </div>
              <div className="ac-thread-actions">
                {thread.status === 'ARCHIVED' ? (
                  <button className="ac-linkbtn" onClick={() => unarchive(thread.id)}>
                    <ArchiveRestore size={14} /> הוצא מהארכיון
                  </button>
                ) : (
                  <button className="ac-linkbtn" onClick={() => archive(thread.id)}>
                    <Archive size={14} /> העבר לארכיון
                  </button>
                )}
              </div>
            </header>
            <div className="ac-thread-body" ref={listRef}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`ac-msg ${m.senderRole === 'admin' ? 'is-admin' : 'is-user'}`}
                >
                  <div className="ac-msg-bubble">{m.body}</div>
                  <div className="ac-msg-meta">
                    <time>{relativeTime(m.createdAt)}</time>
                    {m.senderRole === 'admin' && m.readAt && <span> · נקרא</span>}
                  </div>
                </div>
              ))}
            </div>
            <form className="ac-compose" onSubmit={sendReply}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="כתוב תשובה…"
                rows={2}
                dir="auto"
                autoCapitalize="sentences"
                enterKeyHint="send"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(e); }
                }}
              />
              <button type="submit" disabled={!draft.trim()} aria-label="שלח">
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </main>
      )}
    </div>
  );
}
