import assert from "node:assert/strict";
import test from "node:test";
import { initialsShare, reviewCards, type ReviewInput, type ReviewRow } from "./coachReview.ts";
import { twoXNoPlan, type CoinRef } from "./coach.ts";

const now = 5_000_000_000;
const DAY = 86_400_000;
const BONK: CoinRef = { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK" };
const coin = (i: number): CoinRef => ({ chain: "base", address: `0x${String(i).padStart(40, "0")}`, symbol: `C${i}` });
const row = (o: Partial<ReviewRow> & { coin: CoinRef }): ReviewRow => ({ held: 1, price: 1, hasFloor: true, marketCash: 1_000_000, ...o });
const input = (o: Partial<ReviewInput>): ReviewInput => ({ rows: [], cashUsd: 0, peaks: {}, server: [], dismissed: {}, boughtThisSession: false, lossesToday: 0, now, ...o });
const rules = (i: ReviewInput) => reviewCards(i).map((c) => `${c.rule}${c.coin ? `:${c.coin.symbol}` : ""}`);

test("a server alert wins its coin's one card over the page's own", () => {
  const server = [twoXNoPlan({ coin: BONK, price: 2, entry: 1, hasTakeProfit: false }, now - 60_000)!];
  // BONK: 2x and no floor, worth $20 out of $25 (80%): the page would say noFloor or concentration.
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 10, price: 2, entry: 1, hasFloor: false })], cashUsd: 5, server })), ["twoXNoPlan:BONK"]);
});

test("the page's rules from the holdings: no floor, oversized, pullback, concentration", () => {
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 5, hasFloor: false })], cashUsd: 10 })), ["noFloor:BONK"]);
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 50, marketCash: 1_000 })], cashUsd: 10 })), ["oversized:BONK"]);
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 5, price: 0.5 })], cashUsd: 10, peaks: { [`solana:${BONK.address}`]: 1 } })), ["pullback:BONK"]);
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 70 })], cashUsd: 30 })), ["concentration:BONK"]);
});

test("dead bags: a fresh $1 buy at $0.98 is not dead; an old -70% one is; idle cash, but not after a loss", () => {
  const fresh = row({ coin: coin(1), price: 0.98, entry: 1, heldMs: 60_000 });
  const old = row({ coin: coin(2), price: 0.3, entry: 1, heldMs: 2 * DAY });
  assert.deepEqual(rules(input({ rows: [fresh], cashUsd: 10 })), []);
  assert.deepEqual(rules(input({ rows: [fresh, old], cashUsd: 50 })), ["deadBags", "idleCash"]);
  assert.deepEqual(rules(input({ rows: [fresh, old], cashUsd: 50, lossesToday: 1 })), ["deadBags"]);
});

test("a dismissed card stays away for its quiet period, and coins with no price are skipped", () => {
  const r = [row({ coin: BONK, held: 5, hasFloor: false })];
  assert.deepEqual(rules(input({ rows: r, cashUsd: 10, dismissed: { [`noFloor|solana:${BONK.address}`]: now - 60_000 } })), []);
  assert.deepEqual(rules(input({ rows: [row({ coin: BONK, held: 5, price: undefined, hasFloor: false })], cashUsd: 10 })), []);
});

test("taking initials: the share that gets back what was paid", () => {
  assert.equal(initialsShare(5, 12), 42);
  assert.equal(initialsShare(5, 5), null); // not up: nothing to take out
  assert.equal(initialsShare(5, 4), null);
});

test("server alerts that went stale, or are about coins no longer held, are dropped", () => {
  const fresh = twoXNoPlan({ coin: BONK, price: 2, entry: 1, hasTakeProfit: false }, now - 60_000)!;
  const old = { ...fresh, at: now - 7 * 3_600_000 }; // past its 6 h quiet period
  const held = [row({ coin: BONK, held: 10, price: 2, entry: 1 })];
  assert.deepEqual(rules(input({ rows: held, cashUsd: 15, server: [old] })), []);
  assert.deepEqual(rules(input({ rows: [], cashUsd: 5, server: [fresh] })), []);
  assert.deepEqual(rules(input({ rows: held, cashUsd: 15, server: [fresh] })), ["twoXNoPlan:BONK"]);
});
