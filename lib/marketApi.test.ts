import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { toCandles } from "./candles.ts";
import { fillToTrade, priceOf, swapToTrade } from "./tradeDecode.ts";

const SOLVER = "0x69E422d3Cca945a44210684b57F85f556212AD67" as Address;
const USER = "0x19d3e4b5369835dE24db4ae4B2F16c897867ecAB" as Address;
const at = { txHash: "0xabc" as Hex, blockNumber: BigInt(10), logIndex: 0 };
const e18 = BigInt(10) ** BigInt(18);

test("a Uniswap swap with USDC as token0: a buy, priced per whole token", () => {
  // 0.1 USDC in, 50M tokens out.
  const t = swapToTrade(
    { amount0In: BigInt(100_000), amount1In: BigInt(0), amount0Out: BigInt(0), amount1Out: BigInt(50_000_000) * e18, to: USER },
    true,
    18,
    SOLVER,
    at,
  );
  assert.equal(t.side, "buy");
  assert.equal(t.usdc, BigInt(100_000));
  assert.equal(t.tokens, BigInt(50_000_000) * e18);
  assert.equal(t.price, 0.1 / 50_000_000);
  assert.equal(t.venue, "uniswap-v2");
  assert.equal(t.viaIntent, false);
});

test("a sell with USDC as token1, filled for the Crux solver", () => {
  const t = swapToTrade(
    { amount0In: BigInt(1_000) * e18, amount1In: BigInt(0), amount0Out: BigInt(0), amount1Out: BigInt(2_500_000), to: SOLVER },
    false,
    18,
    SOLVER,
    at,
  );
  assert.equal(t.side, "sell");
  assert.equal(t.usdc, BigInt(2_500_000));
  assert.equal(t.price, 2.5 / 1_000);
  assert.equal(t.viaIntent, true);
});

test("a batch-pool fill carries its batch and its uniform price", () => {
  const buy = fillToTrade({ batch: BigInt(3), owner: USER, isBuy: true, amountIn: BigInt(200_000), amountOut: BigInt(80_000_000) * e18 }, 18, SOLVER, at);
  assert.equal(buy.venue, "batch-pool");
  assert.equal(buy.batch, 3);
  assert.equal(buy.side, "buy");
  assert.equal(buy.price, priceOf(BigInt(200_000), BigInt(80_000_000) * e18, 18));
  const sell = fillToTrade({ batch: BigInt(3), owner: USER, isBuy: false, amountIn: BigInt(10) * e18, amountOut: BigInt(5) }, 18, SOLVER, at);
  assert.equal(sell.side, "sell");
  assert.equal(sell.usdc, BigInt(5));
});

test("candles open at the clearing price, then at each previous close; volume and trades add up", () => {
  const fills = [
    { time: 970, price: 2, usdc: BigInt(1_000_000) },
    { time: 1_010, price: 3, usdc: BigInt(500_000) }, // the same minute (960–1019)
    { time: 1_250, price: 1.5, usdc: BigInt(250_000) }, // a later minute, after a quiet one
  ];
  const candles = toCandles(fills, 60, 1);
  assert.deepEqual(
    candles.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume, c.trades]),
    [
      [960, 1, 3, 1, 3, 1.5, 2],
      [1_200, 3, 3, 1.5, 1.5, 0.25, 1],
    ],
  );
});

test("candles ignore zero-price fills and sort by time", () => {
  const candles = toCandles(
    [
      { time: 200, price: 4, usdc: BigInt(1) },
      { time: 100, price: 0, usdc: BigInt(1) },
      { time: 90, price: 2, usdc: BigInt(1) },
    ],
    60,
  );
  assert.deepEqual(
    candles.map((c) => [c.time, c.open, c.close]),
    [
      [60, 2, 2],
      [180, 2, 4],
    ],
  );
});
