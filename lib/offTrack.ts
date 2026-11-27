import type { ChatOption, Reply } from "./commandChat.ts";

/**
 * When a trader asks for something Crux doesn't do, or says too much at once, a short honest answer and buttons back
 * to what it does: never a dead end, never a lecture. How traders type and what they expect (founder 2026-11-27):
 * fast, short, plain, with the next tap ready. Pure, covered by the corpus (lib/askCorpus.ts).
 */
const say = (text: string, options: ChatOption[]): Reply => ({ kind: "ask", text, options });
const check = (coin?: string): ChatOption[] => (coin ? [{ label: `Check ${coin}`, command: `check ${coin}` }] : []);
const HOLD: ChatOption = { label: "What do I hold?", command: "what do I hold?" };
const ORDERS: ChatOption = { label: "Show my orders", command: "show my orders" };
const TRENDING: ChatOption = { label: "What's trending?", command: "what's trending?" };
const HELP: ChatOption = { label: "What can you do?", command: "help" };
const ACCOUNT: ChatOption = { label: "Open my account", command: "", href: "/account" };

/** The coin a message names, roughly (a $TICKER or a capitalised word), for the buttons. */
function coinIn(s: string, last?: string): string | undefined {
  const t =
    s.match(/\$([A-Za-z][A-Za-z0-9]{1,14})\b/) ??
    s.match(/\b([A-Z][A-Z0-9]{1,14})\b/) ??
    s.match(/\b(?:will|does|can|could|is|would|short|long|on|of)\s+(?:my\s+)?([a-z][a-z0-9]{1,14})\b/i);
  const w = t?.[1];
  return w && !NOT_COIN.has(w.toLowerCase()) ? w.toUpperCase() : last;
}
const NOT_COIN = new Set("it this that the a an my me i you we they he she price coin coins token tokens base solana sol bnb bsc everything all going gonna".split(" "));

/**
 * A message about something Crux doesn't do (predictions, leverage, shorting, bridging, sending to a friend), about the
 * money itself (adding, withdrawing, fees), a problem, or plain chat. Null for anything else. `last`: the coin the
 * conversation was about.
 */
