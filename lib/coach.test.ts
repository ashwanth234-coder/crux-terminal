import assert from "node:assert/strict";
import test from "node:test";
import {
  capCards,
  cashLeaving,
  concentration,
  creatorSelling,
  deadBags,
  idleCash,
  nearFloor,
  noFloor,
  oversized,
  pullback,
  quiet,
  twoXNoPlan,
  type Card,
  type CoinRef,
} from "./coach.ts";

const BONK: CoinRef = { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK" };
const WIF: CoinRef = { chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF" };
const now = 1_000_000_000;
const coin = (i: number): CoinRef => ({ chain: "base", address: `0x${String(i).padStart(40, "0")}`, symbol: `C${i}` });
const DAY = 86_400_000;

test("2x with no plan: fires at 2x without a take-profit, silent below it, with one, or without a price", () => {
  const c = twoXNoPlan({ coin: BONK, price: 2, entry: 1, hasTakeProfit: false }, now);
  assert.equal(c?.rule, "twoXNoPlan");
  assert.equal(c?.urgency, 2);
  assert.equal(c?.text, "Up 2× on $BONK and no exit plan? Bold. Lock some in?");
  assert.deepEqual(
    c?.actions.map((a) => a.command),
    [`sell half of ${BONK.address} on solana`, `stop loss 25% on ${BONK.address} on solana`],
  );
  assert.equal(twoXNoPlan({ coin: BONK, price: 1.99, entry: 1, hasTakeProfit: false }, now), null);
  assert.equal(twoXNoPlan({ coin: BONK, price: 3, entry: 1, hasTakeProfit: true }, now), null);
  assert.equal(twoXNoPlan({ coin: BONK, price: undefined, entry: 1, hasTakeProfit: false }, now), null);
});

test("creator selling: urgent, serious, 20% or more", () => {
  const c = creatorSelling({ coin: BONK, soldPct: 35, all: false }, now)!;
  assert.equal(c.urgency, 3);
  assert.equal(c.text, "The creator of $BONK just sold 35% of their coins.");
  assert.deepEqual(c.actions.map((a) => a.label), ["Sell all", "Sell half"]);
  assert.equal(creatorSelling({ coin: BONK, soldPct: 100, all: true }, now)!.text, "The creator of $BONK sold everything they held.");
  assert.equal(creatorSelling({ coin: BONK, soldPct: 19, all: false }, now), null);
});

test("cash leaving: 30% under the hour's high fires, 29% doesn't, unknown is silent", () => {
  assert.equal(cashLeaving({ coin: BONK, cashNow: 70_000, cashHigh1h: 100_000 }, now)?.urgency, 3);
  assert.equal(cashLeaving({ coin: BONK, cashNow: 71_000, cashHigh1h: 100_000 }, now), null);
  assert.equal(cashLeaving({ coin: BONK, cashNow: undefined, cashHigh1h: 100_000 }, now), null);
  assert.equal(cashLeaving({ coin: BONK, cashNow: 1, cashHigh1h: undefined }, now), null);
});

test("near floor: within 5% above the floor fires; further away, below it, or no floor is silent", () => {
  const c = nearFloor({ coin: BONK, price: 0.78, floor: 0.75, dropPct: 25 }, now)!;
  assert.equal(c.text, "$BONK is close to your floor (−25%).");
  assert.deepEqual(c.actions.map((a) => a.label), ["Sell now", "Keep my floor"]);
  assert.equal(c.actions[1].command, "");
  assert.equal(nearFloor({ coin: BONK, price: 0.79, floor: 0.75, dropPct: 25 }, now), null);
  assert.equal(nearFloor({ coin: BONK, price: 0.74, floor: 0.75, dropPct: 25 }, now), null);
  assert.equal(nearFloor({ coin: BONK, price: 0.76, floor: undefined, dropPct: 25 }, now), null);
});

test("oversized: over 3% of the coin's market cash", () => {
  assert.equal(oversized({ coin: BONK, valueUsd: 31, marketCash: 1_000 }, now)?.rule, "oversized");
  assert.equal(oversized({ coin: BONK, valueUsd: 30, marketCash: 1_000 }, now), null);
  assert.equal(oversized({ coin: BONK, valueUsd: 31, marketCash: undefined }, now), null);
});

test("pullback: 40% or more under the high since the buy", () => {
  assert.equal(pullback({ coin: BONK, price: 0.6, peak: 1 }, now)?.text, "$BONK has fallen 40% from its high since you bought.");
  assert.equal(pullback({ coin: BONK, price: 0.61, peak: 1 }, now), null);
  assert.equal(pullback({ coin: BONK, price: 0.5, peak: undefined }, now), null);
});

test("no floor: a holding worth $2 or more with no floor", () => {
  assert.equal(noFloor({ coin: BONK, valueUsd: 2, hasFloor: false }, now)?.text, "$BONK has no floor. A fall isn't capped.");
  assert.equal(noFloor({ coin: BONK, valueUsd: 1.99, hasFloor: false }, now), null);
  assert.equal(noFloor({ coin: BONK, valueUsd: 50, hasFloor: true }, now), null);
});

test("dead bags: held a day and down 65%, or almost no market cash; never on value alone", () => {
  const fresh = { coin: coin(1), valueUsd: 0.98, heldMs: 60_000, pnlPct: -2, marketCash: 50_000 }; // a $1 buy after fees
  assert.equal(deadBags({ coins: [fresh] }, now), null);
  const old = { coin: coin(2), valueUsd: 0.3, heldMs: DAY + 1, pnlPct: -70, marketCash: 50_000 };
  const dry = { coin: coin(3), valueUsd: 4, marketCash: 900 };
  const c = deadBags({ coins: [fresh, old, dry] }, now)!;
  assert.equal(c.text, "These 2 coins are just sitting there looking sad ($4.30 total). Sweep them?");
  assert.equal(c.actions[0].command, `sell all ${coin(2).address} on base and sell all ${coin(3).address} on base`);
  assert.equal(deadBags({ coins: [{ ...old, heldMs: DAY - 1 }] }, now), null);
  assert.equal(deadBags({ coins: [{ ...old, pnlPct: -60 }] }, now), null);
  const nine = Array.from({ length: 9 }, (_, i) => ({ coin: coin(i + 10), valueUsd: 0.1, marketCash: 10 }));
  assert.equal(deadBags({ coins: nine }, now)!.actions[0].command.split(" and ").length, 6);
});

test("concentration: one coin over 60% of everything", () => {
  assert.equal(concentration({ coin: BONK, valueUsd: 61, totalUsd: 100 }, now)?.text, "$BONK is 61% of everything you hold.");
  assert.equal(concentration({ coin: BONK, valueUsd: 60, totalUsd: 100 }, now), null);
  assert.equal(concentration({ coin: BONK, valueUsd: 5, totalUsd: 0 }, now), null);
});

test("idle cash: $20+ and half of everything, not after a loss, not right after buying", () => {
  assert.equal(idleCash({ cashUsd: 50, totalUsd: 60, boughtThisSession: false, lossesToday: 0 }, now)?.text, "$50 doing nothing. No pressure. Want me to find something?");
  assert.equal(idleCash({ cashUsd: 19, totalUsd: 20, boughtThisSession: false, lossesToday: 0 }, now), null);
  assert.equal(idleCash({ cashUsd: 50, totalUsd: 200, boughtThisSession: false, lossesToday: 0 }, now), null);
  assert.equal(idleCash({ cashUsd: 50, totalUsd: 60, boughtThisSession: true, lossesToday: 0 }, now), null);
  assert.equal(idleCash({ cashUsd: 50, totalUsd: 60, boughtThisSession: false, lossesToday: 1 }, now), null);
});

test("the cap: one card per coin (most urgent, then rule order), one of each portfolio card, five at most", () => {
  const onBonk = [
    twoXNoPlan({ coin: BONK, price: 2, entry: 1, hasTakeProfit: false }, now)!,
    nearFloor({ coin: BONK, price: 0.76, floor: 0.75, dropPct: 25 }, now)!,
    creatorSelling({ coin: BONK, soldPct: 40, all: false }, now)!,
    cashLeaving({ coin: BONK, cashNow: 1, cashHigh1h: 10 }, now)!,
  ];
  assert.deepEqual(capCards(onBonk).map((c) => c.rule), ["creatorSelling"]);
  const conc = concentration({ coin: BONK, valueUsd: 90, totalUsd: 100 }, now)!;
  const tie = [noFloor({ coin: WIF, valueUsd: 9, hasFloor: false }, now)!, pullback({ coin: WIF, price: 0.1, peak: 1 }, now)!];
  assert.deepEqual(capCards(tie).map((c) => c.rule), ["pullback"]);
  assert.deepEqual(capCards([conc, onBonk[2]]).map((c) => c.rule), ["creatorSelling"]); // one card for BONK
  const dust = deadBags({ coins: [{ coin: coin(30), valueUsd: 0.2, marketCash: 5 }] }, now)!;
  assert.equal(capCards([dust, { ...dust }]).length, 1);
  const many: Card[] = Array.from({ length: 8 }, (_, i) => noFloor({ coin: coin(i), valueUsd: 5, hasFloor: false }, now)!);
  many.push(creatorSelling({ coin: coin(20), soldPct: 50, all: false }, now)!);
  const capped = capCards(many);
  assert.equal(capped.length, 5);
  assert.equal(capped[0].rule, "creatorSelling");
  for (let i = 1; i < capped.length; i++) assert.ok(capped[i - 1].urgency >= capped[i].urgency);
});

test("quiet periods", () => {
  assert.equal(quiet("nearFloor", now - 14 * 60_000, now), true);
  assert.equal(quiet("nearFloor", now - 16 * 60_000, now), false);
  assert.equal(quiet("twoXNoPlan", now - 5 * 3_600_000, now), true);
  assert.equal(quiet("twoXNoPlan", undefined, now), false);
});

test("bnb coins say bnb in their commands", () => {
  const c = noFloor({ coin: { chain: "bnb", address: "0x" + "1".repeat(40), symbol: "X" }, valueUsd: 5, hasFloor: false }, now)!;
  assert.equal(c.actions[0].command, `stop loss 25% on 0x${"1".repeat(40)} on bnb`);
});
