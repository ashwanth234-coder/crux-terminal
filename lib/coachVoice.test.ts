import assert from "node:assert/strict";
import test from "node:test";
import { LINES, momentOf, voice, type Moment } from "./coachVoice.ts";

test("which moment a trade is", () => {
  assert.equal(momentOf({ side: "buy", lossesToday: 0 }), null);
  assert.equal(momentOf({ side: "sell", pnlPct: undefined, lossesToday: 0 }), null);
  assert.equal(momentOf({ side: "sell", pnlPct: 30, lossesToday: 0 }), "profitTaken");
  assert.equal(momentOf({ side: "sell", pnlPct: 250, lossesToday: 0 }), "bigWin");
  assert.equal(momentOf({ side: "sell", pnlPct: -20, byFloor: true, lossesToday: 1 }), "floorSold");
  assert.equal(momentOf({ side: "sell", pnlPct: -20, lossesToday: 1 }), "loss");
  assert.equal(momentOf({ side: "sell", pnlPct: -20, byFloor: true, lossesToday: 2 }), "rough");
});

test("the founder's lines are there", () => {
  assert.ok(LINES.profitTaken.includes("Good job. Money in the bank beats money on a chart."));
  assert.ok(LINES.bigWin.includes("Look at you. Screenshot it, then set a floor."));
  assert.ok(LINES.floorSold.includes("Sorry, that one hurt. Your floor did its job and kept it small."));
  assert.ok(LINES.rough.includes("Rough day. Nothing wrong with a break: the coins will still be here."));
});

test("guardrails: no jokes or exclamations after a loss, no nudge to trade again, never a promise", () => {
  for (const m of ["floorSold", "rough", "loss"] as Moment[]) {
    for (const l of LINES[m]) {
      assert.doesNotMatch(l, /!|lol|lmao|rekt|ngmi|cope|haha|bold/i, l);
      assert.doesNotMatch(l, /\b(buy|ape|find|next coin|win it back)\b/i, l);
    }
  }
  for (const ls of Object.values(LINES)) for (const l of ls) assert.doesNotMatch(l, /will (pump|moon|go up)|guarantee/i, l);
});

test("lines rotate and fill in the symbol", () => {
  assert.notEqual(voice("profitTaken", 0), voice("profitTaken", 1));
  assert.equal(voice("bigWin", 0), "Look at you. Screenshot it, then set a floor.");
  assert.match(voice("initials", 0, { usd: "$5.00" }), /\$5\.00 back/);
});
