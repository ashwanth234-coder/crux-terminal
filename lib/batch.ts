"use client";

import { useSyncExternalStore } from "react";

/** Length of one uniform-price batch window. */
export const BATCH_SECONDS = 60;
// Batch numbering starts here so the counter reads as a running sequence.
const EPOCH = Date.UTC(2026, 0, 1) / 1000;

export type BatchClock = {
  /** Sequence number of the batch currently collecting intents. */
  batch: number;
  /** Seconds until it clears (60 → 1). */
  left: number;
  /** 0 → 1 progress through the window. */
  progress: number;
  /** Unix seconds at this tick, for countdowns that keep time with the batch. */
  now: number;
};

function read(): BatchClock {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - EPOCH;
  const into = elapsed % BATCH_SECONDS;
  return { batch: Math.floor(elapsed / BATCH_SECONDS), left: BATCH_SECONDS - into, progress: into / BATCH_SECONDS, now };
}

// One shared 1s ticker for every subscriber on the page.
let snapshot: BatchClock = read();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    snapshot = read();
    timer = setInterval(() => {
      snapshot = read();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Wall-clock synced batch window. Null during SSR and hydration. */
export function useBatchClock(): BatchClock | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}
