// Cookie / analytics consent banner — required by PPL §11 (purpose
// limitation) + Reg. 17 (informing data subjects). Surfaces ONCE per
// device until the user accepts or declines, after which the choice
// is stored in localStorage AND mirrored to the user's row via
// POST /api/me/analytics-consent so it survives across devices.
//
// Until the user opts in, analytics.js's initAnalytics() short-
// circuits and PostHog never loads. Essential cookies (the auth
// session) keep working regardless — they're not analytics.

import { useEffect, useState } from 'react';
import { initAnalytics } from '../lib/analytics';
import api from '../lib/api';

const STORE_KEY = 'estia_analytics_consent';

const DT = {
  ink: '#1e1a14', muted: '#6b6356',
  cream4: '#fbf7f0', white: '#ffffff',
  gold: '#b48b4c', goldLight: '#d9b774',
  border: 'rgba(30,26,20,0.10)',
};

function readStored() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try { localStorage.setItem(STORE_KEY, value ? 'true' : 'false'); } catch { /* private mode */ }
}

export default function CookieBanner() {
  const [decision, setDecision] = useState(() => readStored());

  // If the user hasn't decided AND already has a row, also try the
  // server-side consent state. Lets the banner stay quiet on a second
  // browser if the user already accepted on their first one.
  useEffect(() => {
    if (decision !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMe?.();
        if (cancelled) return;
        const remote = r?.user?.analyticsConsent;
        if (remote === true || remote === false) {
          writeStored(remote);
          setDecision(remote);
          if (remote === true) initAnalytics();
        }
      } catch { /* anonymous visitor — keep banner up */ }
    })();
    return () => { cancelled = true; };
  }, [decision]);

  const accept = async () => {
    writeStored(true);
    setDecision(true);
    initAnalytics();
    try { await api.setAnalyticsConsent?.(true); } catch { /* anon — local-only */ }
  };

  const decline = async () => {
    writeStored(false);
    setDecision(false);
    try { await api.setAnalyticsConsent?.(false); } catch { /* anon — local-only */ }
  };

  if (decision !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="הסכמה לעוגיות"
      style={{
        position: 'fixed',
        bottom: 16,
        insetInlineStart: 16,
        insetInlineEnd: 16,
        zIndex: 9000,
        maxWidth: 560,
        marginInline: 'auto',
        background: DT.cream4,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: '0 14px 40px rgba(30,26,20,0.18)',
        fontFamily: 'Assistant, Heebo, -apple-system, sans-serif',
        color: DT.ink,
      }}
      dir="rtl"
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>שימוש בעוגיות וניתוח שימוש</div>
      <p style={{ margin: '0 0 12px', color: DT.muted, fontSize: 13.5, lineHeight: 1.55 }}>
        אנו משתמשים בעוגיות חיוניות לתפעול האתר (התחברות) וכן באנליטיקת
        שימוש (PostHog) כדי לשפר את המוצר. ניתוח השימוש לא יופעל ללא
        הסכמתכם. תוכלו לשנות את הבחירה בכל עת מתוך{' '}
        <a href="/privacy" style={{ color: DT.gold, fontWeight: 600 }}>מדיניות הפרטיות</a>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={decline}
          style={{
            padding: '8px 14px',
            background: DT.white,
            color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          רק חיוני
        </button>
        <button
          type="button"
          onClick={accept}
          style={{
            padding: '8px 14px',
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            color: DT.ink,
            border: 'none',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
          }}
        >
          אישור הכל
        </button>
      </div>
    </div>
  );
}
