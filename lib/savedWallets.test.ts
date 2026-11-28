import { test } from "node:test";
import assert from "node:assert/strict";
import { savedIndex, savedMarks, walletKey, walletLabel } from "./savedWallets.ts";

const w = (address: string, chart = true) => ({ chain: "base" as const, address, name: "", chart, notify: false, savedAt: 0 });
const t = (trader: string, time: number) => ({ time, side: "buy" as const, usd: 10, price: 2, trader, tx: `0x${time}` });

test("EVM wallets match whatever their case; Solana's exactly", () => {
  assert.equal(walletKey("base", "0xAbC"), walletKey("base", "0xabc"));
  assert.notEqual(walletKey("solana", "AbC"), walletKey("solana", "abc"));
});

test("★ badges: saved wallets with Show on charts on, oldest first", () => {
  const idx = savedIndex([w("0xAAA"), w("0xBBB", false)]);
  const m = savedMarks([t("0xaaa", 5), t("0xbbb", 6), t("0xccc", 7), t("0xAAA", 1)], "base", idx);
  assert.deepEqual(m.map((x) => [x.time, x.who, x.tokens]), [[1, "saved", 5], [5, "saved", 5]]);
});

test("a wallet shows by its nickname, else its short address", () => {
  assert.equal(walletLabel({ name: "Whale", address: "0x1234567890abcdef" }), "Whale");
  assert.equal(walletLabel({ name: "", address: "0x1234567890abcdef" }), "0x12…cdef");
});

test("eventMarks: a saved wallet's watched Solana trades of this coin, once, only with Show on charts", async () => {
  const { eventMarks, savedIndex } = await import("./savedWallets.ts");
  const W = "9SLPTL41SPsYkgdsMzdfJsxymEANKr5bYoBsQzJyKpKS";
  const OFF = "So11111111111111111111111111111111111111112";
  const idx = savedIndex([
    { chain: "solana", address: W, name: "Ansem", chart: true, notify: false, savedAt: 1 },
    { chain: "solana", address: OFF, name: "", chart: false, notify: true, savedAt: 1 },
  ]);
  const ev = (address: string, mint: string, tx: string, at: number) => ({ address, name: "", mint, symbol: "X", side: "buy" as const, sol: 1, at, tx, usd: 150, tokens: 1000 });
  const marks = eventMarks([ev(W, "MINT", "t2", 2_000_500), ev(W, "MINT", "t1", 1_000_000), ev(W, "OTHER", "t3", 1), ev(OFF, "MINT", "t4", 1), ev(W, "MINT", "seen", 5)], "MINT", idx, new Set(["seen"]));
  assert.deepEqual(marks.map((m) => [m.time, m.who, m.usd, m.txHash]), [[1000, "saved", 150, "t1"], [2000, "saved", 150, "t2"]]);
});
