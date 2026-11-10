"use client";

import { useSyncExternalStore } from "react";

/**
 * The trader's own execution settings, kept in this browser and shared by every order ticket on the page: the
 * slippage allowance signed into each order's minimum (buys and sells set apart, as memecoin terminals do), the four
 * quick-buy dollar sizes and quick-sell shares, and whether a quick size trades at once (one click or key 1–4).
 */
export type TradeSettings = {
  /** Buy slippage, basis points. */
  slippageBps: number;
  sellSlippageBps: number;
  buyPresets: number[];
  /** Percent of the bag, 1–100. */
  sellPresets: number[];
  /** A quick size places the order straight away (from a Crux account or a one-click session) instead of filling the box. */
  instant: boolean;
  /**
   * Standing orders' own slippage (take profit, stop loss, trailing, buy the dip), basis points: kept apart from the
   * trade setting, which traders often loosen (a 50% sell slippage let a take profit fill half under its trigger).
   */
  standingSlippageBps: number;
};

const KEY = "crux:trade-settings:v1";
/** Memecoin-terminal defaults: 10% either way. Crux fills at the batch's one price; this is only the floor. */
export const DEFAULT_SLIPPAGE_BPS = 1_000;
export const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  slippageBps: DEFAULT_SLIPPAGE_BPS,
  sellSlippageBps: DEFAULT_SLIPPAGE_BPS,
  buyPresets: [10, 20, 50, 100],
  sellPresets: [25, 50, 75, 100],
  standingSlippageBps: 1_000,
  instant: true,
};
/** The widest allowance the ticket will sign (the relay's price guard refuses anything looser). */
export const MAX_SLIPPAGE_BPS = 5_000;
export const MIN_SLIPPAGE_BPS = 10;

let cached: TradeSettings | null = null;
const listeners = new Set<() => void>();

const clampBps = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, Math.round(n))) : fallback;
};
const four = (v: unknown, ok: (n: number) => boolean, fallback: number[]) => {
  const list = Array.isArray(v) ? v.map(Number) : [];
  return list.length === 4 && list.every(ok) ? list : fallback;
};

function read(): TradeSettings {
  if (cached) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // Settings saved before the per-side split (and its 0.5% default) start from the memecoin defaults.
    const migrated = raw && raw.sellSlippageBps === undefined;
    cached = {
      slippageBps: migrated ? DEFAULT_SLIPPAGE_BPS : clampBps(raw?.slippageBps, DEFAULT_SLIPPAGE_BPS),
      sellSlippageBps: migrated ? DEFAULT_SLIPPAGE_BPS : clampBps(raw?.sellSlippageBps, DEFAULT_SLIPPAGE_BPS),
      buyPresets: four(raw?.buyPresets, (n) => Number.isFinite(n) && n > 0, DEFAULT_TRADE_SETTINGS.buyPresets),
      sellPresets: four(raw?.sellPresets, (n) => Number.isFinite(n) && n > 0 && n <= 100, DEFAULT_TRADE_SETTINGS.sellPresets),
      instant: typeof raw?.instant === "boolean" ? raw.instant : true,
      standingSlippageBps: clampBps(raw?.standingSlippageBps, 1_000),
    };
  } catch {
    cached = DEFAULT_TRADE_SETTINGS;
  }
  return cached;
}

export function saveTradeSettings(next: TradeSettings) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the settings still hold for this page.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTradeSettings(): TradeSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_TRADE_SETTINGS);
}

/** The slippage for a side, in basis points. */
export const slippageFor = (s: TradeSettings, side: "buy" | "sell") => (side === "buy" ? s.slippageBps : s.sellSlippageBps);
