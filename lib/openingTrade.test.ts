import { test } from "node:test";
import assert from "node:assert/strict";
import { openingTrade } from "./openingTrade.ts";

const e18 = BigInt(10) ** BigInt(18);
// CDEMO: 600M tokens sold at 5e15 (factory units, $0.000000005 a token) raised $3.
const base = { status: 1, settledAt: 1_793_773_258, clearingPrice: BigInt(5) * BigInt(10) ** BigInt(15), saleSupply: BigInt(600_000_000) * e18, bidderCount: 1 };

test("a graduated launch's opening is its first trade: the raise at the clearing price", () => {
  const o = openingTrade(base)!;
  assert.equal(o.time, base.settledAt);
  assert.equal(o.usdc, BigInt(3_000_000));
  assert.equal(o.tokens, base.saleSupply);
  assert.ok(Math.abs(o.price - 0.000000005) < 1e-18);
  assert.equal(o.buyers, 1);
});

test("no opening trade before graduation, or for a cancelled launch", () => {
  assert.equal(openingTrade({ ...base, status: 0 }), null);
  assert.equal(openingTrade({ ...base, status: 2, clearingPrice: BigInt(0) }), null);
});
