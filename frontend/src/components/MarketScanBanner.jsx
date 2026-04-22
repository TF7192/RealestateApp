import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../lib/toast';
import haptics from '../lib/haptics';

// Global completion-toast listener for nadlan.gov.il market-data scans.
//
// Parallels Yad2ScanBanner's toast behavior — when a background scan
// finishes while the agent is on a page that isn't the property's own
// detail page, they get a single success/error toast so they know the
// data is ready. The in-card running strip (MarketContextCard) covers
// the "still on this property" case; this file covers the rest.
//
// We don't render a persistent banner the way the Yad2 one does because
// the scan is much shorter (typically 15–45s) and it's scoped to one
// property — a floating "go back to X" CTA felt like noise in early
// testing. One toast at the end is enough.

let lastToastedAt = 0;

export default function MarketScanBanner() {
  const toast = useToast();
  const location = useLocation();

  useEffect(() => {
    const handler = (e) => {
      const { ok, error, propertyId } = e.detail || {};
      // Suppress if the agent is staring right at this property's page.
      // The in-card strip + per-kind data update already tell the story.
      if (location.pathname.startsWith(`/properties/${propertyId}`)) return;
      // Dedupe across remounts — the toast provider recreates its api
      // object on render so this effect can re-subscribe multiple times.
      const now = Date.now();
      if (now - lastToastedAt < 1000) return;
      lastToastedAt = now;
      try { haptics.success?.(); } catch { /* ignore */ }
      if (ok) toast.success?.('נתוני השוק התעדכנו');
      else    toast.error?.(`שליפת נתוני השוק נכשלה${error ? `: ${error}` : ''}`);
    };
    window.addEventListener('market-scan-complete', handler);
    return () => window.removeEventListener('market-scan-complete', handler);
  }, [location.pathname, toast]);

  return null;
}
