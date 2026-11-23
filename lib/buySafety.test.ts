import assert from "node:assert/strict";
import test from "node:test";
import { buyClear, classify, isBlocking, NOT_CHECKED } from "./buySafety.ts";

test("traps are blocked, the rest are warnings to accept", () => {
  assert.equal(isBlocking("Can't be sold (honeypot)"), true);
  assert.equal(isBlocking("Can't sell everything"), true);
  assert.equal(isBlocking("Owner can change balances"), true);
  assert.equal(isBlocking("Sell tax 45%"), true);
  assert.equal(isBlocking("Sell tax 5%"), false);
  assert.equal(isBlocking("Its creator has launched 90 coins"), false);
});

test("classify and clear", () => {
  const c = classify(["Can't be sold (honeypot)", "Hidden owner"], 50_000);
  assert.deepEqual(c, { blocks: ["Can't be sold (honeypot)"], warnings: ["Hidden owner"], checked: true });
  assert.equal(buyClear(c, true), false);
  const w = classify(["Its creator has launched 90 coins"], 50_000);
  assert.equal(buyClear(w, false), false);
  assert.equal(buyClear(w, true), true);
  assert.equal(buyClear(classify([], 50_000), false), true);
  assert.deepEqual(classify(null), { blocks: [], warnings: [NOT_CHECKED], checked: false });
  assert.equal(classify([], 400).blocks.length, 1);
});
