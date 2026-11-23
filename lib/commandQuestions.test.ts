import assert from "node:assert/strict";
import test from "node:test";
import { readMessage } from "./commandChat.ts";

const kind = (t: string) => readMessage(t);

test("greetings and help get the menu", () => {
  assert.deepEqual(kind("hi"), { kind: "help", greeting: true });
  assert.deepEqual(kind("Hello!"), { kind: "help", greeting: true });
  assert.deepEqual(kind("gm"), { kind: "help", greeting: true });
  assert.deepEqual(kind("help"), { kind: "help", greeting: false });
  assert.deepEqual(kind("what can you do?"), { kind: "help", greeting: false });
});

test("the trader's own coins and profit", () => {
  for (const t of ["what do I hold?", "how am I doing", "show my coins", "my pnl", "how's my portfolio", "portfolio", "what did I buy"]) assert.deepEqual(kind(t), { kind: "portfolio" }, t);
});

test("orders: show or cancel", () => {
  assert.deepEqual(kind("show my orders"), { kind: "orders", cancel: false });
  assert.deepEqual(kind("my open orders"), { kind: "orders", cancel: false });
  assert.deepEqual(kind("cancel all my orders"), { kind: "orders", cancel: true });
});

test("trending, on one chain or all", () => {
  assert.deepEqual(kind("what's trending?"), { kind: "trending", chain: undefined });
  assert.deepEqual(kind("what's trending on base"), { kind: "trending", chain: "base" });
  assert.deepEqual(kind("top gainers on solana"), { kind: "trending", chain: "solana" });
});

test("trades still read as trades", () => {
  assert.equal(kind("buy $5 of BONK").kind, "plan");
  assert.equal(kind("sell all my BONK").kind, "plan");
});
