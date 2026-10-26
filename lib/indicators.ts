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

const hl2 = (candles: Candle[]) => candles.map((c) => (c.high + c.low) / 2);
const typical = (candles: Candle[]) => candles.map((c) => (c.high + c.low + c.close) / 3);

/** Weighted moving average (weights 1..n, newest heaviest) of a series with gaps. */
export function wmaOf(values: Series, n: number): Series {
  const denom = (n * (n + 1)) / 2;
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const v = values[i - n + 1 + j];
      if (v === null) return null;
      sum += v * (j + 1);
    }
    return sum / denom;
  });
}

/** Hull moving average: WMA(2·WMA(n/2) − WMA(n), √n), fast with little lag. */
export function hma(candles: Candle[], n = 9): Series {
  const c = closes(candles);
  const half = wmaOf(c, Math.max(1, Math.round(n / 2)));
  const full = wmaOf(c, n);
  const diff: Series = half.map((h, i) => (h === null || full[i] === null ? null : 2 * h - (full[i] as number)));
  return wmaOf(diff, Math.max(1, Math.round(Math.sqrt(n))));
}

/** Double and triple EMA: 2·EMA − EMA(EMA), and 3·EMA − 3·EMA(EMA) + EMA(EMA(EMA)). */
export function dema(candles: Candle[], n = 21): Series {
  const e1 = ema(candles, n);
  const e2 = emaOf(e1, n);
  return e1.map((v, i) => (v === null || e2[i] === null ? null : 2 * v - (e2[i] as number)));
}
export function tema(candles: Candle[], n = 21): Series {
  const e1 = ema(candles, n);
  const e2 = emaOf(e1, n);
  const e3 = emaOf(e2, n);
  return e1.map((v, i) => (v === null || e2[i] === null || e3[i] === null ? null : 3 * v - 3 * (e2[i] as number) + (e3[i] as number)));
}

/** Arnaud Legoux moving average: a Gaussian-weighted window offset toward the newest prices. */
export function alma(candles: Candle[], n = 9, offset = 0.85, sigma = 6): Series {
  const c = closes(candles);
  const m = offset * (n - 1);
  const s = n / sigma;
  const w = Array.from({ length: n }, (_, j) => Math.exp(-((j - m) ** 2) / (2 * s * s)));
  const wsum = w.reduce((a, b) => a + b, 0);
  return c.map((_, i) => (i < n - 1 ? null : w.reduce((acc, wj, j) => acc + wj * c[i - n + 1 + j], 0) / wsum));
}

/** Keltner channels: EMA(n) of closes ± m·ATR(n). */
export function keltner(candles: Candle[], n = 20, m = 2): { upper: Series; mid: Series; lower: Series } {
  const mid = ema(candles, n);
  const a = atr(candles, n);
  return {
    mid,
    upper: mid.map((v, i) => (v === null || a[i] === null ? null : v + m * (a[i] as number))),
    lower: mid.map((v, i) => (v === null || a[i] === null ? null : v - m * (a[i] as number))),
  };
}

/** Parabolic SAR (step 0.02, max 0.2): a trailing stop that accelerates with the trend. */
export function psar(candles: Candle[], step = 0.02, max = 0.2): Series {
  if (candles.length < 2) return candles.map(() => null);
  let bull = candles[1].close >= candles[0].close;
  let sar = bull ? candles[0].low : candles[0].high;
  let ep = bull ? candles[0].high : candles[0].low;
  let af = step;
  const out: Series = [null];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    sar = sar + af * (ep - sar);
    const p = candles[i - 1];
    const pp = candles[Math.max(0, i - 2)];
    if (bull) {
      sar = Math.min(sar, p.low, pp.low);
      if (c.low < sar) {
        bull = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, p.high, pp.high);
      if (c.high > sar) {
        bull = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(max, af + step);
      }
    }
    out.push(sar);
  }
  return out;
}

/** Ichimoku conversion (9) and base (26) lines: midpoints of the period's high and low. */
export function ichimokuLines(candles: Candle[], conv = 9, base = 26): { conversion: Series; base: Series } {
  const mid = (n: number): Series =>
    candles.map((_, i) => {
      if (i < n - 1) return null;
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - n + 1; j <= i; j++) {
        hi = Math.max(hi, candles[j].high);
        lo = Math.min(lo, candles[j].low);
      }
      return (hi + lo) / 2;
    });
  return { conversion: mid(conv), base: mid(base) };
}