export function readOffTrack(raw: string, last?: string): Reply | null {
  const s = raw.trim();
  const t = s.toLowerCase().replace(/[!.?]+$/g, "");
  const coin = coinIn(s, last);

  // "Will BONK moon?", "where will wif be tomorrow", "is it going to pump": nobody knows; show what can be known.
  if (/\b(will|gonna|going to)\b.*\b(moon|pump|dump|go up|go down|rise|fall|crash|10x|100x|hit|reach|recover|bounce)\b/.test(t) || /\bwhere\s+will\b.*\bbe\b/.test(t) || /\b(price )?prediction\b|\bpredict\b/.test(t) || /\bwhen\s+(moon|lambo|pump)\b/.test(t)) {
    return say("No one can tell where a price goes next, me included. I can show you what's happening now, and set orders so you don't have to watch it.", [
      ...check(coin),
      ...(coin ? [{ label: `Take profit at 2x on ${coin}`, command: `take profit at 2x on ${coin}` }, { label: `Stop loss 20% on ${coin}`, command: `stop loss 20% on ${coin}` }] : [TRENDING]),
    ]);
  }
  // Leverage, shorts, perps, options.
  if (/\b(short|shorting|leverage|leveraged|perps?|perpetuals?|futures|margin|options?|calls?|puts?|long)\b/.test(t) && /\b(short|leverage|leveraged|perps?|perpetuals?|futures|margin|\d+x long|long \d+x|options|calls|puts)\b/.test(t)) {
    return say("Crux trades the coins themselves: no shorts, leverage or perps. To cap a loss instead, set a stop loss.", [...(coin ? [{ label: `Stop loss 20% on ${coin}`, command: `stop loss 20% on ${coin}` }] : []), HOLD, HELP]);
  }
  // Bridging, swapping chains, gas.
  if (/\b(bridge|bridging|swap (?:to|chains?)|move .*(?:to|from) (?:base|solana|sol|bnb|bsc)|gas|need eth|need sol|need bnb)\b/.test(t)) {
    return say("No bridging or gas needed: your one Crux balance buys on Solana, Base and BNB Chain, and Crux pays the network costs.", [{ label: "Buy $5 of BONK", command: "buy $5 of BONK" }, TRENDING, HOLD]);
  }
  // Adding money, withdrawing, sending.
  if (/\b(withdraw|withdrawal|cash ?out to|send (?:money|it|usdc|cash)? ?to|transfer (?:to|out)|take (?:my )?money out)\b/.test(t)) {
    return say("Withdrawals are on your account page: your money goes to the wallet you bound to your account, and only there.", [ACCOUNT, HOLD]);
  }
  if (/\b(deposit|add (?:money|funds|cash|usdc)|top ?up|fund (?:my )?account|how do i (?:get|put) money)\b/.test(t)) {
    return say("Tap Add money next to your balance (top right), or open your account page. Then any coin is one tap away.", [ACCOUNT, TRENDING]);
  }
  // Fees.
  if (/\b(fees?|how much do you (?:charge|take)|commission|cost to trade)\b/.test(t)) {
    return say("0.5% a trade, at least $0.05 (0.15% on the biggest Solana coins). Crux pays the network costs, so that's all you pay.", [TRENDING, HOLD]);
  }
  // Something went wrong.
  if (/\b(failed|didn'?t go through|not working|doesn'?t work|stuck|missing|where(?:'s| is| are) my (?:money|coins?|cash|funds)|lost my|bug|broken|error)\b/.test(t)) {
    return say("Sorry about that. A trade that fails leaves your cash in your balance. Here's where everything stands right now:", [HOLD, ORDERS]);
  }
  // Rough day.
  if (/\b(lost (?:everything|it all|so much|all my)|i'?m (?:rekt|broke|done)|got rugged|rigged|this sucks|i hate this)\b/.test(t)) {
    return say("Rough one. Let's look at where you stand, and set stop losses so a drop can't take more than you choose.", [HOLD, ...(coin ? [{ label: `Stop loss 20% on ${coin}`, command: `stop loss 20% on ${coin}` }] : [])]);
  }
  // Plain chat.
  if (/^(thanks|thank you|thx|ty|tysm|appreciate it|cheers|nice|great|cool|ok|okay|k|kk|lol|lmao|haha|wow)( crux)?$/.test(t)) return say("Anytime. What next?", [HOLD, TRENDING]);
  if (/^(who are you|what are you|are you (?:a bot|ai|human|real))$/.test(t)) {
    return say("I'm Crux, your trading desk: one balance for Solana, Base and BNB Chain. I check coins, buy and sell, and set take profits and stop losses. Nothing trades until you confirm.", [HELP, TRENDING]);
  }
  return null;
}

/**
 * A message too long or with too much in it for one card (and the reader couldn't make one of it): take it a part at a
 * time, each part a button. Null when it isn't that.
 */
export function tooMuch(raw: string): Reply | null {
  const parts = raw
    .split(/\s*(?:,|;|\bthen\b|\band then\b|\balso\b|\bplus\b|\band\b(?=\s+(?:buy|sell|set|stop|take|check|show|scan|copy)))\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 3 && /\b(buy|sell|stop|take|check|show|scan|copy|set|dump|ape)\b/i.test(p));
  if (raw.length < 120 && parts.length < 3) return null;
  if (parts.length === 0) return say("That's a lot in one go. Tell me one thing at a time, like “buy $10 of BONK” or “is WIF safe?”.", [HELP, HOLD]);
  return say("That's a few things at once. Let's take them one at a time. Tap the first:", parts.slice(0, 5).map((p) => ({ label: p.length > 40 ? `${p.slice(0, 38)}…` : p, command: p })));
}
