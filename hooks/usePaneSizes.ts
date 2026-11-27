"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PANE_DEFAULTS, dragPane, parsePaneSizes, type PaneSizes } from "@/lib/paneSizes";

const KEY = "crux.coinTerminal.panes";

/** The sizes in this tab, read from this browser's storage once (a private window or blocked storage: the defaults). */
let current: PaneSizes | null = null;
const listeners = new Set<() => void>();
const read = (): PaneSizes => {
  if (current) return current;
  try {
    current = parsePaneSizes(window.localStorage.getItem(KEY));
  } catch {
    current = PANE_DEFAULTS;
  }
  return current;
};
const set = (next: PaneSizes, persist: boolean) => {
  current = next;
  listeners.forEach((l) => l());
  if (!persist) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
};
/** Each pane's size when its drag began (the handlers are rebuilt on every redraw, so it can't live in them). */
const dragStart = { rail: 0, side: 0, bottom: 0 };
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The coin terminal's pane sizes for this trader (kept in this browser only). `drag(kind)` gives a PaneHandle's
 * start/move/end/reset; `areaHeight` reads the chart + trades area so the chart always keeps its minimum height.
 */
export function usePaneSizes(areaHeight: () => number | undefined) {
  const sizes = useSyncExternalStore(subscribe, read, () => PANE_DEFAULTS);

  const drag = useCallback(
    (kind: "rail" | "side" | "bottom") => ({
      onStart: () => {
        dragStart[kind] = read()[kind];
      },
      onMove: (delta: number) => set({ ...read(), [kind]: dragPane(kind, dragStart[kind], delta, areaHeight()) }, false),
      onEnd: () => set(read(), true),
      onReset: () => set({ ...read(), [kind]: PANE_DEFAULTS[kind] }, true),
    }),
    [areaHeight],
  );

  const toggleBottom = useCallback(() => set({ ...read(), bottomHidden: !read().bottomHidden }, true), []);

  return { sizes, drag, toggleBottom };
}