/** The highest high and lowest low so far: the chart's own "52-week" range for a token younger than a year. */
export function periodHighLow(candles: Candle[]): { high: Series; low: Series } {
  let hi = -Infinity;
  let lo = Infinity;
  const high: Series = [];
  const low: Series = [];
  for (const c of candles) {
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
    high.push(hi);
    low.push(lo);
  }
  return { high, low };
}

/** Commodity channel index: (typical − SMA) / (0.015 × mean deviation). */
export function cci(candles: Candle[], n = 20): Series {
  const tp = typical(candles);
  const ma = smaOf(tp, n);
  return tp.map((v, i) => {
    const m = ma[i];
    if (m === null) return null;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - m);
    dev /= n;
    return dev === 0 ? 0 : (v - m) / (0.015 * dev);
  });
}

/** Williams %R: where the close sits in the n-candle range, 0 (top) to −100 (bottom). */
export function williamsR(candles: Candle[], n = 14): Series {
  const d = donchian(candles, n);
  return candles.map((c, i) => {
    const hi = d.upper[i];
    const lo = d.lower[i];
    if (hi === null || lo === null) return null;
    return hi === lo ? -50 : ((hi - c.close) / (hi - lo)) * -100;
  });
}

/** Money flow index: RSI of typical price weighted by USDC volume (0–100). */
export function mfi(candles: Candle[], n = 14): Series {
  const tp = typical(candles);
  return candles.map((_, i) => {
    if (i < n) return null;
    let pos = 0;
    let neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j] * candles[j].volume;
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    return neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  });
}

/** Average directional index with +DI and −DI (Wilder, n). */
export function adx(candles: Candle[], n = 14): { adx: Series; plus: Series; minus: Series } {
  const plus: Series = [];
  const minus: Series = [];
  const dxs: Series = [];
  let tr = 0;
  let pdm = 0;
  let mdm = 0;
  candles.forEach((c, i) => {
    if (i === 0) {
      plus.push(null);
      minus.push(null);
      dxs.push(null);
      return;
    }
    const p = candles[i - 1];
    const up = c.high - p.high;
    const down = p.low - c.low;
    const t = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const pd = up > down && up > 0 ? up : 0;
    const md = down > up && down > 0 ? down : 0;
    if (i <= n) {
      tr += t;
      pdm += pd;
      mdm += md;
    } else {
      tr = tr - tr / n + t;
      pdm = pdm - pdm / n + pd;
      mdm = mdm - mdm / n + md;
    }
    if (i < n || tr === 0) {
      plus.push(null);
      minus.push(null);
      dxs.push(null);
      return;
    }
    const pdi = (100 * pdm) / tr;
    const mdi = (100 * mdm) / tr;
    plus.push(pdi);
    minus.push(mdi);
    dxs.push(pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi));
  });
  // ADX: Wilder's smoothing of DX.
  let prev: number | null = null;
  let seed = 0;
  let seen = 0;
  const out: Series = dxs.map((v) => {
    if (v === null) return null;
    if (prev === null) {
      seed += v;
      seen += 1;
      if (seen < n) return null;
      prev = seed / n;
      return prev;
    }
    prev = (prev * (n - 1) + v) / n;
    return prev;
  });
  return { adx: out, plus, minus };
}

/** Aroon up / down: how recently the n-candle high and low were set (100 = this candle). */
export function aroon(candles: Candle[], n = 14): { up: Series; down: Series } {
  const up: Series = [];
  const down: Series = [];
  candles.forEach((_, i) => {
    if (i < n) {
      up.push(null);
      down.push(null);
      return;
    }
    let hi = i - n;
    let lo = i - n;
    for (let j = i - n; j <= i; j++) {
      if (candles[j].high >= candles[hi].high) hi = j;
      if (candles[j].low <= candles[lo].low) lo = j;
    }
    up.push(((n - (i - hi)) / n) * 100);
    down.push(((n - (i - lo)) / n) * 100);
  });
  return { up, down };
}

