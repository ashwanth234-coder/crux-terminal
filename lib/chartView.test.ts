import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_RANGE_SHARE, widenRange, withLatestTrades } from "./chartView.ts";

test("widenRange: a range narrower than 12% of the price is widened around its middle; a wider one is kept", () => {
  // The first candle of a new launch: the clearing price $1.67 to a trade at $1.71 (2.4%).
  const r = widenRange({ minValue: 1.67, maxValue: 1.71 });
  assert.ok(Math.abs(r.maxValue - r.minValue - 1.69 * MIN_RANGE_SHARE) < 1e-9);
  assert.ok(Math.abs((r.minValue + r.maxValue) / 2 - 1.69) < 1e-9, "centred");
  assert.deepEqual(widenRange({ minValue: 1, maxValue: 2 }), { minValue: 1, maxValue: 2 });
  assert.deepEqual(widenRange({ minValue: 0, maxValue: 0 }), { minValue: 0, maxValue: 0 }, "nothing to widen around");
});

test("withLatestTrades: a trade the candles don't count yet moves the newest candle, or opens the next", () => {
  const candles = [{ time: 100, open: 1, high: 1.1, low: 1, close: 1.05, volume: 5, trades: 2 }];
  const t = (time: number, price: number) => ({ time, price, blockNumber: BigInt(time) });
  // Newest first: a trade in the same second at a new high, then one in the next second.
  const out = withLatestTrades(candles, [t(101, 1.3), t(100, 1.2), t(99, 0.5)], 1);
  assert.deepEqual(out[0], { time: 100, open: 1, high: 1.2, low: 1, close: 1.2, volume: 5, trades: 2 }, "the old trade at 99 is ignored");
  assert.deepEqual(out[1], { time: 101, open: 1.2, high: 1.3, low: 1.2, close: 1.3, volume: 0, trades: 0 });
  assert.equal(candles.length, 1, "the input isn't changed");
  assert.equal(withLatestTrades(candles, [t(50, 2)], 1), candles, "nothing new: the same array");
});

test("openingInterval: a token under an hour old opens on 1s; an older one on the finest that fits ~200 candles", async () => {
  const { openingInterval } = await import("./chartView.ts");
  assert.equal(openingInterval(1_000, 1_000 + 35 * 60), 1, "35 minutes old: every trade its own candle");
  assert.equal(openingInterval(1_000, 1_000 + 3 * 3_600), 60, "3 hours old: 1m");
});

test("trades chart at the price they leave: a big sell then a buy draws the buy green, not red", async () => {
  const { withLatestTrades, chartPrice } = await import("./chartView.ts");
  // After a sell from $69 to $13 (average $39), a buy takes it from $13 to $35 (average $27).
  const sell = { time: 60, price: 39, priceAfter: 13, blockNumber: BigInt(1) };
  const buy = { time: 120, price: 27, priceAfter: 35, blockNumber: BigInt(2) };
  const base = [{ time: 0, open: 69, high: 69, low: 69, close: 69, volume: 0, trades: 1 }];
  const out = withLatestTrades(base, [buy, sell], 60);
  assert.equal(out[1].close, 13, "the sell's candle closes where it left the price");
  assert.ok(out[2].close > out[2].open, "the buy's candle is green");
  assert.equal(chartPrice({ price: 5 }), 5, "without priceAfter: the average");
});
