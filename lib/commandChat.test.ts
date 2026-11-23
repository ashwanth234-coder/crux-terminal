import assert from "node:assert/strict";
import test from "node:test";
import { readMessage, readScan } from "./commandChat.ts";
import { pickScanCoin, scanRefusal, type ScanCoin } from "./coinScan.ts";

test("a pasted address or a bare ticker looks the coin up", () => {
  assert.deepEqual(readMessage("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"), { kind: "lookup", coin: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", chain: undefined });
  assert.deepEqual(readMessage("0x627C5aaC31a203565e52945e8c8bc66dFdC85afe"), { kind: "lookup", coin: "0x627C5aaC31a203565e52945e8c8bc66dFdC85afe", chain: undefined });
  assert.deepEqual(readMessage("$WIF"), { kind: "lookup", coin: "WIF", chain: undefined });
  assert.deepEqual(readMessage("check PEPE on bnb"), { kind: "lookup", coin: "PEPE", chain: "bnb" });
});

test("a buy without an amount asks how much, with buttons", () => {
  const r = readMessage("buy BONK");
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.equal(r.text, "How much BONK should I buy?");
  assert.deepEqual(r.options?.map((o) => o.command), ["buy $5 of BONK", "buy $10 of BONK", "buy $25 of BONK"]);
  // Typing the answer fills the question's command.
  assert.deepEqual(readMessage("7", r.template), { kind: "plan", steps: [{ kind: "buy", coin: "BONK", usd: 7, chain: undefined }] });
  assert.deepEqual(readMessage("$7", r.template), { kind: "plan", steps: [{ kind: "buy", coin: "BONK", usd: 7, chain: undefined }] });
});

test("a buy without a coin asks which", () => {
  const r = readMessage("buy $5");
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.deepEqual(readMessage("WIF", r.template), { kind: "plan", steps: [{ kind: "buy", coin: "WIF", usd: 5, chain: undefined }] });
});

test("a scan, in the founder's words", () => {
  assert.deepEqual(readMessage("scan solana token for 1 hour today from now buy $5 of a coin which has 50k vol and sell it when you get 2x profit"), {
    kind: "scan",
    rule: { minutes: 60, minVolume: 50_000, usd: 5, takeProfit: 2, stopLossPct: undefined, maxAgeHours: 24 },
  });
  assert.deepEqual(readScan("scan for 30 minutes, buy $10 with volume over $100k, sell at 3x, stop loss 25%"), {
    kind: "scan",
    rule: { minutes: 30, minVolume: 100_000, usd: 10, takeProfit: 3, stopLossPct: 25, maxAgeHours: 24 },
  });
});

test("a scan without an amount asks for one", () => {
  const r = readMessage("scan solana for 1 hour, buy a coin with 50k volume, sell at 2x");
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.equal(r.options?.length, 3);
  const filled = readMessage("5", r.template);
  assert.equal(filled.kind, "scan");
  if (filled.kind === "scan") assert.equal(filled.rule.usd, 5);
});

test("a scan refuses other chains and silly lengths", () => {
  assert.equal(readMessage("scan base for 1 hour, buy $5").kind, "error");
  assert.equal(readMessage("scan solana for 10 hours, buy $5").kind, "error");
});

test("the scan's safety rules", () => {
  const now = Date.now();
  const good: ScanCoin = { mint: "A", symbol: "GOOD", name: "", price: 0.01, liquidity: 40_000, volume1h: 80_000, createdAt: now - 3_600_000, mintOff: true, freezeOff: true, creatorPct: 2, topHoldersPct: 30 };
  const rule = { minVolume: 50_000, maxAgeHours: 24 };
  assert.equal(scanRefusal(good, rule, now), null);
  assert.equal(scanRefusal({ ...good, mintOff: false }, rule, now), "more can be printed");
  assert.equal(scanRefusal({ ...good, volume1h: 10_000 }, rule, now), "not enough trading");
  assert.equal(scanRefusal({ ...good, createdAt: now - 48 * 3_600_000 }, rule, now), "too old");
  assert.equal(scanRefusal({ ...good, creatorPct: 40 }, rule, now), "the creator holds too much");
  const busier = { ...good, mint: "B", volume1h: 200_000 };
  assert.equal(pickScanCoin([good, busier, { ...busier, mint: "C", freezeOff: false, volume1h: 900_000 }], rule, now)?.mint, "B");
  assert.equal(pickScanCoin([good], rule, now, new Set(["A"])), null);
});
