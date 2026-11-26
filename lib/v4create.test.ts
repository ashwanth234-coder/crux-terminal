import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex, type Address } from "viem";
import { DEFAULT_MIX, DEFAULT_WINDOW, makeSaltKeeper, mixBps, mixProblem, previewLaunch, type SaltInput } from "./v4create.ts";
import { rulesText } from "./v4launch.ts";

const creator = "0x19d3e4b5369835dE24db4ae4B2F16c897867ecAB" as Address;
const input: SaltInput = { name: "Test", symbol: "TEST", metadataURI: "data:application/json;base64,e30=", creator };
/** Stands in for factory.coinInitCodeHash: different inputs, different hash. */
const hashOf = async (i: SaltInput) => keccak256(toHex(JSON.stringify(i)));

test("salt re-mined on edit: a changed name, ticker, metadata or wallet gets a new 5afe salt; unchanged reuses it", async () => {
  const saltFor = makeSaltKeeper(hashOf);
  const first = await saltFor(input);
  assert.equal(first.mined, true);
  assert.ok(first.coin.toLowerCase().endsWith("5afe"));
  const again = await saltFor({ ...input });
  assert.equal(again.mined, false);
  assert.equal(again.salt, first.salt);
  for (const edit of [{ name: "Test 2" }, { symbol: "TEST2" }, { metadataURI: "data:application/json;base64,e319" }, { creator: "0x000000000000000000000000000000000000bEEF" as Address }]) {
    const next = await saltFor({ ...input, ...edit });
    assert.equal(next.mined, true, JSON.stringify(edit));
    assert.ok(next.coin.toLowerCase().endsWith("5afe"));
    assert.notEqual(next.coin, first.coin);
  }
});

test("mix must total 100% in 10% steps", () => {
  assert.equal(mixProblem(DEFAULT_MIX), null);
  assert.equal(mixProblem({ you: 30, floor: 50, holders: 20 }), null);
  assert.match(mixProblem({ you: 30, floor: 50, holders: 10 }) ?? "", /100%/);
  assert.match(mixProblem({ you: 35, floor: 45, holders: 20 }) ?? "", /10% steps/);
  assert.match(mixProblem({ you: -10, floor: 100, holders: 10 }) ?? "", /10% steps/);
  assert.deepEqual(mixBps({ you: 30, floor: 50, holders: 20 }), { toCreatorBps: 3000, toLiquidityBps: 5000, toHoldersBps: 2000 });
});

test("the preview reads like the coin page: defaults are 1 minute, all to the locked floor", () => {
  const l = previewLaunch({ windowSec: DEFAULT_WINDOW, mix: DEFAULT_MIX, startBps: 5000, cruxEarlyBps: 1000 });
  assert.deepEqual(rulesText(l), ["Early buyers pay a fee for 1 minute.", "10% of it goes to Crux; the rest goes all to this coin's locked floor."]);
  assert.deepEqual(rulesText(previewLaunch({ windowSec: 0, mix: DEFAULT_MIX, startBps: 5000, cruxEarlyBps: 1000 })), ["No early fee: everyone pays the normal 1%."]);
});
