import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

// MLS G1 · Shared neighborhood-suggestions hook.
//
// Both AddressField (single-select) and NeighborhoodPicker (multi-select
// chips) need the same "debounce → fetch /api/neighborhoods → cancel stale"
// logic. Extracting it here keeps the two components skinny and makes
// the async behavior independently testable.
//
// Inputs:
//   city   string — required. Empty string/null skips the fetch entirely.
//   query  string — the partial neighborhood name. Shorter than 1 char →
//                    empty items, no fetch. We deliberately go low so the
//                    list starts suggesting from the first Hebrew letter
//                    (unlike the address field which needs 2 for Photon).
//   opts.delayMs  number, default 200. Matches AddressField's original.
//
// Returns: { items, loading, error }.
//   items   — the server's list verbatim ({id, city, name, aliases[]})
//   loading — true while a request is in flight
//   error   — null | Hebrew error string from the API envelope
export function useNeighborhoodSuggestions(city, query, opts = {}) {
  const { delayMs = 200 } = opts;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Incrementing request-id guards against out-of-order fetches. The
  // same pattern AddressField already uses — see its geoSearch effect.
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const q = (query || '').trim();
    const c = (city || '').trim();

    // Nothing to fetch — reset visible state cleanly so a previous
    // result doesn't stick around when the agent clears the city.
    if (!c || q.length < 1) {
      setItems([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const t = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.listNeighborhoods({ city: c, search: q });
        if (!mountedRef.current || id !== reqIdRef.current) return;
        setItems(res?.items || []);
      } catch (e) {
        if (!mountedRef.current || id !== reqIdRef.current) return;
        setError(e?.message || 'טעינת שכונות נכשלה');
        setItems([]);
      } finally {
        if (mountedRef.current && id === reqIdRef.current) setLoading(false);
      }
    }, delayMs);

    return () => clearTimeout(t);
  }, [city, query, delayMs]);

  return { items, loading, error };
}

export default useNeighborhoodSuggestions;
