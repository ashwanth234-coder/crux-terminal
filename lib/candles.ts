/**
 * OHLC candles from a pool's swaps. Each candle opens at the previous candle's close (so a quiet period
 * reads as a flat line, not a gap in price), then tracks the fills inside its interval. Prices are the
 * swaps' execution prices (USDC per whole token, Uniswap's 0.3% fee included), like DEX charts use.
 */

export type Fill = { time: number; price: number; usdc: bigint };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; trades: number };

export const INTERVALS = [
  { seconds: 1, label: "1s" },
  { seconds: 15, label: "15s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3_600, label: "1h" },
  { seconds: 14_400, label: "4h" },
  { seconds: 86_400, label: "1D" },
] as const;

/** The finest interval that keeps the whole history within about `maxCandles` candles. */
export function autoInterval(firstTime: number, now: number, maxCandles = 120): number {
  const span = Math.max(1, now - firstTime);
  return (INTERVALS.find((i) => span / i.seconds <= maxCandles) ?? INTERVALS[INTERVALS.length - 1]).seconds;
}

/**
 * `fills` in any order. `openPrice` is where the market stood before the first fill (the pool opens at
 * the auction's clearing price), so the first candle opens there.
 */
export function toCandles(fills: Fill[], interval: number, openPrice: number | null = null): Candle[] {
  const sorted = [...fills].filter((f) => f.price > 0).sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  let prevClose = openPrice;
  for (const f of sorted) {
    const bucket = Math.floor(f.time / interval) * interval;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, f.price);
      last.low = Math.min(last.low, f.price);
      last.close = f.price;
      last.volume += Number(f.usdc) / 1e6;
      last.trades += 1;
    } else {
      const open = prevClose ?? f.price;
      out.push({ time: bucket, open, high: Math.max(open, f.price), low: Math.min(open, f.price), close: f.price, volume: Number(f.usdc) / 1e6, trades: 1 });
    }
    prevClose = f.price;
  }
  return out;
}
