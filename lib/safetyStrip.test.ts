import { test } from "node:test";
import assert from "node:assert/strict";
import { snipersOf, stripOf, top10Of } from "./safetyStrip.ts";
import type { CoinTrade } from "./coinMarket.ts";

const t = (time: number, trader: string, amount: number, side: "buy" | "sell" = "buy"): CoinTrade => ({ id: `${time}${trader}`, time, side, usd: 1, amount, price: 1, trader, tx: `${time}${trader}` });

test("top 10 leaves pools out and counts the 10 biggest wallets", () => {
  const holders = [{ owner: "pool", pct: 30, kind: "pool" as const }, ...Array.from({ length: 12 }, (_, i) => ({ owner: `w${i}`, pct: 2, kind: "wallet" as const }))];
  assert.equal(top10Of(holders), 20);
});

test("snipers: wallets other than the creator buying in the first 15 seconds, as a share of supply", () => {
  const trades = [t(1_000, "DEV", 50), t(2_000, "a", 10), t(9_000, "b", 20), t(9_500, "a", 5), t(30_000, "c", 100), t(5_000, "d", 7, "sell")];
  const s = snipersOf(trades, 1_000, 1_000, "dev")!;
  assert.equal(s.wallets, 2);
  assert.ok(Math.abs(s.pct - 3.5) < 1e-9);
});

test("snipers stay unknown when Crux's trades don't reach the start", () => {
  assert.equal(snipersOf([t(10 * 60_000, "a", 1)], 0, 1_000), null);
  assert.equal(snipersOf([], 0, 1_000), null);
  assert.equal(snipersOf([t(0, "a", 1)], 0, 0), null);
});

test("the strip: dev from its holder row, else the market's figure; no holders means unknown, not zero", () => {
  const s = stripOf({ holders: [{ owner: "X", pct: 4, kind: "creator" }], devPct: 9, trades: [], supply: 1, creator: "x" });
  assert.equal(s.dev, 4);
  assert.deepEqual(s.bundle, { wallets: 0, pct: 0 });
  const u = stripOf({ holders: null, devPct: 9, trades: [], supply: 1 });
  assert.equal(u.dev, 9);
  assert.equal(u.top10, undefined);
  assert.equal(u.bundle, undefined);
});
