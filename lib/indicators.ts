import type { Candle } from "./candles";

/** A value per candle (null until the indicator has enough history), aligned with the input. */
export type Series = (number | null)[];

const closes = (candles: Candle[]) => candles.map((c) => c.close);

/** Simple moving average of `values` over n. */
export function smaOf(values: number[], n: number): Series {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n];
    return i >= n - 1 ? sum / n : null;
  });
}

/** Exponential moving average of `values`, seeded with the SMA of the first n (nulls are skipped as gaps). */
export function emaOf(values: (number | null)[], n: number): Series {
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let seed = 0;
  let seen = 0;
  return values.map((v) => {
    if (v === null) return null;
    if (prev === null) {
      seed += v;
      seen += 1;
      if (seen < n) return null;
      prev = seed / n;
      return prev;
    }
    prev = v * k + prev * (1 - k);
    return prev;
  });
}

/** Simple moving average of closes. */
export function sma(candles: Candle[], n: number): Series {
  return smaOf(closes(candles), n);
}

/** Exponential moving average of closes, seeded with the SMA of the first n. */
export function ema(candles: Candle[], n: number): Series {
  return emaOf(closes(candles), n);
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

/** Bollinger Bands: the n-candle SMA of closes ± k population standard deviations. */
export function bollinger(candles: Candle[], n = 20, k = 2): { mid: Series; upper: Series; lower: Series } {
  const c = closes(candles);
  const mid = smaOf(c, n);
  const upper: Series = [];
  const lower: Series = [];
  mid.forEach((m, i) => {
    if (m === null) {
      upper.push(null);
      lower.push(null);
      return;
    }
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (c[j] - m) ** 2;
    const sd = Math.sqrt(sq / n);
    upper.push(m + k * sd);
    lower.push(m - k * sd);
  });
  return { mid, upper, lower };
}

/** RSI with Wilder's smoothing (0–100); the first value appears at candle n. */
export function rsi(candles: Candle[], n = 14): Series {
  const c = closes(candles);
  let gain = 0;
  let loss = 0;
  return c.map((v, i) => {
    if (i === 0) return null;
    const d = v - c[i - 1];
    const up = Math.max(d, 0);
    const down = Math.max(-d, 0);
    if (i <= n) {
      gain += up;
      loss += down;
      if (i < n) return null;
      gain /= n;
      loss /= n;
    } else {
      gain = (gain * (n - 1) + up) / n;
      loss = (loss * (n - 1) + down) / n;
    }
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - 100 / (1 + gain / loss);
  });
}

/** MACD: EMA(fast) − EMA(slow) of closes, its EMA(signal), and the histogram between them. */
export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9): { macd: Series; signal: Series; hist: Series } {
  const f = ema(candles, fast);
  const s = ema(candles, slow);
  const line: Series = f.map((v, i) => (v === null || s[i] === null ? null : v - (s[i] as number)));
  const sig = emaOf(line, signal);
  const hist: Series = line.map((v, i) => (v === null || sig[i] === null ? null : v - (sig[i] as number)));
  return { macd: line, signal: sig, hist };
}

// ----------------------------------------------------------------- studies

/** One plotted output of a study. */
export type StudyLine = { key: string; label: string; color: string; kind: "line" | "histogram"; values: Series };

export type StudyId = "ema9" | "ema21" | "sma50" | "vwap" | "bb" | "rsi" | "macd";

export type Study = {
  id: StudyId;
  label: string;
  /** "price": drawn over the candles, in the chart's units (price or market cap); "pane": its own pane below. */
  pane: "price" | "pane";
  /** Whether its values are prices (scaled with the Price / MCap switch) or unitless (RSI). */
  priced: boolean;
  /** Candles needed before it shows anything. */
  needs: number;
  /** Horizontal guide levels in its pane (RSI's 30 / 70). */
  levels?: number[];
  compute: (candles: Candle[]) => StudyLine[];
};

/** The chart's studies, in menu order. */
export const STUDIES: Study[] = [
  { id: "ema9", label: "EMA 9", pane: "price", priced: true, needs: 9, compute: (c) => [{ key: "ema9", label: "EMA 9", color: "#ffd166", kind: "line", values: ema(c, 9) }] },
  { id: "ema21", label: "EMA 21", pane: "price", priced: true, needs: 21, compute: (c) => [{ key: "ema21", label: "EMA 21", color: "#4cc9f0", kind: "line", values: ema(c, 21) }] },
  { id: "sma50", label: "SMA 50", pane: "price", priced: true, needs: 50, compute: (c) => [{ key: "sma50", label: "SMA 50", color: "#c792ea", kind: "line", values: sma(c, 50) }] },
  { id: "vwap", label: "VWAP", pane: "price", priced: true, needs: 1, compute: (c) => [{ key: "vwap", label: "VWAP", color: "#ff9d6e", kind: "line", values: vwap(c) }] },
  {
    id: "bb",
    label: "Bollinger Bands (20, 2)",
    pane: "price",
    priced: true,
    needs: 20,
    compute: (c) => {
      const b = bollinger(c, 20, 2);
      return [
        { key: "bbUpper", label: "BB upper", color: "#7f8ea3", kind: "line", values: b.upper },
        { key: "bbMid", label: "BB basis", color: "#b0b8c4", kind: "line", values: b.mid },
        { key: "bbLower", label: "BB lower", color: "#7f8ea3", kind: "line", values: b.lower },
      ];
    },
  },
  { id: "rsi", label: "RSI (14)", pane: "pane", priced: false, needs: 15, levels: [30, 70], compute: (c) => [{ key: "rsi", label: "RSI", color: "#b388ff", kind: "line", values: rsi(c, 14) }] },
  {
    id: "macd",
    label: "MACD (12, 26, 9)",
    pane: "pane",
    priced: true,
    needs: 34,
    compute: (c) => {
      const m = macd(c);
      return [
        { key: "macdHist", label: "Hist", color: "#8f939b", kind: "histogram", values: m.hist },
        { key: "macd", label: "MACD", color: "#4cc9f0", kind: "line", values: m.macd },
        { key: "macdSignal", label: "Signal", color: "#ff9d6e", kind: "line", values: m.signal },
      ];
    },
  },
];

export const studyById = (id: StudyId) => STUDIES.find((s) => s.id === id)!;
