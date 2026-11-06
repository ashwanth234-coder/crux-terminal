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
