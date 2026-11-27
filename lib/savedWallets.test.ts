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
