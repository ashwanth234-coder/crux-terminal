import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "./candles.ts";
import { bollinger, ema, emaOf, macd, rsi, sma, smaOf } from "./indicators.ts";

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
