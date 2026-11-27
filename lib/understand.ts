/**
 * Ask Crux's understanding layer, no AI (founder 2026-11-27: smarter for free). Runs before the command reader
 * (lib/commandIntent, lib/commandChat) and turns everyday typing into what it reads:
 *   - typos traders make ("byu", "sel", "wat") and number words ("twenty bucks");
 *   - everyday verbs ("grab", "cop", "put 25 in", "cash out", "get me out of") into buy / sell;
 *   - questions about a coin ("is bonk safe", "price of wif"), its creator ("who made it", "dev wallet of bonk") and
 *     the creator's other coins ("his coins that hit 50k") into the chat's cards;
 *   - "it", "this", "that one" into the coin the conversation was about.
 * Pure and deterministic, every rule covered by the corpus (lib/askCorpus.ts).
 */
import type { CommandChain } from "./commandIntent.ts";

/** Misspellings seen in traders' typing, whole words only. */
const TYPOS: Record<string, string> = {
  byu: "buy", buyy: "buy", bye: "buy", bui: "buy", buu: "buy", biy: "buy", buyt: "buy", buty: "buy", bbuy: "buy", buiy: "buy",
  sel: "sell", sll: "sell", selll: "sell", slel: "sell", seel: "sell", sellll: "sell", sel1: "sell",
  hlaf: "half", hafl: "half", haf: "half", hallf: "half",
  wat: "what", wht: "what", whta: "what", waht: "what", wut: "what", whats: "what's", wats: "what's",
  trnding: "trending", trendin: "trending", tredning: "trending", trneding: "trending",
  oders: "orders", ordres: "orders", odrers: "orders",
  stoploss: "stop loss", stoplos: "stop loss", stopp: "stop", takeprofit: "take profit", tkae: "take",
  porfolio: "portfolio", portfoilo: "portfolio", portfollio: "portfolio", hodl: "hold", hodling: "holding",
  creater: "creator", craetor: "creator", cretor: "creator", deploye: "deployer", deployr: "deployer",
  saef: "safe", sfae: "safe", ligit: "legit", legti: "legit",
  u: "you", ur: "your", r: "are", pls: "please", plz: "please", rn: "now", tmrw: "tomorrow", abt: "about",
};

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Whole-word typo fixes ($TICKERS and addresses are never touched). */
export function fixTypos(s: string): string {
  return s.replace(/(^|[\s,])([A-Za-z][A-Za-z0-9]*)(?=$|[\s,?!.])/g, (m, pre: string, w: string) => {
    const fix = TYPOS[w.toLowerCase()];
    // An ALL-CAPS word is a ticker the trader meant (BYE, SEL): left alone.
    return fix && w !== w.toUpperCase() ? pre + fix : m;
  });
}

/** "twenty five dollars" → "25 dollars", "a hundred bucks" → "100 bucks", "fifty k" → "50 k". Lower-case words only. */
export function numberWords(s: string): string {
  const word = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|a)";
  return s.replace(new RegExp(`\\b${word}(?:[\\s-]+${word})*\\b`, "g"), (m) => {
    const parts = m.split(/[\s-]+/);
    if (parts.length === 1 && (parts[0] === "a" || parts[0] === "one")) return m; // "a", "one" alone stay words
    let total = 0;
    let cur = 0;
    for (const p of parts) {
      if (p === "a") cur = cur || 1;
      else if (p === "hundred") cur = (cur || 1) * 100;
      else if (p === "thousand") {
        total += (cur || 1) * 1000;
        cur = 0;
      } else cur += UNITS[p] ?? 0;
    }
    const n = total + cur;
    return n > 0 ? String(n) : m;
  });
}

const MONEY = String.raw`\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?(?:\$|usd[ct]?|dollars?|bucks)?`;
const dollarsOf = (n: string, unit?: string) => {
  const v = Number(n.replace(/,/g, "")) * (unit?.toLowerCase() === "k" ? 1_000 : unit?.toLowerCase() === "m" ? 1_000_000 : 1);
  return `$${+v.toFixed(2)}`;
};
const COIN = String.raw`(\$?[A-Za-z0-9][A-Za-z0-9.]{0,43})`;

/**
 * Everyday trading phrases into the commands the reader knows. Each rewrite only fires on its own shape, so a coin
 * that happens to be called GET or COP is still read as a coin when typed as one ("buy $5 of COP").
 */
