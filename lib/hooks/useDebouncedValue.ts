// lib/hooks/useDebouncedValue.ts
import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` have passed
 * without `value` changing again.
 *
 * Intended for free-text filter inputs that feed a network request (e.g. a
 * TanStack Query key): bind the input itself to the raw, un-debounced state
 * so typing feels instant, and derive the query key from this debounced
 * value instead, so a request only fires once the user pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}
