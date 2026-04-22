import { useEffect, useState, useCallback } from 'react';

// Persist the user's cards-vs-table preference per list page.
// One key per page ("properties", "customers", "owners") so each list
// remembers its own choice independently. localStorage only; no server
// sync — this is a pure UI preference.

const STORAGE_PREFIX = 'estia-view-mode:';

export function useViewMode(pageKey, defaultMode = 'cards') {
  const key = `${STORAGE_PREFIX}${pageKey}`;
  const read = () => {
    try {
      const v = window.localStorage.getItem(key);
      return v === 'cards' || v === 'table' ? v : defaultMode;
    } catch {
      return defaultMode;
    }
  };
  const [mode, setMode] = useState(read);

  const set = useCallback((next) => {
    setMode(next);
    try { window.localStorage.setItem(key, next); } catch { /* ignore */ }
  }, [key]);

  // Sync across tabs — if another tab flips the toggle, reflect it here.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key && (e.newValue === 'cards' || e.newValue === 'table')) {
        setMode(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [mode, set];
}
