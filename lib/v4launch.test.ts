import { test } from "node:test";
import assert from "node:assert/strict";
import { earlyFeeNote, feeAt, readV4Launch, rulesText, type V4Launch } from "./v4launch.ts";

const base: V4Launch = {
  launchedAt: 1000, windowSec: 300, startBps: 5000, cruxEarlyBps: 0, toCreatorBps: 0, toLiquidityBps: 10000, toHoldersBps: 0,
  floorEth: BigInt(0), holdersEth: BigInt(0), floorsPlaced: 0, reward: { posted: false, pot: BigInt(0), claimed: BigInt(0), swept: false },
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

test("Crux's share comes off the top, then the rest follows the creator's mix", () => {
  const c = { ...base, cruxEarlyBps: 1000 };
  assert.deepEqual(rulesText(c), ["Early buyers pay a fee for 5 minutes.", "10% of it goes to Crux; the rest goes all to this coin's locked floor."]);
  assert.equal(rulesText({ ...c, toLiquidityBps: 5000, toHoldersBps: 5000 })[1], "10% of it goes to Crux; the rest goes half to this coin's locked floor, half to holders.");
  assert.equal(rulesText({ ...c, toCreatorBps: 6000, toLiquidityBps: 0, toHoldersBps: 4000 })[1], "10% of it goes to Crux; the rest goes 60% to the creator, 40% to holders.");
});

test("a one-minute window reads in the singular", () => {
  assert.equal(rulesText({ ...base, windowSec: 60 })[0], "Early buyers pay a fee for 1 minute.");
});

test("a coin that isn't a Crux launch reads as null", async () => {
  const client = { readContract: async () => ({ launchedAt: 0 }), multicall: async () => { throw new Error("no"); } };
  assert.equal(await readV4Launch(client as never, "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"), null);
});

test("the buy panel's early-fee warning: the fee now, the time left and where it goes; nothing once it's over", () => {
  const c = { ...base, cruxEarlyBps: 1000 };
  const n = earlyFeeNote(c, 1150)!;
  assert.equal(n.bps, 2500);
  assert.equal(n.left, 150);
  assert.equal(n.text, "Early fee now 25% of what you pay, for 2:30 more. 10% of it goes to Crux; the rest goes all to this coin's locked floor.");
  assert.equal(earlyFeeNote(c, 1300), null);
  assert.equal(earlyFeeNote({ ...c, windowSec: 0, startBps: 0 }, 1000), null);
  assert.equal(earlyFeeNote(c, 1299)!.text.startsWith("Early fee now 1% of what you pay, for 0:01 more."), true);
});
