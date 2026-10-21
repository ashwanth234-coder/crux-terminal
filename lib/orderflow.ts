import type { PoolTrade } from "@/hooks/usePoolSwaps";

/**
 * Price change over a window, from executed trades only: the last trade now versus the last trade
 * before the window opened. A pool opens at its clearing price, so with no earlier trade that is the
 * reference. With no trade inside the window the change is exactly zero. `trades` is newest first.
 */
export function priceChange(trades: PoolTrade[], now: number, windowSeconds: number, openPrice: number): number | null {
  if (!(openPrice > 0)) return null;
  const start = now - windowSeconds;
  const current = trades[0]?.price ?? openPrice;
  const before = trades.find((t) => t.time < start)?.price ?? openPrice;
  return before > 0 ? (current / before - 1) * 100 : null;
}

export type Flow = {
  buys: number;
  sells: number;
  buyUsdc: bigint;
  sellUsdc: bigint;
  /** USDC volume filled by the Crux solver (intent fills), the rest being direct pool swaps. */
  intentUsdc: bigint;
};

/** Buys against sells, by count and by USDC, for trades at or after `since` (unix seconds). */
export function orderflow(trades: PoolTrade[], since: number): Flow {
  const flow: Flow = { buys: 0, sells: 0, buyUsdc: BigInt(0), sellUsdc: BigInt(0), intentUsdc: BigInt(0) };
  for (const t of trades) {
    if (t.time < since) continue;
    if (t.side === "buy") {
      flow.buys += 1;
      flow.buyUsdc += t.usdc;
    } else {
      flow.sells += 1;
      flow.sellUsdc += t.usdc;
    }
    if (t.viaIntent) flow.intentUsdc += t.usdc;
  }
  return flow;
}

/** a / (a + b) as a percentage, 0 when both are zero. */
export function share(a: bigint | number, b: bigint | number): number {
  const x = Number(a);
  const total = x + Number(b);
  return total > 0 ? (x / total) * 100 : 0;
}

/** Testnet sizes are often cents: whole dollars to 2 places, smaller amounts to 3 significant digits. */
export function usdAmount(units: bigint): string {
  const v = Number(units) / 1e6;
  if (v === 0) return "$0";
  return v >= 1 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${v.toLocaleString("en-US", { maximumSignificantDigits: 3 })}`;
}
