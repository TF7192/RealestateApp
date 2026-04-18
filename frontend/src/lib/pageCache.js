// Tiny module-scoped cache for page-level data so that tab switches
// render the previous result INSTANTLY while a background fetch
// refreshes it. Not a replacement for react-query — just a 15-line
// "no empty page flash when I come back to this tab" helper.
//
// Usage in a page:
//
//   const cached = pageCache.get('properties');
//   const [items, setItems]   = useState(cached || []);
//   const [loading, setLoading] = useState(!cached);
//   useEffect(() => {
//     let cancelled = false;
//     api.listProperties().then((res) => {
//       if (cancelled) return;
//       const next = res.items || [];
//       setItems(next);
//       pageCache.set('properties', next);
//       setLoading(false);
//     });
//     return () => { cancelled = true; };
//   }, []);
//
// Entries are kept for the life of the JS context (cleared on full
// reload / logout). Size-bounded via the optional TTL parameter if
// stale data becomes a problem — currently unbounded, the data set
// is small enough not to matter.

const store = new Map();

export const pageCache = {
  get(key) {
    return store.has(key) ? store.get(key) : null;
  },
  set(key, value) {
    store.set(key, value);
  },
  clear(key) {
    if (key) store.delete(key);
    else store.clear();
  },
};

// Auth module calls this on logout so we don't leak one agent's data
// into the next one's session.
export function clearPageCache() {
  store.clear();
}
