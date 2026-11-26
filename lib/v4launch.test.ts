import { test } from "node:test";
import assert from "node:assert/strict";
import { feeAt, rulesText, type V4Launch } from "./v4launch.ts";

const base: V4Launch = {
  launchedAt: 1000, windowSec: 300, startBps: 5000, cruxEarlyBps: 0, toCreatorBps: 0, toLiquidityBps: 10000, toHoldersBps: 0,
  feeBpsNow: 0, floorEth: BigInt(0), holdersEth: BigInt(0), creatorEth: BigInt(0), floorsPlaced: 0, reward: { posted: false, pot: BigInt(0), claimed: BigInt(0) },
};

test("the early fee starts at the start rate, halves at half the window, and is gone after it", () => {
  assert.equal(feeAt(base, 1000), 5000);
  assert.equal(feeAt(base, 1150), 2500);
  assert.equal(feeAt(base, 1300), 0);
  assert.equal(feeAt(base, 9999), 0);
  assert.equal(feeAt({ ...base, windowSec: 0 }, 1000), 0);
});

test("rules say it all goes to the locked floor", () => {
  const t = rulesText(base).join(" ");
  assert.match(t, /Early buyers pay a fee for 5 minutes\. It all goes to this coin's locked floor\./);
});

test("rules say half to the creator, half to holders", () => {
  const t = rulesText({ ...base, toCreatorBps: 5000, toLiquidityBps: 0, toHoldersBps: 5000 }).join(" ");
  assert.match(t, /half to the creator/);
  assert.match(t, /half to holders/);
});

test("no early fee window", () => {
  assert.deepEqual(rulesText({ ...base, windowSec: 0, startBps: 0 }), ["No early fee: everyone pays the normal 1%."]);
});
