import type { Reply } from "./commandChat.ts";

/**
 * Everyday ways traders type to Ask Crux, with what each must read as (lib/askCorpus.test.ts runs them all). `want`
 * checks the reply; `last` is the coin the conversation was about (for "buy 20 of it").
 */
export type CorpusCase = { say: string; last?: string; want: (r: Reply) => boolean; means: string };

const plan = (r: Reply) => (r.kind === "plan" ? r.steps : null);
const buys = (coin: string, usd: number) => (r: Reply) => !!plan(r)?.some((s) => s.kind === "buy" && s.coin === coin && s.usd === usd);
const sells = (coin: string, pct: number) => (r: Reply) => !!plan(r)?.some((s) => s.kind === "sell" && s.coin === coin && s.pct === pct);
const kind = (k: Reply["kind"]) => (r: Reply) => r.kind === k;
const looks = (coin: string) => (r: Reply) => r.kind === "lookup" && r.coin.toUpperCase() === coin.toUpperCase();
const creatorOf = (coin: string) => (r: Reply) => r.kind === "creator" && r.coin.toUpperCase() === coin.toUpperCase();
const steer = (text: RegExp, button?: string) => (r: Reply) => r.kind === "ask" && text.test(r.text) && !!r.options?.length && (!button || r.options.some((o) => o.label === button));
const creatorCoins = (coin: string, min?: number) => (r: Reply) => r.kind === "creatorCoins" && r.coin.toUpperCase() === coin.toUpperCase() && (min === undefined || r.minPeakUsd === min);

