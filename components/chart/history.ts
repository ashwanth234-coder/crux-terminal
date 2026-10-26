"use client";

import { useCallback, useState } from "react";

const LIMIT = 100;

/** A value with undo / redo: every `set` is one step back. */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<{ past: T[]; present: T; future: T[] }>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setH((cur) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(cur.present) : next;
      if (Object.is(value, cur.present)) return cur;
      return { past: [...cur.past, cur.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setH((cur) => (cur.past.length === 0 ? cur : { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] }));
  }, []);

  const redo = useCallback(() => {
    setH((cur) => (cur.future.length === 0 ? cur : { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) }));
  }, []);

  return { state: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
