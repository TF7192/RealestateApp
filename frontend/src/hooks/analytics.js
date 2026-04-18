import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { page } from '../lib/analytics';

/**
 * Fires a PostHog $pageview whenever the React Router location changes.
 * Mount once at the top of the tree (inside <BrowserRouter>).
 */
export function usePageviewTracking() {
  const location = useLocation();
  useEffect(() => {
    page(location.pathname + location.search);
  }, [location.pathname, location.search]);
}