export const CORPUS: CorpusCase[] = [
  // Buying, said many ways
  { say: "buy $20 of BONK", want: buys("BONK", 20), means: "buy $20 of BONK" },
  { say: "buy 20 bonk", want: buys("BONK", 20), means: "buy $20 of BONK" },
  { say: "grab me 20 bucks of bonk", want: buys("BONK", 20), means: "buy $20 of BONK" },
  { say: "get 20$ of bonk", want: buys("BONK", 20), means: "buy $20 of BONK" },
  { say: "byu 20 of bonk", want: buys("BONK", 20), means: "buy $20 of BONK (typo)" },
  { say: "bye $15 bonk", want: buys("BONK", 15), means: "buy $15 of BONK (typo)" },
  { say: "purchase twenty dollars of wif", want: buys("WIF", 20), means: "buy $20 of WIF (number word)" },
  { say: "cop $10 wif", want: buys("WIF", 10), means: "buy $10 of WIF" },
  { say: "scoop 5 bucks of wif", want: buys("WIF", 5), means: "buy $5 of WIF" },
  { say: "put 25 in bonk", want: buys("BONK", 25), means: "buy $25 of BONK" },
  { say: "throw $10 into wif", want: buys("WIF", 10), means: "buy $10 of WIF" },
  { say: "i want to buy 10 dollars worth of bonk", want: buys("BONK", 10), means: "buy $10 of BONK" },
  { say: "buy bonk for $5", want: buys("BONK", 5), means: "buy $5 of BONK" },
  { say: "5 bucks bonk", want: buys("BONK", 5), means: "buy $5 of BONK" },
  { say: "buy 1k of bonk", want: buys("BONK", 1000), means: "buy $1,000 of BONK" },
  // Selling
  { say: "sell all my bonk", want: sells("BONK", 100), means: "sell all BONK" },
  { say: "sel half bonk", want: sells("BONK", 50), means: "sell half BONK (typo)" },
  { say: "get me out of bonk", want: sells("BONK", 100), means: "sell all BONK" },
  { say: "close my bonk position", want: sells("BONK", 100), means: "sell all BONK" },
  { say: "offload 30% of wif", want: sells("WIF", 30), means: "sell 30% WIF" },
  { say: "take half off bonk", want: sells("BONK", 50), means: "sell half BONK" },
  { say: "cash out my wif", want: sells("WIF", 100), means: "sell all WIF" },
  { say: "sell a quarter of my bonk", want: sells("BONK", 25), means: "sell 25% BONK" },
  // Orders
  { say: "stop loss 20% on bonk", want: (r) => !!plan(r)?.some((s) => s.kind === "stopLoss" && s.dropPct === 20), means: "stop loss 20%" },
  { say: "set a stoploss at 25 percent for wif", want: (r) => !!plan(r)?.some((s) => s.kind === "stopLoss" && s.dropPct === 25), means: "stop loss 25%" },
  { say: "sell bonk if it drops 30%", want: (r) => !!plan(r)?.some((s) => s.kind === "stopLoss" && s.dropPct === 30), means: "stop loss 30%" },
  { say: "take profit at 3x on wif", want: (r) => !!plan(r)?.some((s) => s.kind === "takeProfit" && s.multiple === 3), means: "take profit 3x" },
  { say: "sell bonk when it doubles", want: (r) => !!plan(r)?.some((s) => s.kind === "takeProfit" && s.multiple === 2), means: "take profit 2x" },
  { say: "buy the dip on bonk 20% with $10", want: (r) => !!plan(r)?.some((s) => s.kind === "dip"), means: "dip buy" },
  // Follow-ups about the coin just discussed
  { say: "buy 20 of it", last: "BONK", want: buys("BONK", 20), means: "buy $20 of BONK (it = last coin)" },
  { say: "sell half of it", last: "WIF", want: sells("WIF", 50), means: "sell half WIF" },
  { say: "buy $10 of this", last: "WIF", want: buys("WIF", 10), means: "buy $10 of WIF" },
  { say: "ape 5 into that", last: "BONK", want: buys("BONK", 5), means: "buy $5 of BONK" },
  { say: "set a stop loss at 20% on it", last: "BONK", want: (r) => !!plan(r)?.some((s) => s.kind === "stopLoss" && s.coin === "BONK"), means: "stop loss on BONK" },
  { say: "is it safe", last: "BONK", want: looks("BONK"), means: "check BONK" },
  { say: "who made it", last: "BONK", want: creatorOf("BONK"), means: "BONK's creator" },
  // Checking a coin
  { say: "is bonk safe", want: looks("BONK"), means: "check BONK" },
  { say: "is wif a rug", want: looks("WIF"), means: "check WIF" },
  { say: "price of bonk", want: looks("BONK"), means: "check BONK" },
  { say: "how much is wif", want: looks("WIF"), means: "check WIF" },
  { say: "whats the mcap of bonk", want: looks("BONK"), means: "check BONK" },
  { say: "tell me about wif", want: looks("WIF"), means: "check WIF" },
  { say: "is bonk legit?", want: looks("BONK"), means: "check BONK" },
  { say: "should i buy bonk", want: looks("BONK"), means: "check BONK first" },
  // Creators
  { say: "who created bonk", want: creatorOf("BONK"), means: "BONK's creator" },
  { say: "pull the creator ca of wif", want: creatorOf("WIF"), means: "WIF's creator" },
  { say: "dev wallet of bonk", want: creatorOf("BONK"), means: "BONK's creator" },
  { say: "what else did the bonk dev launch", want: creatorCoins("BONK"), means: "BONK creator's other coins" },
  { say: "show coins by this creator that hit 50k", last: "WIF", want: creatorCoins("WIF", 50_000), means: "WIF creator's coins over $50k" },
  { say: "pull up his coins that reached 50k+ mc", last: "BONK", want: creatorCoins("BONK", 50_000), means: "creator's coins over $50k" },
  { say: "coins by the 9TKbd3VFaMSXsEAicD9JVQWpWwAoLi4fSgWmZL2cpump creator on solana that hit $50000", want: (r) => r.kind === "creatorCoins" && r.coin === "9TKbd3VFaMSXsEAicD9JVQWpWwAoLi4fSgWmZL2cpump" && r.chain === "solana" && r.minPeakUsd === 50_000, means: "the creator card button" },
  { say: "did the creator of wif rug before", want: creatorCoins("WIF"), means: "WIF creator's track record" },
  // The account and the market
  { say: "how are my bags", want: kind("portfolio"), means: "your coins" },
  { say: "wat do i hold", want: kind("portfolio"), means: "your coins (typo)" },
  { say: "show me my pnl", want: kind("portfolio"), means: "your coins" },
  { say: "am i up today", want: kind("portfolio"), means: "your coins" },
  { say: "whats hot rn", want: kind("trending"), means: "trending" },
  { say: "what's pumping on base", want: (r) => r.kind === "trending" && r.chain === "base", means: "trending on Base" },
  { say: "any good coins today", want: kind("trending"), means: "trending" },
  { say: "my open orders", want: kind("orders"), means: "your orders" },
  { say: "hi", want: kind("help"), means: "hello" },
  { say: "what can u do", want: kind("help"), means: "the menu" },
  // Things Crux doesn't do, money, problems, chat: an honest line and buttons back (never a dead end)
  { say: "will bonk moon", want: steer(/No one can tell/, "Check BONK"), means: "no predictions; check + orders" },
  { say: "where will wif be tomorrow", want: steer(/No one can tell/), means: "no predictions" },
  { say: "short bonk 10x", want: steer(/no shorts, leverage/), means: "no leverage; stop loss instead" },
  { say: "can i bridge to base", want: steer(/No bridging or gas/), means: "one balance, every chain" },
  { say: "do i need eth for gas", want: steer(/No bridging or gas/), means: "Crux pays network costs" },
  { say: "how do i withdraw", want: steer(/Withdrawals are on your account page/), means: "the account page" },
  { say: "how do i add money", want: steer(/Add money/), means: "Add money" },
  { say: "what are the fees", want: steer(/0\.5% a trade/), means: "the fee" },
  { say: "my trade failed where is my money", want: steer(/Sorry about that/, "What do I hold?"), means: "where things stand" },
  { say: "i got rugged", want: steer(/Rough one/), means: "where you stand + stop losses" },
  { say: "thanks", want: steer(/Anytime/), means: "short and friendly" },
  { say: "are you a bot", want: steer(/I'm Crux/), means: "who Crux is" },
  { say: "buy 20 of bonk then buy 10 of wif, sell all my pepe, then set a stop loss on everything and also check popcat", want: steer(/one at a time/), means: "one at a time, each a button" },
];
