import assert from "node:assert/strict";
import test from "node:test";
import { askForCoin, readMessage, readScan } from "./commandChat.ts";
import { evmCandidates, evmScanRefusal, pickScanCoin, scanRefusal, type ScanCoin } from "./coinScan.ts";

test("a pasted address or a bare ticker looks the coin up", () => {
  assert.deepEqual(readMessage("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"), { kind: "lookup", coin: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", chain: undefined });
  assert.deepEqual(readMessage("0x627C5aaC31a203565e52945e8c8bc66dFdC85afe"), { kind: "lookup", coin: "0x627C5aaC31a203565e52945e8c8bc66dFdC85afe", chain: undefined });
  assert.deepEqual(readMessage("$WIF"), { kind: "lookup", coin: "WIF", chain: undefined });
  assert.deepEqual(readMessage("check PEPE on bnb"), { kind: "lookup", coin: "PEPE", chain: "bnb" });
});

test("everyday words around a command are skipped, never read as a coin", () => {
  assert.deepEqual(readMessage("can you buy BT now for $1 and sell all in 30 seconds"), {
    kind: "plan",
    steps: [
      { kind: "buy", coin: "BT", usd: 1, chain: undefined },
      { kind: "wait", seconds: 30 },
      { kind: "sell", coin: "BT", pct: 100, chain: undefined },
    ],
  });
  assert.deepEqual(readMessage("please sell all my BONK"), { kind: "plan", steps: [{ kind: "sell", coin: "BONK", pct: 100, chain: undefined }] });
  assert.deepEqual(readMessage("I want to buy $5 of wif right now"), { kind: "plan", steps: [{ kind: "buy", coin: "WIF", usd: 5, chain: undefined }] });
  assert.deepEqual(readMessage("could you check BONK?"), { kind: "lookup", coin: "BONK", chain: undefined });
});

test("a coin Crux can't find: the pasted address takes its place", () => {
  const t = askForCoin("buy $1 of FOOCOIN and sell all in 30 seconds", "FOOCOIN");
  assert.equal(t, "buy $1 of {} and sell all in 30 seconds");
  const r = readMessage("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", t);
  assert.equal(r.kind, "plan");
  if (r.kind === "plan") assert.deepEqual(r.steps.map((s) => (s.kind === "wait" ? "wait" : `${s.kind}:${s.coin}`)), ["buy:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "wait", "sell:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"]);
  assert.equal(askForCoin("sell all $foocoin", "FOOCOIN"), "sell all {}");
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
    rule: { chains: ["solana"], minutes: 60, minVolume: 50_000, usd: 5, takeProfit: 2, stopLossPct: 30, safetyStop: true, maxAgeHours: 24, minAgeHours: 0 },
  });
  assert.deepEqual(readScan("scan for 30 minutes, buy $10 with volume over $100k, sell at 3x, stop loss 25%"), {
    kind: "scan",
    rule: { chains: ["solana"], minutes: 30, minVolume: 100_000, usd: 10, takeProfit: 3, stopLossPct: 25, safetyStop: false, maxAgeHours: 24, minAgeHours: 0 },
  });
});

test("a scan asked for without the word scan, with launch age and percent profit", () => {
  const r = readMessage("buy a solana coin which is launched in 1 hour and with 50 k in volume atleast and sell it when it reaches 20% profit");
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.equal(r.text, "How much should I buy when I find a coin?");
  const filled = readMessage("$1", r.template);
  assert.deepEqual(filled, { kind: "scan", rule: { chains: ["solana"], minutes: 60, minVolume: 50_000, usd: 1, takeProfit: 1.2, stopLossPct: 30, safetyStop: true, maxAgeHours: 1, minAgeHours: 0 } });
  assert.deepEqual(readMessage("find me a new coin under 30 min old with $100k volume, buy $5, sell when up 50%"), {
    kind: "scan",
    rule: { chains: ["solana"], minutes: 60, minVolume: 100_000, usd: 5, takeProfit: 1.5, stopLossPct: 30, safetyStop: true, maxAgeHours: 0.5, minAgeHours: 0 },
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

test("a scan on the chains named, or all of them; silly lengths refused", () => {
  const base = readMessage("scan base for 1 hour, buy $5");
  assert.equal(base.kind === "scan" && base.rule.chains.join(), "base");
  const two = readMessage("scan base and bnb for 30 min, buy $5");
  assert.equal(two.kind === "scan" && two.rule.chains.join(), "base,bnb");
  assert.equal(readMessage("scan solana for 10 hours, buy $5").kind, "error");
});

test("the founder's all-chains scan: older than an hour, 50k volume, $1, +20%", () => {
  assert.deepEqual(readMessage("i wanted to buy a coin which has age of 1 hour plus with 50 k volume in all chains (3 in our case ) buy for 1 usd and sell when it my profit reaches 20%"), {
    kind: "scan",
    rule: { chains: ["solana", "base", "bnb"], minutes: 60, minVolume: 50_000, usd: 1, takeProfit: 1.2, stopLossPct: 30, safetyStop: true, maxAgeHours: 24, minAgeHours: 1 },
  });
  const older = readMessage("scan every chain for coins older than 2 hours with $100k volume, buy $5, sell at 2x");
  assert.equal(older.kind === "scan" && older.rule.minAgeHours, 2);
  assert.equal(readMessage("scan all chains for coins at least 30 hours old, buy $5").kind, "error");
});

test("Base/BNB coins: the market rules, then the most traded first", () => {
  const now = Date.now();
  const c = { address: "0xA", symbol: "AAA", name: "", price: 0.1, liquidity: 50_000, volume1h: 80_000, createdAt: now - 3 * 3_600_000 };
  const rule = { minVolume: 50_000, maxAgeHours: 24, minAgeHours: 1 };
  assert.equal(evmScanRefusal(c, rule, now), null);
  assert.equal(evmScanRefusal({ ...c, createdAt: now - 20 * 60_000 }, rule, now), "too new");
  assert.equal(evmScanRefusal({ ...c, liquidity: 2_000 }, rule, now), "too little in its pool");
  const busy = { ...c, address: "0xB", volume1h: 300_000 };
  assert.deepEqual(evmCandidates([c, busy], rule, now).map((x) => x.address), ["0xB", "0xA"]);
  assert.deepEqual(evmCandidates([c, busy], rule, now, new Set(["0xb"])).map((x) => x.address), ["0xA"]);
});

test("a scan's safety stop: 30% unless told otherwise", () => {
  const r = readMessage("scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x, no stop loss");
  assert.equal(r.kind === "scan" && r.rule.stopLossPct, undefined);
  assert.equal(r.kind === "scan" && r.rule.safetyStop, false);
});

test("the rug-pull signs: \$MINELIUS (creator launched 90 coins, up 1,700% today) is refused", () => {
  const now = Date.now();
  const minelius: ScanCoin = { mint: "E9rW", symbol: "MINELIUS", name: "", price: 0.015, liquidity: 76_000, volume1h: 900_000, createdAt: now - 18 * 3_600_000, mintOff: true, freezeOff: true, creatorPct: 0, topHoldersPct: 23, organic: "medium", holders: 2_865, creatorLaunches: 90, change24h: 1_704 };
  const rule = { minVolume: 50_000, maxAgeHours: 24, minAgeHours: 1 };
  assert.equal(scanRefusal(minelius, rule, now), "its creator launches coin after coin");
  assert.equal(scanRefusal({ ...minelius, creatorLaunches: 2 }, rule, now), "already pumped too hard today");
  assert.equal(scanRefusal({ ...minelius, creatorLaunches: 2, change24h: 80, organic: "low" }, rule, now), "its trading looks like bots");
  assert.equal(scanRefusal({ ...minelius, creatorLaunches: 2, change24h: 80, holders: 120 }, rule, now), "too few holders");
  assert.equal(scanRefusal({ ...minelius, creatorLaunches: 2, change24h: 80 }, rule, now), null);
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
