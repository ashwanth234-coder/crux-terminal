import assert from "node:assert/strict";
import test from "node:test";
import { entryPrice, pnlOf, pnlText, type Position } from "./pnl.ts";

const pos = (usd6: number, units: string): Position => ({ chain: "solana", coin: "M", boughtUsd6: String(usd6), boughtUnits: units, soldUsd6: "0", soldUnits: "0", updatedAt: 0 });

test("entry price per whole coin", () => {
  // $1 for 64.17 coins of 6 decimals.
  assert.ok(Math.abs(entryPrice(pos(1_000_000, "64170000"), 6)! - 0.015584) < 1e-6);
  assert.equal(entryPrice(pos(0, "1"), 6), undefined);
});

test("profit / loss on the holding", () => {
  const p = pnlOf(64.17, 0.01781, 0.015584);
  assert.ok(Math.abs(p.pct - 14.28) < 0.05);
  assert.equal(pnlText(p), "+$0.14 (+14.3%)");
  assert.equal(pnlText(pnlOf(10, 0.9, 1)), "−$1.00 (−10.0%)");
});
