// Mix-and-match: hundreds of wordings built from parts (verbs × amounts × shares × coins × follow-ups × questions),
// each run through Ask Crux's reader. A miss here is a way traders type that Crux doesn't read yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readMessage, type Reply } from "./commandChat.ts";

type Want = (r: Reply) => boolean;
const plan = (r: Reply) => (r.kind === "plan" ? r.steps : null);
const isBuy = (usd: number): Want => (r) => !!plan(r)?.some((s) => s.kind === "buy" && s.coin.toUpperCase() === "BONK" && s.usd === usd);
const isSell = (pct: number): Want => (r) => !!plan(r)?.some((s) => s.kind === "sell" && s.coin.toUpperCase() === "BONK" && s.pct === pct);
const isKind = (k: string): Want => (r) => r.kind === k;
const groups: Record<string, { say: string; want: Want; last?: string }[]> = {};
const add = (g: string, say: string, want: Want, last?: string) => (groups[g] ??= []).push({ say, want, last });

// Buys: verb × amount × link word.
const buyVerbs = ["buy", "grab", "get", "cop", "scoop", "snag", "ape", "ape into", "pick up", "load up on", "purchase", "i want", "lemme get", "gimme", "throw", "put"];
const amounts: [string, number][] = [["$20", 20], ["20$", 20], ["20 bucks", 20], ["20 dollars", 20], ["20 usd", 20], ["twenty bucks", 20], ["20", 20], ["$1k", 1000], ["1.5k", 1500]];
for (const v of buyVerbs)
  for (const [a, n] of amounts) {
    const link = v === "throw" || v === "put" ? "in" : v === "ape" ? "into" : "of";
    add("buy", `${v} ${a} ${link} bonk`, isBuy(n));
  }
for (const [a, n] of amounts.slice(0, 4)) {
  add("buy (other orders)", `bonk ${a}`, isBuy(n));
  add("buy (other orders)", `${a} bonk`, isBuy(n));
  add("buy (other orders)", `buy bonk ${a}`, isBuy(n));
  add("buy (other orders)", `buy bonk for ${a}`, isBuy(n));
  add("buy (other orders)", `${a} worth of bonk`, isBuy(n));
  add("buy (other orders)", `can you buy ${a} of bonk for me`, isBuy(n));
  add("buy (other orders)", `pls buy ${a} bonk asap`, isBuy(n));
}
// Sells: verb × share.
const sellVerbs = ["sell", "dump", "offload", "unload", "exit", "jeet", "cash out", "get me out of", "close", "trim", "take profit on", "paper hand"];
const shares: [string, number][] = [["all", 100], ["all my", 100], ["half", 50], ["half my", 50], ["25%", 25], ["a quarter of", 25], ["", 100]];
for (const v of sellVerbs) for (const [s, p] of shares) add("sell", `${v} ${s} bonk`.replace(/\s+/g, " "), isSell(v === "trim" && s === "" ? 25 : p));
// Orders.
for (const say of ["stop loss 20% on bonk", "sl 20 bonk", "set a stop loss at 20% for bonk", "sell bonk if it drops 20%", "sell bonk if it dips 20 percent", "cut bonk at -20%", "protect my bonk at 20% down", "stop out bonk at 20%"])
  add("stop loss", say, (r) => !!plan(r)?.some((s) => s.kind === "stopLoss" && s.dropPct === 20));
for (const say of ["take profit at 2x on bonk", "tp 2x bonk", "sell bonk at 2x", "sell bonk when it doubles", "sell half bonk at 2x", "sell bonk when it's up 100%", "take profits on bonk at 2x", "exit bonk at 2x"])
  add("take profit", say, (r) => !!plan(r)?.some((s) => s.kind === "takeProfit" && s.multiple === 2));
