import { toCandles, type Candle } from "./candles.ts";
import type { CoinTrade } from "./coinMarket.ts";

/**
 * A coin's launch phase from Crux's server (crux-solver launchhistory.ts): a Solana coin's pump.fun curve trades,
 * which the market data sites never recorded. `loading` while a first read runs; `none` for a coin with no such phase.
 */
export type LaunchHistory = { loading?: boolean; none?: boolean; source?: string; complete?: boolean; graduatedAt?: number; trades: CoinTrade[] };

/** The market's trades and the launch phase's, newest first, each trade once (by transaction, else id). */
export function joinLaunch(market: readonly CoinTrade[], launch: readonly CoinTrade[] | null): CoinTrade[] {
  if (!launch?.length) return [...market];
  const seen = new Set(market.map((t) => t.tx || t.id));
  const older = launch.filter((t) => !seen.has(t.tx || t.id) && !seen.has(t.id));
  return [...market, ...older].sort((a, b) => b.time - a.time || (b.seq ?? 0) - (a.seq ?? 0));
}

/**
 * Candles for the launch phase, at `interval` seconds, only before `before` (the first candle the market data has):
 * the chart puts them in front, so it starts at the coin's first trade. Trades without a dollar price are left out.
 */
export function launchCandles(launch: readonly CoinTrade[] | null, before: number, interval: number): Candle[] {
  if (!launch?.length) return [];
  const fills = launch
    .filter((t) => t.price > 0 && Math.floor(t.time / 1000) < before)
    .map((t) => ({ time: Math.floor(t.time / 1000), price: t.price, usdc: BigInt(Math.round(t.usd * 1e6)) }))
    .sort((a, b) => a.time - b.time);
  return toCandles(fills, interval).filter((c) => c.time < before);
}
