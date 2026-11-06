import type { Candle } from "./candles";

/**
 * The fewest prices in view, as a share of the price: the auto scale shows at least this range around what's in view.
 * A new launch's first candles (the clearing price, then a trade 2% above it) used to fill the whole pane, then shrink
 * as more trades widened the range: a 2% move drawn as a 100% one.
 */
export const MIN_RANGE_SHARE = 0.12;

/** The auto scale's range, widened around its middle to at least MIN_RANGE_SHARE of the price. */
export function widenRange(r: { minValue: number; maxValue: number }): { minValue: number; maxValue: number } {
  const { minValue, maxValue } = r;
  const mid = (minValue + maxValue) / 2;
  const want = Math.abs(mid) * MIN_RANGE_SHARE;
  if (!(want > 0) || maxValue - minValue >= want) return r;
  return { minValue: mid - want / 2, maxValue: mid + want / 2 };
}

/**
 * `candles` with any trade not yet in them applied: its price moves the newest candle (high, low, close) when it falls
 * in that candle's period, or opens the next candle from the last close. Volume is left to the feed's candle, which
 * arrives a moment later. `trades` is newest first; only those after the newest candle's start are looked at.
 */
export function withLatestTrades(candles: Candle[], trades: readonly { time: number; price: number; blockNumber: bigint }[], interval: number): Candle[] {
  if (candles.length === 0 || trades.length === 0) return candles;
  const last = candles[candles.length - 1];
  const fresh = [];
  for (const t of trades) {
    if (t.time < last.time) break;
    if (t.price > 0) fresh.push(t);
  }
  if (fresh.length === 0) return candles;
  const out = candles.slice();
  // Oldest first, so the newest trade sets the close.
  for (const t of fresh.reverse()) {
    const bucket = Math.floor(t.time / interval) * interval;
    const tail = out[out.length - 1];
    if (bucket === tail.time) {
      out[out.length - 1] = { ...tail, high: Math.max(tail.high, t.price), low: Math.min(tail.low, t.price), close: t.price };
    } else if (bucket > tail.time) {
      out.push({ time: bucket, open: tail.close, high: Math.max(tail.close, t.price), low: Math.min(tail.close, t.price), close: t.price, volume: 0, trades: 0 });
    }
  }
  return out;
}