for (const say of ["trailing stop 15% on bonk", "trail bonk 15%", "trailing 15 percent bonk"]) add("trailing", say, (r) => !!plan(r)?.some((s) => s.kind === "trailing" && s.trailPct === 15));
for (const say of ["buy $10 of bonk if it drops 30%", "buy the dip on bonk 30% with $10", "if bonk dips 30% buy $10", "catch bonk at -30% with 10 bucks"]) add("dip buy", say, (r) => !!plan(r)?.some((s) => s.kind === "dip" && s.dropPct === 30));
// Combos in one message.
for (const say of ["buy $20 of bonk and take profit at 2x", "buy 20 bonk, stop loss 20%", "buy $20 of bonk then sell it in 5 min", "ape 20 into bonk and set sl 20%", "buy 20 of bonk, tp 2x, sl 20%", "buy $20 of bonk and sell half at 2x"])
  add("combos", say, (r) => (plan(r)?.length ?? 0) >= 2);
// Follow-ups after talking about BONK.
for (const [say, want] of [
  ["buy 20 of it", isBuy(20)], ["grab 20 bucks of this", isBuy(20)], ["ape 20 into that one", isBuy(20)], ["sell it", isSell(100)], ["dump half of it", isSell(50)],
  ["stop loss 20% on it", (r: Reply) => !!plan(r)?.some((s) => s.kind === "stopLoss")], ["is it safe", (r: Reply) => r.kind === "lookup"], ["who made it", isKind("creator")], ["who's the dev", isKind("creator")], ["his other coins", isKind("creatorCoins")], ["did the dev rug before", isKind("creatorCoins")], ["price?", (r: Reply) => r.kind === "lookup"], ["chart", (r: Reply) => r.kind === "lookup"],
] as [string, Want][])
  add("follow-ups (coin = BONK)", say, want, "BONK");
// Questions about a coin.
for (const say of ["is bonk safe", "is bonk a rug", "bonk legit?", "is bonk a scam", "price of bonk", "bonk price", "how much is bonk", "what's bonk at", "mcap of bonk", "tell me about bonk", "info on bonk", "check bonk", "thoughts on bonk", "should i buy bonk", "is bonk dead", "bonk chart", "what is bonk", "anything on bonk"])
  add("coin questions", say, (r) => r.kind === "lookup");
// Creator questions.
for (const say of ["who made bonk", "who created bonk", "who launched bonk", "bonk creator", "bonk's dev", "creator of bonk", "dev wallet of bonk", "pull the creator ca of bonk", "who is behind bonk", "bonk deployer", "tell me about bonk's creator", "who's the bonk dev"])
  add("creator", say, isKind("creator"));
for (const say of ["what else did the bonk dev launch", "bonk dev's other coins", "coins by the bonk creator", "did the bonk dev rug before", "bonk creator track record", "his coins that hit 50k", "show the dev's coins over 100k"])
  add("creator's coins", say, isKind("creatorCoins"), "BONK");
// Account and market.
for (const say of ["what do i hold", "my bags", "how are my bags", "portfolio", "my pnl", "am i up", "how much have i made", "show my coins", "what's in my wallet", "balance", "how much money do i have"]) add("my account", say, isKind("portfolio"));
for (const say of ["what's trending", "whats hot", "trending on solana", "what's pumping on base", "top gainers", "any good coins today", "what should i buy", "new coins", "show me runners", "what's moving"]) add("market", say, (r) => r.kind === "trending" || r.kind === "scan");
for (const say of ["my orders", "open orders", "cancel all my orders", "show my stop losses", "what orders do i have"]) add("orders", say, isKind("orders"));
// Off-track (should be a steer, never an error).
for (const say of ["will bonk moon", "when moon", "short bonk", "10x long sol", "bridge to base", "do i need gas", "withdraw", "how do i deposit", "fees?", "my trade failed", "lost it all", "thanks", "lol", "are you a bot", "send 50 to my friend", "can i stake", "airdrop?", "is crux safe"])
  add("off-track (steer, no error)", say, (r) => r.kind !== "error");

test("Ask Crux reads every mixed-and-matched wording", () => {
  const fails: string[] = [];
  let total = 0;
  for (const [g, cases] of Object.entries(groups)) {
    for (const c of cases) {
      total++;
      const r = readMessage(c.say, undefined, c.last);
      if (!c.want(r)) fails.push(`[${g}] "${c.say}" → ${JSON.stringify(r).slice(0, 120)}`);
    }
  }
  if (process.env.CORPUS_REPORT) console.log(`${total - fails.length}/${total}`);
  assert.deepEqual(fails, []);
});
