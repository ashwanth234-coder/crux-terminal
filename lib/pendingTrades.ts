import { useSyncExternalStore } from "react";
import type { Address } from "viem";

/**
 * Trades this browser has sent that haven't filled yet: shown on the chart the moment Buy or Sell is pressed, as a
 * dashed line at the price it was placed at ("Buying $10…"), until it fills, fails or is refunded. Never a candle: a
 * candle is a trade that happened, and this one hasn't yet.
 */
export type PendingTrade = { id: number; token: Address; side: "buy" | "sell"; label: string; price: number; at: number };

/** A pending trade that hasn't resolved by now is dropped from the chart (its order status says what happened). */
const MAX_AGE_MS = 60_000;

let items: PendingTrade[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a trade as pending; returns the function that clears it. */
export function addPendingTrade(t: Omit<PendingTrade, "id" | "at">): () => void {
  const id = nextId++;
  items = [...items, { ...t, id, at: Date.now() }];
  emit();
  const clear = () => {
    if (!items.some((i) => i.id === id)) return;
    items = items.filter((i) => i.id !== id);
    emit();
  };
  setTimeout(clear, MAX_AGE_MS);
  return clear;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => items;
const empty: PendingTrade[] = [];

/** This browser's pending trades on `token`. */
export function usePendingTrades(token: Address): PendingTrade[] {
  const all = useSyncExternalStore(subscribe, snapshot, () => empty);
  return all.filter((t) => t.token.toLowerCase() === token.toLowerCase());
}
