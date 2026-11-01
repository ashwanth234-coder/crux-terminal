"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `value`, passed on at most once every `ms`: the first change at once (on the next tick), later ones as the latest
 * value when the interval is up. For data that changes faster than it's worth redrawing (a busy pool's trades).
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);
  useEffect(() => {
    if (Object.is(value, shown)) return;
    const timer = setTimeout(
      () => {
        lastAt.current = Date.now();
        setShown(value);
      },
      Math.max(0, lastAt.current + ms - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [value, shown, ms]);
  return shown;
}
