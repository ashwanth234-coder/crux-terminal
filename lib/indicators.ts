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

/** Moving average of a series with gaps: null until n values in a row are known. */
export function smaGaps(values: Series, n: number): Series {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const v = values[j];
      if (v === null) return null;
      sum += v;
    }
    return sum / n;
  });
}

/** Average true range with Wilder's smoothing; the first value is the plain mean of the first n true ranges. */
export function atr(candles: Candle[], n = 14): Series {
  let prev: number | null = null;
  let sum = 0;
  return candles.map((c, i) => {
    const tr = i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close));
    if (prev === null) {
      sum += tr;
      if (i < n - 1) return null;
      prev = sum / n;
      return prev;
    }
    prev = (prev * (n - 1) + tr) / n;
    return prev;
  });
}

/**
 * Supertrend (ATR n, multiplier m): a trailing stop that flips with the trend. Returned as two lines, `up` (the
 * support under an uptrend) and `down` (the resistance over a downtrend), each null while the other trend holds.
 */
export function supertrend(candles: Candle[], n = 10, m = 3): { up: Series; down: Series } {
  const a = atr(candles, n);
  const up: Series = [];
  const down: Series = [];
  let fu: number | null = null;
  let fl: number | null = null;
  let bull = true;
  candles.forEach((c, i) => {
    const r = a[i];
    if (r === null) {
      up.push(null);
      down.push(null);
      return;
    }
    const mid = (c.high + c.low) / 2;
    const bu = mid + m * r;
    const bl = mid - m * r;
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const nu: number = fu === null || bu < fu || prevClose > fu ? bu : fu;
    const nl: number = fl === null || bl > fl || prevClose < fl ? bl : fl;
    if (fu !== null && fl !== null) {
      if (!bull && c.close > fu) bull = true;
      else if (bull && c.close < fl) bull = false;
    } else {
      bull = c.close >= mid;
    }
    fu = nu;
    fl = nl;
    up.push(bull ? nl : null);
    down.push(bull ? null : nu);
  });
  return { up, down };
}

/** Donchian channel: the highest high and lowest low of the last n candles, and their midpoint. */
export function donchian(candles: Candle[], n = 20): { upper: Series; lower: Series; mid: Series } {
  const upper: Series = [];
  const lower: Series = [];
  const mid: Series = [];
  candles.forEach((_, i) => {
    if (i < n - 1) {
      upper.push(null);
      lower.push(null);
      mid.push(null);
      return;
    }
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper.push(hi);
    lower.push(lo);
    mid.push((hi + lo) / 2);
  });
  return { upper, lower, mid };
}

/** Stochastic RSI: where RSI(r) sits in its n-candle range (0–100), %K smoothed over k, %D over d. */
export function stochRsi(candles: Candle[], r = 14, n = 14, k = 3, d = 3): { k: Series; d: Series } {
  const x = rsi(candles, r);
  const raw: Series = x.map((v, i) => {
    if (v === null || i < n - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      const w = x[j];
      if (w === null) return null;
      hi = Math.max(hi, w);
      lo = Math.min(lo, w);
    }
    return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  });
  const kLine = smaGaps(raw, k);
  return { k: kLine, d: smaGaps(kLine, d) };
}

/** On-balance volume: USDC volume added on up closes, subtracted on down closes. */
export function obv(candles: Candle[]): Series {
  let total = 0;
  return candles.map((c, i) => {
    if (i > 0) total += c.close > candles[i - 1].close ? c.volume : c.close < candles[i - 1].close ? -c.volume : 0;
    return total;
  });
}

// ------------------------------------------------------- on-chain inputs

/**
 * What the on-chain studies read besides the candles, each aligned with them: USDC bought and sold in each candle
 * (from the trades' sides) and the number of holders at each candle's close (from the token's transfers).
 */
export type StudyContext = { buyUsd: number[]; sellUsd: number[]; holders: Series };

export const EMPTY_CONTEXT: StudyContext = { buyUsd: [], sellUsd: [], holders: [] };

/** USDC bought and sold per candle: each trade lands in the candle containing its time. */
export function flowByCandle(times: number[], interval: number, trades: { time: number; side: "buy" | "sell"; usd: number }[]) {
  const index = new Map(times.map((t, i) => [t, i]));
  const buyUsd = times.map(() => 0);
  const sellUsd = times.map(() => 0);
  for (const t of trades) {
    const i = index.get(Math.floor(t.time / interval) * interval);
    if (i === undefined) continue;
    if (t.side === "buy") buyUsd[i] += t.usd;
    else sellUsd[i] += t.usd;
  }
  return { buyUsd, sellUsd };
}

