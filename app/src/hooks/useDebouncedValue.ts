import { useEffect, useState } from "react";

/** Returns the value after it has remained unchanged for the given delay. */
export function useDebouncedValue<T>(value: T, delayMs = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(() => value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(() => value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
