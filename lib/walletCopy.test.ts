import assert from "node:assert/strict";
import test from "node:test";
import { readMessage } from "./commandChat.ts";
import { hasSold, walletChanges, type Holdings } from "./walletCopy.ts";

const W = "3yZVBTqN5Tz1d5r7XTGgXAkbqkV9WkMqP3s7q8EZxhxM";

test("copy requests, in a trader's words", () => {
  assert.deepEqual(readMessage(`when ${W} buys a coin, buy it for $5 and sell it immediately after it sells or with 20% profit`), {
    kind: "copy",
    rule: { wallet: W, usd: 5, minutes: 60, maxCopies: 3, followSells: true, takeProfit: 1.2, stopLossPct: undefined },
  });
  assert.deepEqual(readMessage(`copy ${W} for 2 hours, $10 each, up to 5 coins, sell at 2x`), {
    kind: "copy",
    rule: { wallet: W, usd: 10, minutes: 120, maxCopies: 5, followSells: false, takeProfit: 2, stopLossPct: undefined },
  });
  // No exit named: it sells when the wallet sells.
  const r = readMessage(`follow ${W}`);
  assert.equal(r.kind, "ask");
  if (r.kind === "ask") {
    const f = readMessage("$5", r.template);
    assert.deepEqual(f, { kind: "copy", rule: { wallet: W, usd: 5, minutes: 60, maxCopies: 3, followSells: true, takeProfit: undefined, stopLossPct: undefined } });
  }
});

test("asked to copy without a wallet: asks which, then the pasted address fills it", () => {
  const r = readMessage("copy a wallet");
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  const next = readMessage(W, r.template);
  assert.equal(next.kind, "ask");
  if (next.kind === "ask") assert.equal(next.text, "How much should I buy each time that wallet buys?");
});

test("copying refuses EVM wallets and too many coins, plainly", () => {
  const evm = readMessage("copy 0x627C5aaC31a203565e52945e8c8bc66dFdC85afe, buy $5");
  assert.equal(evm.kind, "error");
  assert.equal(readMessage(`copy ${W}, buy $5, up to 50 coins`).kind, "error");
});

test("a wallet's buys and sells between two reads", () => {
  const before: Holdings = new Map([
    ["A", BigInt(100)],
    ["B", BigInt(50)],
    ["So11111111111111111111111111111111111111112", BigInt(5)],
  ]);
  const after: Holdings = new Map([
    ["A", BigInt(100)],
    ["B", BigInt(10)],
    ["C", BigInt(7)],
    ["So11111111111111111111111111111111111111112", BigInt(9)],
  ]);
  assert.deepEqual(walletChanges(before, after), { bought: ["C"], less: ["B"] });
  assert.equal(hasSold(BigInt(100), BigInt(60)), false);
  assert.equal(hasSold(BigInt(100), BigInt(50)), true);
  assert.equal(hasSold(BigInt(100), BigInt(0)), true);
});
