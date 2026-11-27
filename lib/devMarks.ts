import type { Address } from "viem";
import type { MarkTrade } from "./chartMarks.ts";

/** A trade as another chain's coin chart has it (its trades list): who made it, when (unix s), which way, how big. */
export type ChartTrade = { time: number; side: "buy" | "sell"; usd: number; price: number; trader: string; tx: string };

const same = (a: string, b: string) => (a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b);

/**
 * The coin creator's buys and sells, as the chart's DB / DS badges (lib/chartMarks): every trade in the list whose
 * trader is the creator's wallet. Only what the list holds (the market's recent trades, and every trade since Crux
 * started watching the coin): an older sell is not here. Empty when the creator isn't known.
 */
export function devMarks(trades: readonly ChartTrade[], creator: string | null | undefined): MarkTrade[] {
  if (!creator) return [];
  const out: MarkTrade[] = [];
  for (const t of trades) {
    if (!t.trader || !same(t.trader, creator)) continue;
    out.push({ time: t.time, side: t.side, who: "dev", address: t.trader as Address, tokens: t.price > 0 ? t.usd / t.price : 0, usd: t.usd, txHash: t.tx });
  }
  return out.sort((a, b) => a.time - b.time);
}
