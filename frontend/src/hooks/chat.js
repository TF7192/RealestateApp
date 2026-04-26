import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../lib/api';

/**
 * useChat({ autoLoad }) — fetches the current user's conversation,
 * subscribes to the WebSocket, exposes send/markRead and the unread count.
 */
export function useChat({ autoLoad = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(autoLoad);
  const [unread, setUnread] = useState(0);
  const wsRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.chatMe();
      setConversation(res.conversation);
      setMessages(res.messages || []);
      setUnread(res.unread || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoLoad) load(); }, [autoLoad, load]);

  // WebSocket for live updates. Same-origin, cookie-auth, reconnect on close.
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
          if (msg.type === 'message:new' && msg.conversationId === conversation?.id) {
            // Dedupe by id — the message is also appended optimistically
            // by send() when the POST resolves, and the server echoes it
            // back over the same WS. Without this guard the user sees
            // their message rendered twice.
            setMessages((cur) => (cur.some((m) => m.id === msg.message.id) ? cur : [...cur, msg.message]));
            if (msg.message.senderRole === 'admin') setUnread((u) => u + 1);
          } else if (msg.type === 'message:read' && msg.conversationId === conversation?.id) {
            // Admin read our messages — repaint "נקרא" hints
            setMessages((cur) =>
              cur.map((m) =>
                (m.senderRole === 'user' && !m.readAt) ? { ...m, readAt: msg.at } : m
              )
            );
          }
        } catch { /* swallow */ }
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
  }, [conversation?.id]);

  const send = useCallback(async (body) => {
    const text = String(body || '').trim();
    if (!text) return;
    const { message } = await api.chatSend(text);
    // Dedupe by id — the WS broadcast may arrive before the POST resolves,
    // so the same message can already be in state. See ws.onmessage above.
    setMessages((cur) => (cur.some((m) => m.id === message.id) ? cur : [...cur, message]));
  }, []);

  const markRead = useCallback(async () => {
    if (unread === 0) return;
    try { await api.chatMarkRead(); } catch { /* ignore */ }
    setUnread(0);
  }, [unread]);

  return { conversation, messages, loading, unread, send, markRead, reload: load };
}
