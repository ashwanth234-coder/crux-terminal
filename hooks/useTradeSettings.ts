"use client";

import { useSyncExternalStore } from "react";
import { SLIPPAGE_BPS } from "@/lib/intents";

/**
 * The trader's own execution settings, kept in this browser and shared by every order ticket on the page: the
 * slippage allowance signed into each order's minimum, and the four dollar sizes of the quick-buy buttons.
 */
export type TradeSettings = { slippageBps: number; buyPresets: number[] };

const KEY = "crux:trade-settings:v1";
export const DEFAULT_TRADE_SETTINGS: TradeSettings = { slippageBps: SLIPPAGE_BPS, buyPresets: [10, 20, 50, 100] };
/** The widest allowance the ticket will sign: past this a "minimum" protects nothing. */
export const MAX_SLIPPAGE_BPS = 2_000;
export const MIN_SLIPPAGE_BPS = 10;

let cached: TradeSettings | null = null;
const listeners = new Set<() => void>();

function read(): TradeSettings {
  if (cached) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const bps = Number(raw?.slippageBps);
    const presets = Array.isArray(raw?.buyPresets) ? raw.buyPresets.map(Number) : [];
    cached = {
      slippageBps: Number.isFinite(bps) ? Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, Math.round(bps))) : SLIPPAGE_BPS,
      buyPresets:
        presets.length === 4 && presets.every((v: number) => Number.isFinite(v) && v > 0) ? presets : DEFAULT_TRADE_SETTINGS.buyPresets,
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