/**
 * Holders at each candle's close: wallets with a positive balance, protocol addresses (`exclude`, lower case)
 * left out, replayed from transfers (oldest first, value in token units).
 */
export function holdersByCandle(times: number[], interval: number, transfers: { from: string; to: string; value: bigint; time: number }[], exclude: Set<string>): Series {
  const bal = new Map<string, bigint>();
  let count = 0;
  const zero = BigInt(0);
  const add = (a: string, v: bigint) => {
    const k = a.toLowerCase();
    if (exclude.has(k)) return;
    const before = bal.get(k) ?? zero;
    const after = before + v;
    bal.set(k, after);
    if (before <= zero && after > zero) count += 1;
    else if (before > zero && after <= zero) count -= 1;
  };
  const out: Series = [];
  let j = 0;
  for (const t of times) {
    const end = t + interval;
    while (j < transfers.length && transfers[j].time < end) {
      const x = transfers[j];
      if (x.value > zero) {
        add(x.from, -x.value);
        add(x.to, x.value);
      }
      j++;
    }
    out.push(count);
  }
  return out;
}

// ----------------------------------------------------------------- studies

/** One plotted output of a study. */
export type StudyLine = { key: string; label: string; color: string; kind: "line" | "histogram"; values: Series };

export type StudyId =
  | "ema9"
  | "ema21"
  | "ema50"
  | "sma20"
  | "sma50"
  | "sma200"
  | "vwap"
  | "bb"
  | "donchian"
  | "supertrend"
  | "rsi"
  | "stochrsi"
  | "macd"
  | "atr"
  | "obv"
  | "netflow"
  | "buypressure"
  | "holders";

export type StudyGroup = "Trend" | "Bands" | "Oscillators" | "Volume" | "On-chain";

export type Study = {
  id: StudyId;
  label: string;
  group: StudyGroup;
  /** One line on what it shows, for the menu. */
  hint?: string;
  /** "price": drawn over the candles, in the chart's units (price or market cap); "pane": its own pane below. */
  pane: "price" | "pane";
  /** Whether its values are prices (scaled with the Price / MCap switch) or unitless (RSI). */
  priced: boolean;
  /** Candles needed before it shows anything. */
  needs: number;
  /** Horizontal guide levels in its pane (RSI's 30 / 70). */
  levels?: number[];
  compute: (candles: Candle[], ctx: StudyContext) => StudyLine[];
};

const line = (key: string, label: string, color: string, values: Series): StudyLine => ({ key, label, color, kind: "line", values });
const bar = (key: string, label: string, color: string, values: Series): StudyLine => ({ key, label, color, kind: "histogram", values });
const aligned = (candles: Candle[], v: number[] | Series) => candles.map((_, i) => v[i] ?? null);