/** Awesome oscillator: SMA(5) − SMA(34) of the bars' midpoints; accelerator = AO − SMA(5) of AO. */
export function awesome(candles: Candle[]): Series {
  const m = hl2(candles);
  const fast = smaOf(m, 5);
  const slow = smaOf(m, 34);
  return fast.map((v, i) => (v === null || slow[i] === null ? null : v - (slow[i] as number)));
}
export function accelerator(candles: Candle[]): Series {
  const ao = awesome(candles);
  const ma = smaGaps(ao, 5);
  return ao.map((v, i) => (v === null || ma[i] === null ? null : v - (ma[i] as number)));
}

/** Rate of change (%) and momentum (price difference) over n candles. */
export function roc(candles: Candle[], n = 9): Series {
  return candles.map((c, i) => (i < n || candles[i - n].close === 0 ? null : (c.close / candles[i - n].close - 1) * 100));
}
export function momentum(candles: Candle[], n = 10): Series {
  return candles.map((c, i) => (i < n ? null : c.close - candles[i - n].close));
}

/** TRIX: the 1-candle % change of a triple-smoothed EMA. */
export function trix(candles: Candle[], n = 15): Series {
  const e3 = emaOf(emaOf(ema(candles, n), n), n);
  return e3.map((v, i) => (v === null || i === 0 || e3[i - 1] === null || e3[i - 1] === 0 ? null : (v / (e3[i - 1] as number) - 1) * 100));
}

/** Accumulation / distribution line and Chaikin money flow (n): volume weighted by where each close sits in its bar. */
const mfMultiplier = (c: Candle) => (c.high === c.low ? 0 : (c.close - c.low - (c.high - c.close)) / (c.high - c.low));
export function accDist(candles: Candle[]): Series {
  let total = 0;
  return candles.map((c) => (total += mfMultiplier(c) * c.volume));
}
export function cmf(candles: Candle[], n = 20): Series {
  return candles.map((_, i) => {
    if (i < n - 1) return null;
    let mf = 0;
    let vol = 0;
    for (let j = i - n + 1; j <= i; j++) {
      mf += mfMultiplier(candles[j]) * candles[j].volume;
      vol += candles[j].volume;
    }
    return vol === 0 ? 0 : mf / vol;
  });
}

