import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "./candles.ts";
import { STUDIES, paramsOf, adx, aroon, atr, bollinger, cci, donchian, ema, emaOf, flowByCandle, holdersByCandle, macd, obv, psar, rsi, sma, smaOf, stochRsi, supertrend, williamsR, wmaOf } from "./indicators.ts";

const candles = (closes: number[]): Candle[] => closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 1, trades: 1 }));
const near = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("SMA and EMA warm up, then track", () => {
  assert.deepEqual(smaOf([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const e = ema(candles([1, 2, 3, 4]), 2);
  assert.equal(e[0], null);
  near(e[1], 1.5); // seeded with the SMA
  near(e[2], 3 * (2 / 3) + 1.5 / 3);
  assert.deepEqual(sma(candles([2, 4]), 2), [null, 3]);
});

test("EMA of a series with leading gaps starts after them", () => {
  const e = emaOf([null, null, 2, 4], 2);
  assert.deepEqual(e.slice(0, 3), [null, null, null]);
  near(e[3], 3);
});

test("Bollinger: a flat series has zero width", () => {
  const b = bollinger(candles(Array(25).fill(5)), 20, 2);
  assert.equal(b.mid[18], null);
  near(b.mid[19], 5);
  near(b.upper[24], 5);
  near(b.lower[24], 5);
});

test("Bollinger: width is 2 population SDs", () => {
  const b = bollinger(candles([1, 3]), 2, 2);
  near(b.mid[1], 2);
  near(b.upper[1], 4); // sd = 1
  near(b.lower[1], 0);
});

test("RSI: only gains is 100, only losses is 0, flat is 50, first value at n", () => {
  const up = rsi(candles([1, 2, 3, 4, 5]), 3);
  assert.deepEqual(up.slice(0, 3), [null, null, null]);
  near(up[3], 100);
  near(rsi(candles([5, 4, 3, 2, 1]), 3)[4], 0);
  near(rsi(candles([2, 2, 2, 2]), 3)[3], 50);
});

test("RSI matches Wilder's smoothing on a mixed series", () => {
  // n = 2: changes +1, -1, +2. Seed avg gain 0.5, loss 0.5 → 50; then gain (0.5+2)/2 = 1.25, loss 0.25 → 83.33…
  const r = rsi(candles([1, 2, 1, 3]), 2);
  near(r[2], 50);
  near(r[3], 100 - 100 / (1 + 1.25 / 0.25));
});

test("MACD: zero on a flat series once warmed up; histogram = MACD − signal", () => {
  const m = macd(candles(Array(40).fill(7)));
  assert.equal(m.macd[24], null);
  near(m.macd[25], 0);
  near(m.signal[33], 0);
  near(m.hist[39], 0);
  const r = macd(candles(Array.from({ length: 60 }, (_, i) => 1 + i * 0.1)));
  near(r.hist[59], (r.macd[59] as number) - (r.signal[59] as number));
  assert.ok((r.macd[59] as number) > 0, "a rising market has a positive MACD");
});

const bars = (rows: [number, number, number][]): Candle[] => rows.map(([h, l, c], i) => ({ time: i, open: c, high: h, low: l, close: c, volume: 1, trades: 1 }));

test("ATR: plain mean of the first n true ranges, then Wilder", () => {
  const a = atr(bars([[2, 1, 1.5], [3, 1, 2], [4, 3, 3.5]]), 2);
  assert.equal(a[0], null);
  near(a[1], (1 + 2) / 2);
  // TR(2) = max(1, |4 − 2|, |3 − 2|) = 2 → (1.5 + 2) / 2.
  near(a[2], 1.75);
});

test("Supertrend holds support under a rising market and flips to resistance on a crash", () => {
  const up = Array.from({ length: 30 }, (_, i) => [11 + i, 9 + i, 10 + i] as [number, number, number]);
  const s = supertrend(bars([...up, [20, 1, 2]]), 10, 3);
  assert.ok(s.up[28] !== null && s.down[28] === null);
  assert.ok((s.up[28] as number) < 38);
  assert.equal(s.up[30], null);
  assert.ok(s.down[30] !== null);
});

test("Donchian, Stoch RSI and OBV", () => {
  const d = donchian(bars([[2, 1, 1], [5, 3, 4], [4, 0, 2]]), 2);
  assert.equal(d.upper[1], 5);
  assert.equal(d.lower[2], 0);
  near(d.mid[2], 2.5);
  const k = stochRsi(candles(Array.from({ length: 40 }, (_, i) => 1 + (i % 5))));
  const lastK = k.k[39];
  assert.ok(lastK !== null && lastK >= 0 && lastK <= 100);
  assert.deepEqual(obv(candles([1, 2, 1, 1])), [0, 1, 0, 0]);
});

test("on-chain inputs: flow lands in its candle, holders replay transfers", () => {
  const f = flowByCandle([0, 60], 60, [
    { time: 10, side: "buy", usd: 5 },
    { time: 70, side: "sell", usd: 2 },
    { time: 75, side: "buy", usd: 1 },
    { time: 500, side: "buy", usd: 9 },
  ]);
  assert.deepEqual(f.buyUsd, [5, 1]);
  assert.deepEqual(f.sellUsd, [0, 2]);
  const POOL = "0xpool";
  const h = holdersByCandle(
    [0, 60, 120],
    60,
    [
      { from: POOL, to: "0xa", value: BigInt(5), time: 1 },
      { from: POOL, to: "0xb", value: BigInt(5), time: 2 },
      { from: "0xa", to: POOL, value: BigInt(5), time: 61 },
    ],
    new Set([POOL]),
  );
  assert.deepEqual(h, [2, 1, 1]);
});

test("WMA, Williams %R, CCI and Aroon on known values", () => {
  assert.deepEqual(wmaOf([1, 2, 3], 3), [null, null, (1 + 4 + 9) / 6]);
  const r = williamsR(bars([[10, 0, 5], [10, 0, 10]]), 2);
  near(r[1], 0);
  const flat = cci(candles([5, 5, 5, 5]), 3);
  assert.equal(flat[3], 0);
  const a = aroon(bars([[1, 0, 1], [2, 1, 2], [3, 2, 3]]), 2);
  near(a.up[2], 100);
});

test("Parabolic SAR stays under a rising market, ADX is high in a clean trend", () => {
  const up = bars(Array.from({ length: 40 }, (_, i) => [11 + i, 9 + i, 10 + i] as [number, number, number]));
  const s = psar(up);
  assert.ok((s[30] as number) < up[30].low);
  const d = adx(up);
  assert.ok((d.adx[39] as number) > 50);
  assert.ok((d.plus[39] as number) > (d.minus[39] as number));
});

test("every study computes on a long random walk without throwing or NaN", () => {
  let p = 100;
  const cs: Candle[] = Array.from({ length: 300 }, (_, i) => {
    const o = p;
    p = Math.max(1, p + Math.sin(i) * 3 + (i % 7) - 3);
    return { time: i * 60, open: o, high: Math.max(o, p) + 1, low: Math.min(o, p) - 1, close: p, volume: 1 + (i % 5), trades: 1 };
  });
  const ctx = { buyUsd: cs.map(() => 1), sellUsd: cs.map(() => 0.5), holders: cs.map((_, i) => i) };
  for (const s of STUDIES.filter((x) => !x.special)) {
    const lines = s.compute(cs, ctx, paramsOf({ id: s.id }));
    for (const line of lines) {
      assert.equal(line.values.length, cs.length, s.id);
      assert.ok(line.values.every((v) => v === null || Number.isFinite(v)), `${s.id} ${line.key}`);
    }
    // Some lines are one-sided by design (Supertrend's down line in an uptrend), but every study shows something.
    assert.ok(lines.some((l) => l.values.some((v) => v !== null)), `${s.id} has values`);
  }
});

test("volume profile: the busiest level is the point of control, the value area holds its share", async () => {
  const { volumeProfile } = await import("./volumeProfile.ts");
  const cs = bars([[2, 1, 1.5], [2, 1, 1.5], [10, 9, 9.5]]);
  const p = volumeProfile(cs, [1, 1, 0], [0, 0, 1], 9, 70)!;
  assert.ok(p.rows[p.poc].lo < 2, "POC in the 1–2 band where two candles traded");
  const buy = p.rows.reduce((t, r) => t + r.buy, 0);
  near(buy, 2);
  near(p.total, 3);
  const inVa = p.rows.slice(p.vaLo, p.vaHi + 1).reduce((t, r) => t + r.buy + r.sell, 0);
  assert.ok(inVa >= 0.7 * p.total);
});
