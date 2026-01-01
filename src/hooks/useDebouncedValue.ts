import { useState, useEffect } from "react";

/**
 * Debounce a value by the specified delay
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 100ms)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number = 100): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
