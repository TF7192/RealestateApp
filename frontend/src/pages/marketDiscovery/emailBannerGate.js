// Decides whether the soft email-signup nudge should appear above the
// listing list. Kept in its own file so EmailSignupBanner.jsx exports
// only a component (fast-refresh requirement).

const DISMISS_KEY = 'marketDiscovery.emailBannerDismissedAt';

export function shouldShowEmailBanner(emailPref, matchCount) {
  if (!emailPref) return false;
  if (emailPref.enabled) return false;
  if (!matchCount || matchCount <= 0) return false;
  let ts = 0;
  try { ts = Number(localStorage.getItem(DISMISS_KEY) || 0); }
  catch { ts = 0; }
  if (!ts) return true;
  return (Date.now() - ts) > 30 * 24 * 3600 * 1000;
}

export function rememberEmailBannerDismissal() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); }
  catch { /* ignore */ }
}
