// Per-asset premium landing page. Lives at /l/:agentSlug/:propertySlug.
// Public, no auth — prospects land here from agent-shared links.
//
// As of Phase 1 of the landing-editor feature (2026-05-11), this file
// is a thin shell: it fetches the property + agent + (optional) saved
// landing config and hands off to `LandingRenderer`, which drives the
// page from data. When `landingPageConfig` is null, the renderer
// falls back to `defaultLandingConfig()` and produces the pre-editor
// layout byte-identically.
//
// The view-tracker, error states, and loading skeleton stay here at
// the page level so the renderer can be reused inside the editor's
// live preview without sending duplicate "viewed" pings.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import LandingRenderer from './propertyLanding/LandingRenderer';
import './PropertyLandingPage.css';

export default function PropertyLandingPage() {
  const { agentSlug, propertySlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.publicProperty(agentSlug, propertySlug);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'טעינת הנכס נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentSlug, propertySlug]);

  // Sprint 9 — landing-page view tracker. Fire-and-forget POST on mount,
  // de-duped via sessionStorage so a SPA re-render or the agent mashing
  // refresh doesn't spam the endpoint. Errors are swallowed — tracking
  // must never break the landing page render.
  useEffect(() => {
    if (!agentSlug || !propertySlug) return;
    try {
      const key = `estia-viewed-${agentSlug}-${propertySlug}`;
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
      api.trackPublicPropertyView(agentSlug, propertySlug).catch(() => {});
    } catch {
      // sessionStorage can throw in privacy-mode Safari or SSR; never
      // let that break the page.
      try { api.trackPublicPropertyView(agentSlug, propertySlug).catch(() => {}); }
      catch { /* swallow */ }
    }
  }, [agentSlug, propertySlug]);

  if (loading) {
    return (
      <div className="lp-page lp-state">
        <div className="lp-skel" />
      </div>
    );
  }
  if (error || !data?.property) {
    return (
      <div className="lp-page lp-state">
        <div className="lp-empty">
          <h1>הנכס לא נמצא</h1>
          <p>הקישור אולי פג או שהנכס הוסר מהשוק. אפשר לפנות לסוכן ישירות.</p>
        </div>
      </div>
    );
  }

  // Phase 2 adds `landingPageConfig` to the public serializer payload.
  // Until then `data.landingPageConfig` is `undefined`, the renderer
  // sees `config={null}`, and falls back to the default layout.
  return (
    <LandingRenderer
      config={data.landingPageConfig || null}
      property={data.property}
      agent={data.agent}
    />
  );
}
