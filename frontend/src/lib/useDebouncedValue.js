import { useEffect, useState } from 'react';

// F-3.4 — unified debounce hook. Replaces the three ad-hoc
// setTimeout patterns across AdminUsers / AddressField / SmartFields.
// 300ms is the sweet spot for Hebrew search inputs (feels instant but
// batches typing); 200ms for autocompletes; 150ms for sliders.
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default useDebouncedValue;
