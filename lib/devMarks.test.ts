import { test } from "node:test";
import assert from "node:assert/strict";
import { devMarks, type ChartTrade } from "./devMarks.ts";

const DEV_SOL = "D4kuhipR2T9xsf6hwHynwWWS9SUbPacjmU3Lq75NwX8L";
const tr = (time: number, side: "buy" | "sell", trader: string, usd = 100): ChartTrade => ({ time, side, usd, price: 0.001, trader, tx: `tx${time}` });

test("the creator's buys and sells become DB / DS marks, oldest first, with their size", () => {
  const m = devMarks([tr(30, "sell", DEV_SOL, 500), tr(10, "buy", "someone"), tr(20, "buy", DEV_SOL, 50)], DEV_SOL);
  assert.deepEqual(m.map((x) => [x.time, x.side, x.who, x.usd, x.tokens]), [[20, "buy", "dev", 50, 50_000], [30, "sell", "dev", 500, 500_000]]);
});

test("EVM creators match whatever the letter case; Solana addresses must match exactly", () => {
  assert.equal(devMarks([tr(1, "sell", "0xABCDEF0000000000000000000000000000000001")], "0xabcdef0000000000000000000000000000000001").length, 1);
  assert.equal(devMarks([tr(1, "sell", DEV_SOL.toLowerCase())], DEV_SOL).length, 0);
});

test("no creator known, no marks", () => {
  assert.deepEqual(devMarks([tr(1, "buy", DEV_SOL)], null), []);
});