/** Moving average of USDC volume (n). */
export function volumeMa(candles: Candle[], n = 20): Series {
  return smaOf(
    candles.map((c) => c.volume),
    n,
  );
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
  | "wma"
  | "hma"
  | "dema"
  | "tema"
  | "alma"
  | "vwap"
  | "supertrend"
  | "psar"
  | "ichimoku"
  | "highlow"
  | "bb"
  | "donchian"
  | "keltner"
  | "rsi"
  | "stochrsi"
  | "macd"
  | "atr"
  | "cci"
  | "willr"
  | "adx"
  | "aroon"
  | "ao"
  | "ac"
  | "roc"
  | "mom"
  | "trix"
  | "mfi"
  | "ad"
  | "cmf"
  | "volma"
  | "obv"
  | "vprofile"
  | "netflow"
  | "buypressure"
  | "holders";

export type StudyGroup = "Trend" | "Bands" | "Oscillators" | "Volume" | "On-chain";

/** A setting a trader can change (length, multiplier, guide level…), with its default and limits. */
export type ParamDef = { key: string; label: string; def: number; min: number; max: number; step?: number };
export type Params = Record<string, number>;

export type Study = {
  id: StudyId;
  /** The menu name; `title(p)` is what the legend shows with the current settings. */
  label: string;
  title: (p: Params) => string;
  group: StudyGroup;
  /** One line on what it shows, for the menu. */
  hint?: string;
  /** "price": drawn over the candles, in the chart's units (price or market cap); "pane": its own pane below. */
  pane: "price" | "pane";
  /** Whether its values are prices (scaled with the Price / MCap switch) or unitless (RSI). */
  priced: boolean;
  params: ParamDef[];
  /** Horizontal guide levels in its pane, from the settings (RSI's 30 / 70). */
  levels?: (p: Params) => number[];
  /** Drawn by the chart itself rather than as lines (the volume profile). */
  special?: boolean;
  compute: (candles: Candle[], ctx: StudyContext, p: Params) => StudyLine[];
};

const line = (key: string, label: string, color: string, values: Series): StudyLine => ({ key, label, color, kind: "line", values });
const bar = (key: string, label: string, color: string, values: Series): StudyLine => ({ key, label, color, kind: "histogram", values });
const aligned = (candles: Candle[], v: number[] | Series) => candles.map((_, i) => v[i] ?? null);
const len = (def: number, label = "Length", max = 500): ParamDef => ({ key: "length", label, def, min: 1, max });
const lvl = (key: string, label: string, def: number, min: number, max: number): ParamDef => ({ key, label, def, min, max });

/** A single moving-average line with an editable length. */
const ma = (id: StudyId, name: string, def: number, color: string, fn: (c: Candle[], n: number) => Series, hint?: string): Study => ({
  id,
  label: `${name} ${def}`,
  title: (p) => `${name} ${p.length}`,
  group: "Trend",
  hint,
  pane: "price",
  priced: true,
  params: [len(def)],
  compute: (c, _x, p) => [line(id, `${name} ${p.length}`, color, fn(c, p.length))],
});

/** The chart's studies, in menu order. */
export const STUDIES: Study[] = [
  ma("ema9", "EMA", 9, "#ffd166", (c, n) => ema(c, n)),
  ma("ema21", "EMA", 21, "#4cc9f0", (c, n) => ema(c, n)),
  ma("ema50", "EMA", 50, "#7bdff2", (c, n) => ema(c, n)),
  ma("sma20", "SMA", 20, "#f4a261", (c, n) => sma(c, n)),
  ma("sma50", "SMA", 50, "#c792ea", (c, n) => sma(c, n)),
  ma("sma200", "SMA", 200, "#e9c46a", (c, n) => sma(c, n)),
  ma("wma", "WMA", 20, "#90be6d", (c, n) => wmaOf(closes(c), n)),
  ma("hma", "Hull MA", 9, "#43aa8b", (c, n) => hma(c, n), "Fast moving average with little lag"),
  ma("dema", "Double EMA", 21, "#577590", (c, n) => dema(c, n)),
  ma("tema", "Triple EMA", 21, "#4d908e", (c, n) => tema(c, n)),
  {
    id: "alma",
    label: "Arnaud Legoux MA 9",
    title: (p) => `ALMA ${p.length} ${p.offset} ${p.sigma}`,
    group: "Trend",
    pane: "price",
    priced: true,
    params: [len(9), { key: "offset", label: "Offset", def: 0.85, min: 0, max: 1, step: 0.05 }, { key: "sigma", label: "Sigma", def: 6, min: 1, max: 20 }],
    compute: (c, _x, p) => [line("alma", "ALMA", "#f9844a", alma(c, p.length, p.offset, p.sigma))],
  },
  {
    id: "vwap",
    label: "VWAP",
    title: () => "VWAP",
    group: "Trend",
    hint: "Average price paid, weighted by USDC volume",
    pane: "price",
    priced: true,
    params: [],
    compute: (c) => [line("vwap", "VWAP", "#ff9d6e", vwap(c))],
  },
  {
    id: "supertrend",
    label: "Supertrend (10, 3)",
    title: (p) => `Supertrend ${p.length} ${p.mult}`,
    group: "Trend",
    hint: "ATR trailing stop that flips with the trend",
    pane: "price",
    priced: true,
    params: [len(10, "ATR length"), { key: "mult", label: "Multiplier", def: 3, min: 0.5, max: 10, step: 0.5 }],
    compute: (c, _x, p) => {
      const s = supertrend(c, p.length, p.mult);
      return [line("stUp", "ST up", "#5cc08c", s.up), line("stDown", "ST down", "#e5484d", s.down)];
    },
  },
  {
    id: "psar",
    label: "Parabolic SAR",
    title: (p) => `SAR ${p.step} ${p.max}`,
    group: "Trend",
    hint: "Trailing stop that speeds up with the trend",
    pane: "price",
    priced: true,
    params: [
      { key: "step", label: "Step", def: 0.02, min: 0.005, max: 0.2, step: 0.005 },
      { key: "max", label: "Maximum", def: 0.2, min: 0.05, max: 1, step: 0.05 },
    ],
    compute: (c, _x, p) => [line("psar", "SAR", "#f9c74f", psar(c, p.step, p.max))],
  },
  {
    id: "ichimoku",
    label: "Ichimoku (conversion, base)",
    title: (p) => `Ichimoku ${p.conv} ${p.base}`,
    group: "Trend",
    pane: "price",
    priced: true,
    params: [lvl("conv", "Conversion", 9, 1, 100), lvl("base", "Base", 26, 1, 200)],
    compute: (c, _x, p) => {
      const x = ichimokuLines(c, p.conv, p.base);
      return [line("ichiConv", "Conversion", "#4cc9f0", x.conversion), line("ichiBase", "Base", "#e5484d", x.base)];
    },
  },
  {
    id: "highlow",
    label: "All-time high / low",
    title: () => "ATH / ATL",
    group: "Trend",
    hint: "The token's highest and lowest price so far (its own 52-week range)",
    pane: "price",
    priced: true,
    params: [],
    compute: (c) => {
      const x = periodHighLow(c);
      return [line("athHigh", "High", "#5cc08c", x.high), line("athLow", "Low", "#e5484d", x.low)];
    },
  },
  {
    id: "bb",
    label: "Bollinger Bands (20, 2)",
    title: (p) => `BB ${p.length} ${p.mult}`,
    group: "Bands",
    pane: "price",
    priced: true,
    params: [len(20), { key: "mult", label: "Std. dev.", def: 2, min: 0.5, max: 5, step: 0.5 }],
    compute: (c, _x, p) => {
      const b = bollinger(c, p.length, p.mult);
      return [line("bbUpper", "Upper", "#7f8ea3", b.upper), line("bbMid", "Basis", "#b0b8c4", b.mid), line("bbLower", "Lower", "#7f8ea3", b.lower)];
    },
  },
  {
    id: "donchian",
    label: "Donchian Channel (20)",
    title: (p) => `DC ${p.length}`,
    group: "Bands",
    hint: "Highest high and lowest low of the period",
    pane: "price",
    priced: true,
    params: [len(20)],
    compute: (c, _x, p) => {
      const d = donchian(c, p.length);
      return [line("dcUpper", "Upper", "#5fa8d3", d.upper), line("dcMid", "Mid", "#8f939b", d.mid), line("dcLower", "Lower", "#5fa8d3", d.lower)];
    },
  },
  {
    id: "keltner",
    label: "Keltner Channels (20, 2)",
    title: (p) => `KC ${p.length} ${p.mult}`,
    group: "Bands",
    pane: "price",
    priced: true,
    params: [len(20), { key: "mult", label: "ATR multiplier", def: 2, min: 0.5, max: 5, step: 0.5 }],
    compute: (c, _x, p) => {
      const x = keltner(c, p.length, p.mult);
      return [line("kcUpper", "Upper", "#9d8df1", x.upper), line("kcMid", "Basis", "#b8b8ff", x.mid), line("kcLower", "Lower", "#9d8df1", x.lower)];
    },
  },
  {
    id: "rsi",
    label: "RSI (14)",
    title: (p) => `RSI ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(14, "Length", 200), lvl("upper", "Overbought", 70, 50, 100), lvl("lower", "Oversold", 30, 0, 50)],
    levels: (p) => [p.lower, p.upper],
    compute: (c, _x, p) => [line("rsi", "RSI", "#b388ff", rsi(c, p.length))],
  },
  {
    id: "stochrsi",
    label: "Stoch RSI (14, 14, 3, 3)",
    title: (p) => `Stoch RSI ${p.rsi} ${p.length} ${p.k} ${p.d}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [lvl("rsi", "RSI length", 14, 1, 100), len(14, "Stoch length", 100), lvl("k", "%K smoothing", 3, 1, 20), lvl("d", "%D smoothing", 3, 1, 20), lvl("upper", "Upper", 80, 50, 100), lvl("lower", "Lower", 20, 0, 50)],
    levels: (p) => [p.lower, p.upper],
    compute: (c, _x, p) => {
      const s = stochRsi(c, p.rsi, p.length, p.k, p.d);
      return [line("srsiK", "%K", "#4cc9f0", s.k), line("srsiD", "%D", "#ff9d6e", s.d)];
    },
  },
  {
    id: "macd",
    label: "MACD (12, 26, 9)",
    title: (p) => `MACD ${p.fast} ${p.slow} ${p.signal}`,
    group: "Oscillators",
    pane: "pane",
    priced: true,
    params: [lvl("fast", "Fast", 12, 1, 100), lvl("slow", "Slow", 26, 2, 200), lvl("signal", "Signal", 9, 1, 50)],
    compute: (c, _x, p) => {
      const m = macd(c, p.fast, p.slow, p.signal);
      return [bar("macdHist", "Hist", "#8f939b", m.hist), line("macd", "MACD", "#4cc9f0", m.macd), line("macdSignal", "Signal", "#ff9d6e", m.signal)];
    },
  },
  {
    id: "atr",
    label: "ATR (14)",
    title: (p) => `ATR ${p.length}`,
    group: "Oscillators",
    hint: "Average candle range: volatility",
    pane: "pane",
    priced: true,
    params: [len(14)],
    compute: (c, _x, p) => [line("atr", "ATR", "#e9c46a", atr(c, p.length))],
  },
  {
    id: "cci",
    label: "CCI (20)",
    title: (p) => `CCI ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(20)],
    levels: () => [-100, 100],
    compute: (c, _x, p) => [line("cci", "CCI", "#4cc9f0", cci(c, p.length))],
  },
  {
    id: "willr",
    label: "Williams %R (14)",
    title: (p) => `%R ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(14)],
    levels: () => [-80, -20],
    compute: (c, _x, p) => [line("willr", "%R", "#c792ea", williamsR(c, p.length))],
  },
  {
    id: "adx",
    label: "ADX / DMI (14)",
    title: (p) => `ADX ${p.length}`,
    group: "Oscillators",
    hint: "Trend strength, with buyers' (+DI) and sellers' (−DI) push",
    pane: "pane",
    priced: false,
    params: [len(14, "Length", 100), lvl("level", "Trend level", 25, 1, 100)],
    levels: (p) => [p.level],
    compute: (c, _x, p) => {
      const x = adx(c, p.length);
      return [line("adx", "ADX", "#ffd166", x.adx), line("pdi", "+DI", "#5cc08c", x.plus), line("mdi", "−DI", "#e5484d", x.minus)];
    },
  },
  {
    id: "aroon",
    label: "Aroon (14)",
    title: (p) => `Aroon ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(14)],
    compute: (c, _x, p) => {
      const x = aroon(c, p.length);
      return [line("aroonUp", "Up", "#5cc08c", x.up), line("aroonDown", "Down", "#e5484d", x.down)];
    },
  },
  {
    id: "ao",
    label: "Awesome Oscillator",
    title: () => "AO",
    group: "Oscillators",
    pane: "pane",
    priced: true,
    params: [],
    compute: (c) => [bar("ao", "AO", "#8f939b", awesome(c))],
  },
  {
    id: "ac",
    label: "Accelerator Oscillator",
    title: () => "AC",
    group: "Oscillators",
    pane: "pane",
    priced: true,
    params: [],
    compute: (c) => [bar("ac", "AC", "#8f939b", accelerator(c))],
  },
  {
    id: "roc",
    label: "Rate of Change (9)",
    title: (p) => `ROC ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(9)],
    levels: () => [0],
    compute: (c, _x, p) => [line("roc", "ROC %", "#f4a261", roc(c, p.length))],
  },
  {
    id: "mom",
    label: "Momentum (10)",
    title: (p) => `MOM ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: true,
    params: [len(10)],
    levels: () => [0],
    compute: (c, _x, p) => [line("mom", "MOM", "#e9c46a", momentum(c, p.length))],
  },
  {
    id: "trix",
    label: "TRIX (15)",
    title: (p) => `TRIX ${p.length}`,
    group: "Oscillators",
    pane: "pane",
    priced: false,
    params: [len(15, "Length", 100)],
    levels: () => [0],
    compute: (c, _x, p) => [line("trix", "TRIX", "#90be6d", trix(c, p.length))],
  },
  {
    id: "mfi",
    label: "Money Flow Index (14)",
    title: (p) => `MFI ${p.length}`,
    group: "Volume",
    hint: "RSI weighted by volume",
    pane: "pane",
    priced: false,
    params: [len(14), lvl("upper", "Overbought", 80, 50, 100), lvl("lower", "Oversold", 20, 0, 50)],
    levels: (p) => [p.lower, p.upper],
    compute: (c, _x, p) => [line("mfi", "MFI", "#43aa8b", mfi(c, p.length))],
  },
  {
    id: "ad",
    label: "Accumulation / Distribution",
    title: () => "A/D",
    group: "Volume",
    pane: "pane",
    priced: false,
    params: [],
    compute: (c) => [line("ad", "A/D", "#7bdff2", accDist(c))],
  },
  {
    id: "cmf",
    label: "Chaikin Money Flow (20)",
    title: (p) => `CMF ${p.length}`,
    group: "Volume",
    pane: "pane",
    priced: false,
    params: [len(20)],
    levels: () => [0],
    compute: (c, _x, p) => [line("cmf", "CMF", "#c792ea", cmf(c, p.length))],
  },
  {
    id: "volma",
    label: "Volume MA (20)",
    title: (p) => `Volume MA ${p.length}`,
    group: "Volume",
    pane: "pane",
    priced: false,
    params: [len(20)],
    compute: (c, _x, p) => [bar("vol", "Vol", "#8f939b", c.map((x) => x.volume)), line("volma", `MA ${p.length}`, "#ffd166", volumeMa(c, p.length))],
  },
  {
    id: "obv",
    label: "On-balance volume",
    title: () => "OBV",
    group: "Volume",
    pane: "pane",
    priced: false,
    params: [],
    compute: (c) => [line("obv", "OBV", "#7bdff2", obv(c))],
  },
  {
    id: "vprofile",
    label: "Volume profile (visible range)",
    title: (p) => `VP ${p.rows}`,
    group: "Volume",
    hint: "USDC traded at each price level in view, split buy / sell, with the point of control and value area",
    pane: "price",
    priced: true,
    special: true,
    params: [lvl("rows", "Rows", 24, 6, 120), lvl("width", "Width %", 28, 10, 60), lvl("va", "Value area %", 70, 50, 95)],
    compute: () => [],
  },
  {
    id: "netflow",
    label: "Net buy flow",
    title: () => "Net buy flow",
    group: "On-chain",
    hint: "USDC bought minus sold per candle, and its running total",
    pane: "pane",
    priced: false,
    params: [],
    compute: (c, ctx) => {
      const net = c.map((_, i) => (ctx.buyUsd[i] ?? 0) - (ctx.sellUsd[i] ?? 0));
      let run = 0;
      return [bar("netflow", "Net", "#8f939b", net), line("netflowCum", "Total", "#ffd166", net.map((v) => (run += v)))];
    },
  },
  {
    id: "buypressure",
    label: "Buy pressure %",
    title: () => "Buy pressure",
    group: "On-chain",
    hint: "Share of each candle's USDC volume that was buying",
    pane: "pane",
    priced: false,
    params: [],
    levels: () => [50],
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
    title: () => "Holders",
    group: "On-chain",
    hint: "Wallets holding the token at each candle's close",
    pane: "pane",
    priced: false,
    params: [],
    compute: (c, ctx) => [line("holders", "Holders", "#c792ea", aligned(c, ctx.holders))],
  },
];

export const STUDY_GROUPS: StudyGroup[] = ["Trend", "Bands", "Oscillators", "Volume", "On-chain"];

export const studyById = (id: StudyId) => STUDIES.find((s) => s.id === id)!;
export const isStudyId = (id: unknown): id is StudyId => STUDIES.some((s) => s.id === id);

// ------------------------------------------------------- instances on a chart

/**
 * A study on a chart, as the trader set it up: its settings (anything left out takes the default), each line's colour
 * and width, and whether it's hidden. Saved with the chart's layout.
 */
export type StudyInstance = { id: StudyId; params?: Params; colors?: Record<string, string>; widths?: Record<string, number>; hidden?: boolean };

/** The instance's settings, defaults filled in and clamped to each setting's limits. */
export function paramsOf(inst: StudyInstance): Params {
  const out: Params = {};
  for (const d of studyById(inst.id).params) {
    const v = inst.params?.[d.key];
    out[d.key] = typeof v === "number" && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.def;
  }
  return out;
}

/** Computes an instance: its lines with the trader's colours applied (widths are the engine's). */
export function computeInstance(inst: StudyInstance, candles: Candle[], ctx: StudyContext): StudyLine[] {
  const study = studyById(inst.id);
  return study.compute(candles, ctx, paramsOf(inst)).map((l) => ({ ...l, color: inst.colors?.[l.key] ?? l.color }));
}

/** Reads a saved list of studies: the old form (ids) and the new (instances). Unknown ids are dropped. */
export function readInstances(v: unknown): StudyInstance[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): StudyInstance[] => {
    if (isStudyId(x)) return [{ id: x }];
    if (x && typeof x === "object" && isStudyId((x as StudyInstance).id)) {
      const s = x as StudyInstance;
      return [{ id: s.id, params: s.params, colors: s.colors, widths: s.widths, hidden: s.hidden === true }];
    }
    return [];
  });
}