/** The chart's studies, in menu order. */
export const STUDIES: Study[] = [
  { id: "ema9", label: "EMA 9", group: "Trend", pane: "price", priced: true, needs: 9, compute: (c) => [line("ema9", "EMA 9", "#ffd166", ema(c, 9))] },
  { id: "ema21", label: "EMA 21", group: "Trend", pane: "price", priced: true, needs: 21, compute: (c) => [line("ema21", "EMA 21", "#4cc9f0", ema(c, 21))] },
  { id: "ema50", label: "EMA 50", group: "Trend", pane: "price", priced: true, needs: 50, compute: (c) => [line("ema50", "EMA 50", "#7bdff2", ema(c, 50))] },
  { id: "sma20", label: "SMA 20", group: "Trend", pane: "price", priced: true, needs: 20, compute: (c) => [line("sma20", "SMA 20", "#f4a261", sma(c, 20))] },
  { id: "sma50", label: "SMA 50", group: "Trend", pane: "price", priced: true, needs: 50, compute: (c) => [line("sma50", "SMA 50", "#c792ea", sma(c, 50))] },
  { id: "sma200", label: "SMA 200", group: "Trend", pane: "price", priced: true, needs: 200, compute: (c) => [line("sma200", "SMA 200", "#e9c46a", sma(c, 200))] },
  {
    id: "vwap",
    label: "VWAP",
    group: "Trend",
    hint: "Average price paid, weighted by USDC volume",
    pane: "price",
    priced: true,
    needs: 1,
    compute: (c) => [line("vwap", "VWAP", "#ff9d6e", vwap(c))],
  },
  {
    id: "supertrend",
    label: "Supertrend (10, 3)",
    group: "Trend",
    hint: "ATR trailing stop that flips with the trend",
    pane: "price",
    priced: true,
    needs: 10,
    compute: (c) => {
      const s = supertrend(c, 10, 3);
      return [line("stUp", "ST up", "#5cc08c", s.up), line("stDown", "ST down", "#e5484d", s.down)];
    },
  },
  {
    id: "bb",
    label: "Bollinger Bands (20, 2)",
    group: "Bands",
    pane: "price",
    priced: true,
    needs: 20,
    compute: (c) => {
      const b = bollinger(c, 20, 2);
      return [line("bbUpper", "BB upper", "#7f8ea3", b.upper), line("bbMid", "BB basis", "#b0b8c4", b.mid), line("bbLower", "BB lower", "#7f8ea3", b.lower)];
    },
  },
  {
    id: "donchian",
    label: "Donchian Channel (20)",
    group: "Bands",
    hint: "Highest high and lowest low of 20 candles",
    pane: "price",
    priced: true,
    needs: 20,
    compute: (c) => {
      const d = donchian(c, 20);
      return [line("dcUpper", "DC upper", "#5fa8d3", d.upper), line("dcMid", "DC mid", "#8f939b", d.mid), line("dcLower", "DC lower", "#5fa8d3", d.lower)];
    },
  },
  { id: "rsi", label: "RSI (14)", group: "Oscillators", pane: "pane", priced: false, needs: 15, levels: [30, 70], compute: (c) => [line("rsi", "RSI", "#b388ff", rsi(c, 14))] },
  {
    id: "stochrsi",
    label: "Stoch RSI (14, 14, 3, 3)",
    group: "Oscillators",
    pane: "pane",
    priced: false,
    needs: 30,
    levels: [20, 80],
    compute: (c) => {
      const s = stochRsi(c);
      return [line("srsiK", "%K", "#4cc9f0", s.k), line("srsiD", "%D", "#ff9d6e", s.d)];
    },
  },
  {
    id: "macd",
    label: "MACD (12, 26, 9)",
    group: "Oscillators",
    pane: "pane",
    priced: true,
    needs: 34,
    compute: (c) => {
      const m = macd(c);
      return [bar("macdHist", "Hist", "#8f939b", m.hist), line("macd", "MACD", "#4cc9f0", m.macd), line("macdSignal", "Signal", "#ff9d6e", m.signal)];
    },
  },
  { id: "atr", label: "ATR (14)", group: "Oscillators", hint: "Average candle range: volatility", pane: "pane", priced: true, needs: 14, compute: (c) => [line("atr", "ATR", "#e9c46a", atr(c, 14))] },
  { id: "obv", label: "On-balance volume", group: "Volume", pane: "pane", priced: false, needs: 2, compute: (c) => [line("obv", "OBV", "#7bdff2", obv(c))] },
  {
    id: "netflow",
    label: "Net buy flow",
    group: "On-chain",
    hint: "USDC bought minus sold per candle, and its running total",
    pane: "pane",
    priced: false,
    needs: 1,
    compute: (c, ctx) => {
      const net = c.map((_, i) => (ctx.buyUsd[i] ?? 0) - (ctx.sellUsd[i] ?? 0));
      let run = 0;
      return [bar("netflow", "Net", "#8f939b", net), line("netflowCum", "Total", "#ffd166", net.map((v) => (run += v)))];
    },
  },
  {
    id: "buypressure",
    label: "Buy pressure %",
    group: "On-chain",
    hint: "Share of each candle's USDC volume that was buying",
    pane: "pane",
    priced: false,
    needs: 1,
    levels: [50],
    compute: (c, ctx) => [
      line(
        "buyPressure",
        "Buy %",
        "#5cc08c",
        c.map((_, i) => {
          const b = ctx.buyUsd[i] ?? 0;
          const s = ctx.sellUsd[i] ?? 0;
          return b + s > 0 ? (b / (b + s)) * 100 : null;
        }),
      ),
    ],
  },
  {
    id: "holders",
    label: "Holders",
    group: "On-chain",
    hint: "Wallets holding the token at each candle's close",
    pane: "pane",
    priced: false,
    needs: 1,
    compute: (c, ctx) => [line("holders", "Holders", "#c792ea", aligned(c, ctx.holders))],
  },
];

export const STUDY_GROUPS: StudyGroup[] = ["Trend", "Bands", "Oscillators", "Volume", "On-chain"];

export const studyById = (id: StudyId) => STUDIES.find((s) => s.id === id)!;
export const isStudyId = (id: unknown): id is StudyId => STUDIES.some((s) => s.id === id);
