import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeText, clusterBadges, continuous, graduationTime, matchExecutions, withLiveBar, withPendingTrades, type BadgeFill } from "./chartLive.ts";

const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 3, trades: 1 });

test("withLiveBar: a flat bar opens for the running period once the newest candle's is over, and only then", () => {
  const candles = [bar(100, 2), bar(105, 3)];
  assert.equal(withLiveBar(candles, 109, 5), candles, "still inside the newest candle's period");
  const out = withLiveBar(candles, 111, 5);
  assert.deepEqual(out[2], { time: 110, open: 3, high: 3, low: 3, close: 3, volume: 0, trades: 0 });
  assert.equal(candles.length, 2, "the input isn't changed");
  // An hour later there is still one live bar, not one per quiet period.
  assert.equal(withLiveBar(candles, 3_711, 5).length, 3);
  assert.equal(withLiveBar(candles, 3_711, 5)[2].time, 3_710);
  assert.equal(withLiveBar(candles, null, 5), candles);
  assert.equal(withLiveBar([], 111, 5).length, 0);
});

test("withPendingTrades: a trade on its way moves the newest bar; one already on the chart isn't counted twice", () => {
  const candles = [bar(100, 2)];
  const out = withPendingTrades(candles, [{ at: 100_400, price: 2, expected: 2.5, usdc: 1 }], new Set(), 1);
  assert.deepEqual(out[0], { time: 100, open: 2, high: 2.5, low: 2, close: 2.5, volume: 4, trades: 2 });
  // Pressed after the bar's second was up: it opens the next bar from the last close.
  const next = withPendingTrades(candles, [{ at: 101_200, price: 2, expected: 1.5 }], new Set(), 1);
  assert.deepEqual(next[1], { time: 101, open: 2, high: 2, low: 1.5, close: 1.5, volume: 0, trades: 1 });
  assert.equal(withPendingTrades(candles, [{ at: 100_400, price: 2, expected: 2.5, tx: "0xAB" }], new Set(["0xab"]), 1), candles);
});

test("withPendingTrades: a price that isn't a positive number never reaches the candle", () => {
  const candles = [bar(100, 2)];
  for (const expected of [NaN, Infinity, 0, -1]) {
    const out = withPendingTrades(candles, [{ at: 100_400, price: NaN, expected, usdc: NaN }], new Set(), 1);
    assert.deepEqual(out[0], { time: 100, open: 2, high: 2, low: 2, close: 2, volume: 3, trades: 2 }, String(expected));
  }
  // A bad quote falls back to the price at the click.
  assert.equal(withPendingTrades(candles, [{ at: 100_400, price: 2.2, expected: NaN }], new Set(), 1)[0].close, 2.2);
});

test("graduationTime: the first trade off the curve, or null while it all trades on the curve", () => {
  const t = (time: number, venue: string) => ({ time, venue });
  assert.equal(graduationTime([t(10, "curve"), t(12, "curve")]), null);
  assert.equal(graduationTime([t(30, "uniswap-v2"), t(20, "uniswap-v2"), t(12, "curve")]), 20, "newest first");
  assert.equal(graduationTime([]), null);
});

test("clusterBadges: one buy and one sell badge per candle, the creator's label first, newest trade first", () => {
  const f = (who: string, side: "buy" | "sell", label: string, at: number): BadgeFill => ({ who, side, label, usd: 1, tokens: 10, price: 0.1, at });
  const out = clusterBadges(
    new Map([
      [100, [f("me", "buy", "B", 1), f("dev", "buy", "DB", 2), f("whale", "buy", "WB", 3), f("dev", "sell", "DS", 4)]],
      [101, [f("top", "sell", "TS", 5)]],
    ]),
  );
  assert.equal(out.length, 3);
  const buys = out.find((b) => b.time === 100 && b.side === "buy")!;
  assert.equal(buys.label, "DB");
  assert.equal(buys.count, 3);
  assert.deepEqual(buys.fills.map((x) => x.at), [3, 2, 1]);
  assert.equal(badgeText(buys.label, buys.count), "DB×3");
  assert.equal(badgeText("DS", 1), "DS");
  assert.equal(badgeText("B", 250), "B×99+");
});

test("matchExecutions: each mark gets its own swap's price, by transaction or by side, amount and time", () => {
  const swaps = [
    { time: 100, side: "buy" as const, usdc: 1, tokens: 1000, txHash: "0xA1" },
    { time: 100, side: "buy" as const, usdc: 2, tokens: 1000, txHash: "0xa2" },
    { time: 131, side: "sell" as const, usdc: 3, tokens: 500, txHash: "0xa3" },
  ];
  const out = matchExecutions(
    [
      { time: 100, side: "buy", tokens: 1000, txHash: "0xa1" }, // its own transaction
      { time: 101, side: "buy", tokens: 1000, txHash: "0xff" }, // delivered in another: the other buy of that size
      { time: 102, side: "buy", tokens: 1000, txHash: "0xfe" }, // both buys are taken: no price, never a shared one
      { time: 105, side: "sell", tokens: 500 }, // escrowed at the click, sold 26 s later
      { time: 105, side: "sell", tokens: 9 },
    ],
    swaps,
  );
  assert.deepEqual(out[0], { usd: 1, price: 0.001 });
  assert.deepEqual(out[1], { usd: 2, price: 0.002 });
  assert.equal(out[2], null);
  assert.deepEqual(out[3], { usd: 3, price: 0.006 });
  assert.equal(out[4], null);
});

test("continuous: each candle opens at the previous close, with its high and low taking that open in", () => {
  const c = (time: number, open: number, high: number, low: number, close: number) => ({ time, open, high, low, close, volume: 1, trades: 1 });
  const ok = [c(1, 1, 2, 1, 2), c(2, 2, 3, 2, 3)];
  assert.equal(continuous(ok), ok, "already continuous: the same array");
  // A one-trade candle the feed drew flat at its own price (a dash) gets its body from the last close.
  const out = continuous([c(1, 1, 2, 1, 2), c(2, 3, 3, 3, 3), c(3, 2.5, 2.5, 2.5, 2.5)]);
  assert.deepEqual(out[1], c(2, 2, 3, 2, 3));
  assert.deepEqual(out[2], c(3, 3, 3, 2.5, 2.5));
  assert.deepEqual(out[0], c(1, 1, 2, 1, 2), "the first keeps its open");
});
