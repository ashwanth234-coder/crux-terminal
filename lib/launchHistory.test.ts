import { test } from "node:test";
import assert from "node:assert/strict";
import { joinLaunch, launchCandles } from "./launchHistory.ts";
import type { CoinTrade } from "./coinMarket.ts";

const tr = (sec: number, tx: string, price = 0.001, usd = 10): CoinTrade => ({ id: tx, time: sec * 1000, side: "buy", usd, amount: usd / price, price, trader: "w", tx });

test("launch trades join behind the market's, newest first, each once", () => {
  const market = [tr(500, "m2"), tr(400, "m1")];
  const launch = [tr(100, "l1"), tr(200, "l2"), tr(400, "m1")];
  assert.deepEqual(joinLaunch(market, launch).map((t) => t.tx), ["m2", "m1", "l2", "l1"]);
  assert.deepEqual(joinLaunch(market, null).map((t) => t.tx), ["m2", "m1"]);
});

test("launch candles cover only the time before the market's first candle", () => {
  const launch = [tr(0, "a", 0.001), tr(30, "b", 0.002), tr(65, "c", 0.003), tr(130, "d", 0.004)];
  const c = launchCandles(launch, 120, 60);
  assert.deepEqual(c.map((x) => [x.time, x.open > 0, x.high, x.close]), [[0, true, 0.002, 0.002], [60, true, 0.003, 0.003]]);
  assert.deepEqual(launchCandles(null, 120, 60), []);
  // A trade with no dollar price (SOL's price unknown) is left out rather than drawn at zero.
  assert.equal(launchCandles([tr(0, "z", 0)], 120, 60).length, 0);
});
