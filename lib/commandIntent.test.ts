import assert from "node:assert/strict";
import test from "node:test";
import { describeStep, parseCommand } from "./commandIntent.ts";

const steps = (t: string) => {
  const r = parseCommand(t);
  if (!r.ok) throw new Error(`not understood: ${t}: ${r.error}`);
  return r.steps;
};
const fails = (t: string) => {
  const r = parseCommand(t);
  assert.equal(r.ok, false, t);
  return r.ok ? "" : r.error;
};

test("buys in dollars", () => {
  assert.deepEqual(steps("buy $25 of BONK"), [{ kind: "buy", coin: "BONK", usd: 25, chain: undefined }]);
  assert.deepEqual(steps("Buy 5 USDC of bt"), [{ kind: "buy", coin: "BT", usd: 5, chain: undefined }]);
  assert.deepEqual(steps("ape $10 into $wif"), [{ kind: "buy", coin: "WIF", usd: 10, chain: undefined }]);
  assert.deepEqual(steps("buy $2.50 of pepe on bnb"), [{ kind: "buy", coin: "PEPE", usd: 2.5, chain: "bnb" }]);
});

test("sells a share", () => {
  assert.deepEqual(steps("sell all BT"), [{ kind: "sell", coin: "BT", pct: 100, chain: undefined }]);
  assert.deepEqual(steps("sell half of PEPE on bnb"), [{ kind: "sell", coin: "PEPE", pct: 50, chain: "bnb" }]);
  assert.deepEqual(steps("sell 25% of bonk"), [{ kind: "sell", coin: "BONK", pct: 25, chain: undefined }]);
  assert.deepEqual(steps("sell wif"), [{ kind: "sell", coin: "WIF", pct: 100, chain: undefined }]);
});

test("a buy then a take profit on the same coin", () => {
  assert.deepEqual(steps("buy $10 of WIF and take profit at 2x"), [
    { kind: "buy", coin: "WIF", usd: 10, chain: undefined },
    { kind: "takeProfit", coin: "WIF", multiple: 2, pct: 100, chain: undefined },
  ]);
  assert.deepEqual(steps("buy $25 of BONK, then sell half at 3x"), [
    { kind: "buy", coin: "BONK", usd: 25, chain: undefined },
    { kind: "takeProfit", coin: "BONK", multiple: 3, pct: 50, chain: undefined },
  ]);
});

test("stop loss, trailing stop and dip buy", () => {
  assert.deepEqual(steps("stop loss 20% on BONK"), [{ kind: "stopLoss", coin: "BONK", dropPct: 20, pct: 100, chain: undefined }]);
  assert.deepEqual(steps("sell all wif if it drops 15%"), [{ kind: "stopLoss", coin: "WIF", dropPct: 15, pct: 100, chain: undefined }]);
  assert.deepEqual(steps("trailing stop 15% on WIF"), [{ kind: "trailing", coin: "WIF", trailPct: 15, pct: 100, chain: undefined }]);
  assert.deepEqual(steps("buy $10 of BONK if it drops 30%"), [{ kind: "dip", coin: "BONK", usd: 10, dropPct: 30, chain: undefined }]);
});

test("addresses are kept as they are", () => {
  const a = "0x627C5aaC31a203565e52945e8c8bc66dFdC85afe";
  assert.deepEqual(steps(`buy $5 of ${a}`), [{ kind: "buy", coin: a, usd: 5, chain: undefined }]);
  const m = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  assert.deepEqual(steps(`sell all ${m}`), [{ kind: "sell", coin: m, pct: 100, chain: undefined }]);
});

test("refuses what it can't read, plainly", () => {
  assert.match(fails("buy BONK"), /how much/);
  assert.match(fails("buy $5"), /Which coin/);
  assert.match(fails("send 5 SOL to my friend"), /didn't understand/);
  assert.match(fails(""), /Type/);
  assert.match(fails("take profit at 0.5x on BONK"), /above 1x/);
  assert.match(fails("sell 150% of BONK"), /between 1% and 100%/);
  assert.match(fails("buy $0 of BONK"), /above \$0/);
});

test("plain words for the card", () => {
  assert.equal(describeStep({ kind: "takeProfit", coin: "WIF", multiple: 2, pct: 50 }), "Sell half your WIF when it reaches 2× today's price");
  assert.equal(describeStep({ kind: "buy", coin: "BONK", usd: 5 }), "Buy $5 of BONK");
});
