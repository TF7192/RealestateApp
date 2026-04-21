import { useEffect } from 'react';

// F-5.5 — prompt the browser's native "leave site?" dialog when a
// dirty form is about to be discarded via tab close / refresh / back
// across the origin. Works only for hard navigations — SPA route
// changes don't fire beforeunload. For SPA guarding, pair this with
// react-router's `useBlocker` (data router) or a custom prompt on
// <Link> clicks. We don't currently use the data router, so only the
// browser-level guard is applied.
//
// Modern browsers ignore custom messages and show their own prompt;
// we only need returnValue to be set to a truthy string.
export function useBeforeUnload(isDirty, message = 'יש שינויים שלא נשמרו') {
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);
}

export default useBeforeUnload;
