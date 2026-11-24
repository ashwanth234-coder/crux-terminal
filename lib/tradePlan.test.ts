import assert from "node:assert/strict";
import test from "node:test";
import { describeExit, presetExits, presetPlan, rationale, testFloorPlan, TradePlanSchema } from "./tradePlan.ts";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

test("each preset makes a plan the schema accepts", () => {
  for (const p of ["conservative", "balanced", "aggressive"] as const) {
    const plan = presetPlan(p, "solana", MINT, 25);
    assert.equal(TradePlanSchema.safeParse(plan).success, true);
  }
});

test("balanced: half at 2x, the rest trailed at 20% after the first sale, a -25% floor (G1)", () => {
  assert.deepEqual(presetExits("balanced"), [
    { kind: "takeProfit", id: "tp1", sellPct: 50, atMultiple: 2 },
    { kind: "trailing", id: "trail", sellPct: 50, trailPct: 20, armAfter: "tp1" },
    { kind: "stopLoss", id: "sl", dropPct: 25 },
  ]);
});

test("the one-liner matches the server's word for word", () => {
  assert.equal(rationale("balanced", presetExits("balanced")), "Balanced: sell 50% at 2x, trail 50% at 20% after the first sale, floor at about -25%.");
});

test("each exit reads in plain words, with the honest 'about' on the floor", () => {
  assert.deepEqual(presetExits("conservative").map(describeExit), ["Sell 75% at 1.3x", "Floor: sell everything at about −15% (moves to breakeven once the first sale fills)"]);
});

test("a size over the cap or a non-address is refused before anything is sent", () => {
  assert.throws(() => presetPlan("balanced", "solana", MINT, 5_000));
  assert.throws(() => presetPlan("balanced", "solana", "BONK", 25));
});

test("the temporary test floor is one -3% stop on the whole bag", () => {
  const plan = testFloorPlan("solana", MINT, 1);
  assert.equal(plan.preset, "custom");
  assert.deepEqual(plan.exits, [{ kind: "stopLoss", id: "sl", dropPct: 3 }]);
  assert.equal(plan.rationale, "Your plan: floor at about -3%.");
});
