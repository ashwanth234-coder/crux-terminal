import { useSyncExternalStore } from "react";
import type { Address } from "viem";

/**
 * Trades this browser has just sent: on the chart the moment Buy or Sell is pressed, as a solid candle from the price
 * now to the price it will print (its swap's average price on the pool as it stands), and at the top of the swaps list marked
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
  /** The price the trade will print on the chart (its swap's average price on the pool), if known. */
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

/** Shows a trade as pending; returns the function that clears it (its `id` for updatePendingTrade). */
export function addPendingTrade(t: Omit<PendingTrade, "id" | "at">): (() => void) & { id: number } {
  const id = nextId++;
  items = [...items, { ...t, id, at: Date.now() }];
  emit();
  const clear = () => {
    if (!items.some((i) => i.id === id)) return;
    items = items.filter((i) => i.id !== id);
    emit();
  };
  setTimeout(clear, MAX_AGE_MS);
  return Object.assign(clear, { id });
}

/**
 * Fills in what a pending trade wasn't known yet when it was shown (its expected price and size, once quoted): it goes
 * on the chart at the click, then takes its right height a moment later, the same candle and badge throughout.
 */
export function updatePendingTrade(id: number, patch: Partial<Pick<PendingTrade, "expected" | "usdc" | "tokens" | "label">>) {
  if (!items.some((i) => i.id === id)) return;
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
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

/**
 * Calls `listener` with this browser's pending trades on `token` the moment they change, outside React (in the same
 * task as the click that added one), so the chart can draw it without waiting for a render. Returns the unsubscribe.
 */
export function watchPendingTrades(token: Address, listener: (trades: PendingTrade[]) => void): () => void {
  const l = () => listener(items.filter((t) => t.token.toLowerCase() === token.toLowerCase()));
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** This browser's pending trades on `token`. */
export function usePendingTrades(token: Address): PendingTrade[] {
  const all = useSyncExternalStore(subscribe, snapshot, () => empty);
  return all.filter((t) => t.token.toLowerCase() === token.toLowerCase());
}
