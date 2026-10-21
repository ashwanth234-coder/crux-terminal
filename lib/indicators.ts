import type { Candle } from "./candles";

/** A value per candle (null until the indicator has enough history), aligned with the input. */
export type Series = (number | null)[];

/** Simple moving average of closes. */
export function sma(candles: Candle[], n: number): Series {
  let sum = 0;
  return candles.map((c, i) => {
    sum += c.close;
    if (i >= n) sum -= candles[i - n].close;
    return i >= n - 1 ? sum / n : null;
  });
}

/** Exponential moving average of closes, seeded with the SMA of the first n. */
export function ema(candles: Candle[], n: number): Series {
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let seed = 0;
  return candles.map((c, i) => {
    if (i < n - 1) {
      seed += c.close;
      return null;
    }
    if (prev === null) {
      prev = (seed + c.close) / n;
      return prev;
    }
    prev = c.close * k + prev * (1 - k);
    return prev;
  });
}

/** Volume-weighted average price since the first candle (typical price × USDC volume). */
export function vwap(candles: Candle[]): Series {
  let pv = 0;
  let v = 0;
  return candles.map((c) => {
    if (c.volume > 0) {
      pv += ((c.high + c.low + c.close) / 3) * c.volume;
      v += c.volume;
    }
    return v > 0 ? pv / v : null;
  });
}

export const INDICATORS = [
  { id: "ma20", label: "MA 20", needs: 20, compute: (c: Candle[]) => sma(c, 20) },
  { id: "ema50", label: "EMA 50", needs: 50, compute: (c: Candle[]) => ema(c, 50) },
  { id: "vwap", label: "VWAP", needs: 1, compute: vwap },
] as const;

export type IndicatorId = (typeof INDICATORS)[number]["id"];
