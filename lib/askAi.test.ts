import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantTurn, cardsToReplies, goesToAi, pageCoin } from "./askAi.ts";

test("the AI takes what the patterns miss, and everything once a conversation with it is going", () => {
  assert.equal(goesToAi({ kind: "plan", steps: [] }, false, false), false);
  assert.equal(goesToAi({ kind: "lookup", coin: "BONK" }, false, false), false);
  assert.equal(goesToAi({ kind: "error", text: "?" }, false, false), true);
  assert.equal(goesToAi({ kind: "ask", text: "Which coin?" }, false, false), true);
  assert.equal(goesToAi({ kind: "lookup", coin: "yes" }, true, false), true);
  // Answering the patterns' own question ("How much?") stays with the patterns.
  assert.equal(goesToAi({ kind: "plan", steps: [] }, true, true), false);
});

test("the AI's cards are the chat's own cards; its orders card never cancels", () => {
  assert.deepEqual(cardsToReplies([{ kind: "orders" }, { kind: "portfolio" }]), [{ kind: "orders", cancel: false }, { kind: "portfolio" }]);
});

test("the assistant's turn carries what it showed, with addresses, for follow-ups", () => {
  const t = assistantTurn({ text: "Two went big.", cards: [{ kind: "coins", title: "His $50k+ coins", chain: "solana", coins: [{ address: "9TKbd3VF…pump", symbol: "Snowball" }] }, { kind: "plan", steps: [{ kind: "buy", coin: "0xC0IN", usd: 20, chain: "base" }] }] });
  assert.equal(t, "Two went big.\n(Shown: His $50k+ coins (solana): Snowball 9TKbd3VF…pump; a plan to confirm: buy 0xC0IN on base)");
});

test("the coin open on screen comes from the page's address", () => {
  assert.deepEqual(pageCoin("/base/0x2250d427d030bD859412790d942B18A9DF7C5afE"), { chain: "base", coin: "0x2250d427d030bD859412790d942B18A9DF7C5afE" });
  assert.deepEqual(pageCoin("/solana/9TKbd3VFaMSXsEAicD9JVQWpWwAoLi4fSgWmZL2cpump?x=1"), { chain: "solana", coin: "9TKbd3VFaMSXsEAicD9JVQWpWwAoLi4fSgWmZL2cpump" });
  assert.equal(pageCoin("/launch/new"), null);
  assert.equal(pageCoin(null), null);
});
