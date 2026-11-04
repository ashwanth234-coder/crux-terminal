import { useSyncExternalStore } from "react";
import type { Address } from "viem";

/**
 * Trades this browser has just sent: on the chart the moment Buy or Sell is pressed, as a solid candle from the price
 * now to the pool's price just after it (worked out from the pool as it stands), and at the top of the swaps list marked
 * Confirming. It stays until the solver's own trade is on the chart (pushed the moment it's sent), whatever the order
 * status says first; a failed or refunded trade takes it away at once.
 */
export type PendingTrade = {
  id: number;
  token: Address;
  side: "buy" | "sell";
  label: string;
  /** The price when it was sent. */
  price: number;
  /** The pool's price just after the trade (where the real candle will close), if known. */
  expected?: number;
  /** Its size, as far as known when it's sent: USDC (dollars) and whole tokens. */
  usdc?: number;
  tokens?: number;
  at: number;
};

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

/** Takes a pending trade away: the chart calls it the moment the real trade is on it, so the two never overlap or gap. */
export function dropPendingTrade(id: number) {
  if (!items.some((i) => i.id === id)) return;
  items = items.filter((i) => i.id !== id);
  emit();
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