export function rephrase(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  // Stop losses said other ways: "cut bonk at -20%", "stop out bonk at 20%", "protect my bonk at 20% down".
  s = s.replace(new RegExp(String.raw`^(?:cut|stop\s+out|protect)\s+(?:my\s+)?${COIN}\s+(?:at|if it drops|below)\s+-?(\d+(?:\.\d+)?)\s?%(?:\s+down)?$`, "i"), (_, c: string, p: string) => `stop loss ${p}% on ${c}`);
  // A trailing stop with the coin first: "trail bonk 15%".
  s = s.replace(new RegExp(String.raw`^trail(?:ing)?(?:\s+stop)?\s+(?:my\s+)?${COIN}\s+(?:at\s+|by\s+)?(\d+(?:\.\d+)?)\s?%$`, "i"), (_, c: string, p: string) => `trailing stop ${p}% on ${c}`);
  // Dip buys said other ways: "if bonk dips 30% buy $10", "catch bonk at -30% with 10 bucks".
  s = s.replace(new RegExp(String.raw`^if\s+${COIN}\s+(?:dips|drops|falls|goes down)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s?%\s*,?\s+(?:buy|grab|get)\s+${MONEY}$`, "i"), (_, c: string, p: string, n: string, u?: string) => `buy ${dollarsOf(n, u)} of ${c} if it drops ${p}%`);
  s = s.replace(new RegExp(String.raw`^catch\s+${COIN}\s+(?:at|on a)\s+-?(\d+(?:\.\d+)?)\s?%(?:\s+dip)?\s+(?:with|for)\s+${MONEY}$`, "i"), (_, c: string, p: string, n: string, u?: string) => `buy ${dollarsOf(n, u)} of ${c} if it drops ${p}%`);
  // "take profit(s) on X" with a target is the order; without one it's selling now (all, or the share named).
  // (A target reads "at 2x", "@ 3x", "at 50%", "when it's up 50%"; a bare "25% bonk" is the share to sell now.)
  if (/\btake\s+profits?\s+on\b/i.test(s) && !/\d\s?x\b|(?:\bat|@|\bup)\s*\+?\d+(?:\.\d+)?\s?%/i.test(s)) s = s.replace(/\btake\s+profits?\s+on\s+/i, "sell ");
  s = s.replace(new RegExp(String.raw`\btake\s+profits?\s+on\s+${COIN}\s+(?:at|@)\s+(\d+(?:\.\d+)?)\s?x\b`, "i"), (_, c: string, x: string) => `take profit at ${x}x on ${c}`);
  // Selling verbs with a share keep the share; without one they sell everything ("dump 25% bonk" sells 25%, not all).
  const SHARE = String.raw`(all(?:\s+of)?|everything|half(?:\s+of)?|a\s+quarter(?:\s+of)?|\d+(?:\.\d+)?\s?%(?:\s+of)?)`;
  s = s.replace(new RegExp(String.raw`^(?:dump|exit|jeet|paper\s?hand|cash\s+out(?:\s+of)?|get\s+me\s+out\s+of|take\s+me\s+out\s+of|close(?:\s+out)?|offload|unload|liquidate)\s+${SHARE}\s+(?:my\s+)?`, "i"), (_, share: string) => `sell ${share.replace(/\s+of$/i, "")} of `);
  // "get me out of X", "cash out (of) X", "take me out of X" → sell all.
  s = s.replace(/\b(?:get|take)\s+me\s+out\s+(?:of\s+)?(?:my\s+)?/i, "sell all of ");
  s = s.replace(/\bcash\s+out\s+(?:of\s+)?(?:my\s+)?/i, "sell all of ");
  s = s.replace(/^close\s+(?:out\s+)?(?:my\s+)?(?!.*\b(?:position|bag|trade)\b)/i, "sell all of ");
  // "ape $1k into bonk", "gimme $20 of bonk", "give me 20 bucks of bonk" → buy (amounts with k / m kept).
  s = s.replace(new RegExp(String.raw`^(?:ape|aping|send(?:\s+it)?|gimme|give\s+me)\s+${MONEY}\s+(?:into|in|on|of)\s+`, "i"), (_, n: string, u?: string) => `buy ${dollarsOf(n, u)} of `);
  // "take half off X", "take 30% out of X" → sell that share.
  s = s.replace(/\btake\s+(half|a quarter|\d+(?:\.\d+)?\s?%)\s+(?:off|out of|of)\s+(?:my\s+)?/i, (_, share: string) => `sell ${share} of `);
  // Other ways to sell.
  s = s.replace(/\b(?:offload|unload|liquidate|paper\s?hand|jeet)\b/i, "sell");
  s = s.replace(/\bclose\s+(?:out\s+)?(?:my\s+)?([A-Za-z0-9$]+)\s+(?:position|bag|trade)\b/i, "sell all of $1");
  // "set (up) a stop loss / take profit" → the order itself ("set" isn't a coin).
  s = s.replace(/\b(?:set|place|put|add)\s+(?:up\s+)?(?:a|an|my)?\s*(stop[- ]?loss|sl|take[- ]?profit|tp|trailing(?: stop)?)\b/i, "$1");
  // "put / throw / invest $25 in X" → buy.
  s = s.replace(new RegExp(String.raw`\b(?:put|throw|invest|drop|chuck|toss)\s+${MONEY}\s+(?:in|into|on)\s+`, "i"), (_, n: string, u?: string) => `buy ${dollarsOf(n, u)} of `);
  // "buy the dip on X 20% with $10" → a dip buy.
  s = s.replace(new RegExp(String.raw`\bbuy\s+(?:the\s+)?dip\s+(?:on|of|in)\s+${COIN}\s+(?:at\s+|by\s+)?(-?\d+(?:\.\d+)?)\s?%\s+(?:with|for|using)\s+${MONEY}`, "i"), (_, c: string, pct: string, n: string, u?: string) => `buy ${dollarsOf(n, u)} of ${c} if it drops ${pct.replace("-", "")}%`);
  // Other ways to buy: cop, scoop, snag, grab, get, pick up, load up on, purchase ("me" dropped: "grab me 20 of X").
  s = s.replace(/\b(?:cop|scoop|snag|grab|get|purchase|pick\s+up|load\s+up\s+on|load\s+up|buy\s+into|ape\s+into)\b(\s+me\b)?/i, (m) => (/^get\b/i.test(m) && /\bget\s+(?:rid|out)\b/i.test(s) ? m : "buy"));
  // "worth of" / "worth" around an amount.
  s = s.replace(/\bworth\s+(?:of\s+)?/gi, "of ");
  // "buy X for $5" → "buy $5 of X".
  s = s.replace(new RegExp(String.raw`\bbuy\s+${COIN}\s+(?:for|with)\s+${MONEY}\s*$`, "i"), (_, c: string, n: string, u?: string) => `buy ${dollarsOf(n, u)} of ${c}`);
  // An amount right after "buy" with no "$": dollars ("buy 20 bonk", "buy 1k of bonk", "buy 20$ of bonk").
  s = s.replace(new RegExp(String.raw`\bbuy\s+\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?(\$|usd[ct]?|dollars?|bucks)?(?!\s?(?:%|x\b))\s+(?:of\s+)?`, "i"), (_, n: string, u?: string) => `buy ${dollarsOf(n, u)} of `);
  // "20$" anywhere → "$20".
  s = s.replace(/(^|\s)(\d[\d,]*(?:\.\d+)?)\$/g, "$1$$$2");
  // No verb, just money and a coin: "5 bucks bonk", "$10 wif", "i want 20 of bonk" ("i want" is filler), "bonk $20".
  const lead = s.replace(/^(?:i\s+(?:want|need|wanna|would like)|i'?d\s+like|lemme\s+have|let\s+me\s+have)\s+/i, "");
  const bare =
    lead.match(new RegExp(String.raw`^(?:\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?|(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?(?:usd[ct]?|dollars?|bucks|\$)?)\s+(?:of\s+|in\s+|into\s+|on\s+)?${COIN}$`, "i")) ??
    null;
  const coinFirst = lead.match(new RegExp(String.raw`^${COIN}\s+(?:\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?|(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?(?:usd[ct]?|dollars?|bucks|\$))$`, "i"));
  const money = (n?: string) => n !== undefined && Number(n.replace(/,/g, "")) > 0;
  // A bare number with no money word ("20 bonk") is dollars only after "i want"; on its own it could be anything.
  if (bare && money(bare[1] ?? bare[3]) && (bare[1] || /\b(?:usd|dollars?|bucks|\$)/i.test(lead) || lead !== s)) s = `buy ${dollarsOf(bare[1] ?? bare[3], bare[2] ?? bare[4])} of ${bare[5]}`;
  else if (coinFirst && !/^(?:buy|sell|stop|take|tp|sl|trail|check|is|what|who)$/i.test(coinFirst[1]) && money(coinFirst[2] ?? coinFirst[4])) s = `buy ${dollarsOf(coinFirst[2] ?? coinFirst[4], coinFirst[3] ?? coinFirst[5])} of ${coinFirst[1]}`;
  // "when it doubles" (2x after plainSymbols) / "when it 3x" → "when it hits 3x" (the take-profit reader's words).
  s = s.replace(/\b(when|if|once)\s+it\s+(\d+(?:\.\d+)?)\s?x\b/gi, "$1 it hits $2x");
  s = s.replace(/\b(when|if|once)\s+it\s+(doubles|doubled)\b/gi, "$1 it hits 2x").replace(/\b(when|if|once)\s+it\s+(triples|tripled)\b/gi, "$1 it hits 3x");
  return s;
}

/** Pronouns for "the coin we were talking about". */
const PRONOUN = /\b(?:(?:this|that|the)\s+(?:coin|token|one|memecoin|meme)|it|this|that|dat|dis)\b/i;
export const hasPronoun = (s: string) => PRONOUN.test(s);
/** The message with its pronoun swapped for the coin the conversation was about. */
export const withCoin = (s: string, coin: string) => s.replace(PRONOUN, coin);

const CHAIN_WORDS: Record<string, CommandChain> = { base: "base", solana: "solana", sol: "solana", bnb: "bnb", bsc: "bnb", binance: "bnb" };
const chainIn = (s: string): CommandChain | undefined => {
  const m = s.match(/\bon\s+(base|solana|sol|bnb|bsc|binance)\b/i);
  return m ? CHAIN_WORDS[m[1].toLowerCase()] : undefined;
};

/** What a coin question asks, before the coin is known. */
export type CoinQuestion =
  | { kind: "lookup"; coin: string | null; chain?: CommandChain }
  | { kind: "creator"; coin: string | null; chain?: CommandChain }
  | { kind: "creatorCoins"; coin: string | null; chain?: CommandChain; minPeakUsd?: number }
  | { kind: "portfolio" }
  | { kind: "trending"; chain?: CommandChain }
  | { kind: "orders" }
  | { kind: "help" };

/** Words that are never the coin in a question ("is it safe", "who made this"). */
const NOT_COIN = new Set("it its it's this that dat dis the a an coin token one my his her their dev creator deployer wallet address ca he she they guy them".split(" "));
const coinWord = (w: string | undefined, last?: string): string | null => {
  if (!w) return last ?? null;
  const c = w.replace(/^\$/, "").replace(/[?!.,]+$/, "");
  if (!c || NOT_COIN.has(c.toLowerCase())) return last ?? null;
  return c;
};

/** Words that make a message a trade (a trade mentioning the dev stays a trade). */
const TRADING = /\b(?:buy|sell|ape|dump|stop[- ]?loss|take[- ]?profit|tp|sl|trail(?:ing)?|scan|copy|snipe)\b/;
const ADDRESS_ANY = /\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/;
/**
 * The coin a creator question names, wherever it sits: an address, a $TICKER, "BONK's creator", "creator of BONK";
 * else the coin the conversation is about.
 */
function anyCoin(s: string, last?: string): string | null {
  const a = s.match(ADDRESS_ANY);
  if (a) return a[1];
  const ticker = s.match(/\$([A-Za-z][A-Za-z0-9]{1,14})\b/);
  if (ticker) return ticker[1];
  const before = s.match(/\b([A-Za-z][A-Za-z0-9]{1,14})(?:'s|s')?\s+(?:creator|dev|deployer|founder)\b/i);
  if (before && !NOT_COIN.has(before[1].toLowerCase()) && !QUESTION_WORDS.has(before[1].toLowerCase())) return before[1];
  const after = s.match(/\b(?:creator|dev|deployer|founder)\s+(?:of|for|behind)\s+([A-Za-z][A-Za-z0-9]{1,14})\b/i);
  if (after && !NOT_COIN.has(after[1].toLowerCase())) return after[1];
  return last ?? null;
}
/** Words that sit before "creator" in a question but aren't a coin ("about its creator", "who's the dev"). */
const QUESTION_WORDS = new Set("about who whos who's is the its it's this that what whats what's show tell find pull get give me real original actual same".split(" "));

/** A peak named in the message: "hit 50k", "reached $1m", "over 100k mc", "50k+". */
function peakIn(s: string): number | undefined {
  const m = s.match(/(?:hit|hits|reached|reach|over|above|past|did|went|more than|>|at least)\s*\$?(\d+(?:\.\d+)?)\s*(k|m)?\b/i) ?? s.match(/\$?(\d+(?:\.\d+)?)\s*(k|m)\s*\+/i);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * (m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1));
}

/**
 * A question about a coin, its creator, the account or the market; null when the message is something else (a trade,
 * a scan). `last`: the coin the conversation was about, for "is it safe" / "who made it" / "his coins". Pure.
 */
export function readCoinQuestion(raw: string, last?: string): CoinQuestion | null {
  const s = raw.trim().replace(/[?!.]+$/g, "").replace(/\s+/g, " ");
  const t = s.toLowerCase();
  const chain = chainIn(s);
  const noChain = s.replace(/\s+on\s+(base|solana|sol|bnb|bsc|binance)\b/i, "");
  let m: RegExpMatchArray | null;

  // The creator's other coins: "his coins that hit 50k", "what else did the bonk dev launch", "did the creator rug before".
  const others =
    /\b(?:his|her|their|the dev'?s|the creator'?s|dev'?s|creator'?s|deployer'?s)\s+(?:other\s+)?(?:coins|launches|tokens|projects)\b/.test(t) ||
    /\b(?:coins|launches|tokens)\s+(?:by|from|made by|launched by|of)\s+(?:this|that|the|his|same)?\s*(?:creator|dev|deployer|guy|wallet)\b/.test(t) ||
    /\bwhat\s+else\s+(?:did|has)\s+(?:the\s+)?(?:\S+\s+)?(?:dev|creator|deployer)\s+(?:launch|make|create|deploy|do)/.test(t) ||
    /\b(?:did|has)\s+(?:the\s+)?(?:\S+\s+)?(?:creator|dev|deployer)\b.*\brug/.test(t) ||
    /\b(?:creator|dev|deployer)'?s?\s+(?:track record|history|past|record)\b/.test(t) ||
    /\bother\s+(?:coins|launches|tokens)\s+(?:by|from)\b/.test(t) ||
    /\bcoins\s+(?:by|from)\s+(?:the\s+)?\S+\s+(?:creator|dev|deployer)\b/.test(t);
  if (others) {
    m = noChain.match(/\b(?:dev|creator|deployer)\s+(?:of|for|behind)\s+(\$?[A-Za-z0-9]{2,44})/i) ?? noChain.match(/\b(?:the\s+)?(\$?[A-Za-z0-9]{2,44})\s+(?:dev|creator|deployer)\b/i) ?? noChain.match(/\bcoins\s+(?:by|from)\s+(?:the\s+)?(\$?[A-Za-z0-9]{2,44})\s+(?:creator|dev)/i);
    return { kind: "creatorCoins", coin: coinWord(m?.[1], last), chain, minPeakUsd: peakIn(t) };
  }
  // The creator: "who made bonk", "creator of wif", "dev wallet of bonk", "pull the creator ca of wif", "bonk dev".
  if (
    (m = noChain.match(/^who\s+(?:made|created|launched|deployed|dev'?d|is behind|owns|minted)\s+(.+)$/i)) ||
    (m = noChain.match(/\b(?:creator|dev|deployer|founder)(?:'?s)?\s*(?:wallet|address|ca|contract)?\s+(?:of|for|on|behind)\s+(\S+)$/i)) ||
    (m = noChain.match(/^(?:pull|get|show|give|find|send)\s+(?:me\s+)?(?:up\s+)?(?:the\s+)?(?:creator|dev|deployer)(?:'?s)?(?:\s+(?:wallet|address|ca))?(?:\s+(?:of|for))?(?:\s+(\S+))?$/i)) ||
    (m = noChain.match(/^(\$?[A-Za-z0-9]{2,44})(?:'?s)?\s+(?:creator|dev|deployer)(?:\s+(?:wallet|address|ca))?$/i))
  ) {
    return { kind: "creator", coin: coinWord(m[1]?.split(" ").pop(), last), chain };
  }
  // Anything else about the creator that isn't a trade ("tell me about its creator", "<address> who's the dev",
  // "creator?", "who made this one"): the coin named anywhere in it, else the one the conversation is about.
  if (/\b(?:creator|dev|deployer|founder|who\s+(?:made|created|launched|deployed|minted))\b/.test(t) && !TRADING.test(t)) {
    return { kind: "creator", coin: anyCoin(noChain, last), chain };
  }
  // A pasted address with a question about it ("0x… tell me about it", "is 0x… safe"): its facts.
  const pasted = noChain.match(ADDRESS_ANY);
  if (pasted && !TRADING.test(t) && /\b(?:about|safe|legit|rug|scam|info|check|price|mcap|what|tell|is|any good|thoughts)\b/.test(t)) return { kind: "lookup", coin: pasted[1], chain };
  // A coin's facts: "is bonk safe", "price of wif", "how much is wif", "tell me about bonk", "should i buy bonk".
  if (
    (m = noChain.match(/^(?:is|are)\s+(\S+)\s+(?:safe|legit|a rug|rugging|rugged|a scam|scam|a honeypot|good|ok|okay|worth it|a good buy|real|dead|still alive)\b/i)) ||
    (m = noChain.match(/^(?:what(?:'?s| is)\s+)?(?:the\s+)?(?:price|mcap|market cap|mc|marketcap|chart|info|details|liquidity|volume)\s+(?:of|on|for)\s+(\S+)$/i)) ||
    (m = noChain.match(/^how\s+much\s+is\s+(\S+)(?:\s+(?:worth|at|now))?$/i)) ||
    (m = noChain.match(/^what(?:'?s| is)\s+(\S+)\s+(?:at|doing|trading at|worth)$/i)) ||
    (m = noChain.match(/^(?:tell me|talk to me|what do you know)\s+(?:more\s+)?about\s+(\S+)$/i)) ||
    (m = noChain.match(/^(?:thoughts|opinion|views?|anything|news|updates?)\s+on\s+(\S+)$/i)) ||
    (m = noChain.match(/^what(?:'?s| is)\s+(?!trending\b|hot\b|pumping\b|moving\b|up\b|new\b|my\b|popping\b|good\b)(\S+)$/i)) ||
    (m = noChain.match(/^should\s+i\s+(?:buy|get|ape|ape into|grab|invest in)\s+(\S+)$/i)) ||
    (m = noChain.match(/^(\$?[A-Za-z0-9]{2,44})\s+(?:price|mcap|mc|chart|safe|legit|info)$/i))
  ) {
    return { kind: "lookup", coin: coinWord(m[1], last), chain };
  }
  // Orders: "show my stop losses", "what orders do i have".
  if (/\b(?:show|see|list|check|my|what|which)\b.*\b(?:stop[- ]?loss(?:es)?|take[- ]?profits|limit orders?|orders)\b/.test(t) && !/\b(?:buy|sell|ape|dump|cancel)\b/.test(t) && !/\d/.test(t)) return { kind: "orders" };
  // The account: "balance", "what's in my wallet", "how much money do i have".
  if (/\bwhat'?s\s+in\s+my\s+(?:wallet|account|bag)\b|^(?:my\s+)?(?:balance|cash|money|funds)$|\bhow\s+much\s+(?:money|cash|usdc)\s+(?:do\s+i\s+have|is\s+left|have\s+i\s+got)\b|\bmy\s+balance\b/.test(t)) return { kind: "portfolio" };
  // The account.
  if (/^am\s+i\s+(?:up|down|in profit|winning|losing|green|red)\b/.test(t) || /\bhow\s+much\s+(?:am i up|am i down|have i made|did i make|have i lost|did i lose)\b/.test(t) || /^(?:my\s+)?(?:profits?|gains|losses|p ?n ?l)$/.test(t)) return { kind: "portfolio" };
  // The market.
  if (/\b(?:any|some)\s+(?:good|new|hot|decent)\s+(?:coins|tokens|plays|memes)\b/.test(t) || /^what\s+(?:should|to|can)\s+i\s+(?:buy|ape|get)(?:\s+(?:now|today))?$/.test(t) || /\bwhat'?s\s+popping\b/.test(t) || /\bbest\s+(?:coins|tokens|plays)\b/.test(t) || /^(?:show\s+(?:me\s+)?)?(?:new|fresh|newest|latest)\s+(?:coins|launches|tokens|pairs)$/.test(t) || /^(?:show\s+(?:me\s+)?)?(?:the\s+)?(?:runners|movers|pumpers)$/.test(t)) return { kind: "trending", chain };
  if (/^what\s+can\s+(?:you|ya|crux)\s+do\b|^how\s+(?:do\s+)?(?:i|you)\s+use\s+(?:this|you|crux)\b/.test(t)) return { kind: "help" };
  return null;
}
