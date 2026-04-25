// AiQuotaChips — small Hebrew chips for the per-agent AI quota.
// Surfaces chat (questions/hour) on /ai and voice (minutes/day)
// on /voice-demo. The monthly $30 spend cap is admin-only and the
// backend already strips that block from non-admin responses, so
// this component just renders whatever the API returns.

import { useEffect, useState } from 'react';
import api from '../lib/api';

const DT = {
  cream2: '#efe9df',
  muted: '#6b6356',
  amberBg: 'rgba(180,83,9,0.10)',
  amber: '#b45309',
};

/** kind: 'chat' (default) | 'voice' | 'all' */
export default function AiQuotaChips({ kind = 'chat' }) {
  const [q, setQ] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.aiQuota?.()
      .then((r) => { if (!cancelled) setQ(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!q) return null;

  const chips = [];
  if (kind === 'chat' || kind === 'all') {
    const used = q.chat?.usedCount ?? 0;
    const limit = q.chat?.limitCount ?? 0;
    const warn = q.chat && q.chat.remainingCount / Math.max(1, q.chat.limitCount) < 0.2;
    chips.push(
      <span
        key="chat"
        title="שאלות בשעה האחרונה"
        style={chipStyle(warn)}
      >
        💬 <bdi dir="ltr">{used}/{limit}</bdi> שאלות בשעה
      </span>
    );
  }
  if (kind === 'voice' || kind === 'all') {
    const usedMin = Math.floor((q.voice?.usedSec ?? 0) / 60);
    const limitMin = Math.floor((q.voice?.limitSec ?? 0) / 60);
    const warn = q.voice && q.voice.remainingSec / Math.max(1, q.voice.limitSec) < 0.2;
    chips.push(
      <span
        key="voice"
        title="דקות הקלטה היום"
        style={chipStyle(warn)}
      >
        🎙️ <bdi dir="ltr">{usedMin}/{limitMin}</bdi> דק׳ ביום
      </span>
    );
  }

  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{chips}</div>
  );
}

function chipStyle(warn) {
  return {
    padding: '4px 10px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 700,
    background: warn ? DT.amberBg : DT.cream2,
    color: warn ? DT.amber : DT.muted,
    fontFamily: 'Assistant, Heebo, -apple-system, sans-serif',
  };
}
