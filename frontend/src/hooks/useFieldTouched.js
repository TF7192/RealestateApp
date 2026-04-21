import { useCallback, useState } from 'react';

// F-5.1 — track which fields the user has interacted with so errors
// only render AFTER blur. Stops the "every required field screams red
// on render" anti-pattern. Pair with existing validation: keep
// computing errors eagerly; just gate the visual state on
// `touched[key] && errors[key]`.
//
// Usage:
//   const { touched, touch, touchAll } = useFieldTouched();
//   <input onBlur={() => touch('email')} />
//   const showErr = touched.email && errors.email;
//   // on submit: touchAll(Object.keys(errors)) to reveal everything.
export function useFieldTouched() {
  const [touched, setTouched] = useState({});
  const touch = useCallback((key) => {
    setTouched((p) => (p[key] ? p : { ...p, [key]: true }));
  }, []);
  const touchAll = useCallback((keys) => {
    setTouched((p) => {
      const next = { ...p };
      for (const k of keys) next[k] = true;
      return next;
    });
  }, []);
  const reset = useCallback(() => setTouched({}), []);
  return { touched, touch, touchAll, reset };
}

export default useFieldTouched;
