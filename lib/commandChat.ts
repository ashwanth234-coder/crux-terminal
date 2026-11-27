import { parseCommand, plainSymbols, withoutFiller, type CommandChain, type CommandStep } from "./commandIntent.ts";
import { deslang } from "./traderSlang.ts";

/**
 * The conversation on top of the command reader (lib/commandIntent): every message gets a reply a trader can act on,
 * never a dead end. Still fixed rules, no AI:
 *   - a pasted address or a bare ticker ("BONK", "$WIF", "0x…") → the coin's facts, then "Buy or sell?" buttons;
 *   - a command missing one thing ("buy BONK", "buy $5") → a question, with answer buttons where they're obvious;
 *   - "scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x" → a scan the trader confirms once;
 *   - anything else a command reads → the confirmation card.
 */
/** A reply button: `command` is what Crux reads; the trader's bubble shows `say` (else the label), never raw addresses. */
export type ChatOption = { label: string; command: string; say?: string };

/** A scan: watch new coins on `chains` for `minutes`, buy one (at most) that passes the rules, then the exits. */
export type ScanRule = {
  chains: CommandChain[];
  /**
   * Keep watching for `minutes` and buy what turns up (the trader said "scan", "watch", "keep looking", or for how
   * long). False: find the best coin right now, and show it to confirm ("buy a coin which…").
   */
  watch: boolean;
  minutes: number;
  /** Dollars traded in the coin's last hour. */
  minVolume: number;
  usd: number;
  /** Sell everything at this multiple of the buy price (a take-profit order, kept by the server). */
  takeProfit?: number;
  /** Sell everything if it drops this much under the buy price. */
  stopLossPct?: number;
  /** The stop loss is Crux's default safety stop (the trader named none; "no stop loss" turns it off). */
  safetyStop: boolean;
  /** Only coins launched within this many hours… */
  maxAgeHours: number;
  /** …and at least this many hours ago (0: any). */
  minAgeHours: number;
};

/** Every chain Crux trades, in the order a scan lists them. */
export const ALL_CHAINS: CommandChain[] = ["solana", "base", "bnb"];

/** Copy a Solana wallet's trades for `minutes`: buy `usd` of each coin it buys (at most `maxCopies`), then the exits. */
export type CopyRule = {
  wallet: string;
  usd: number;
  minutes: number;
  maxCopies: number;
  /** Sell all of a copied coin once the wallet sells it. */
  followSells: boolean;
  takeProfit?: number;
  stopLossPct?: number;
};

export type Reply =
  | { kind: "plan"; steps: CommandStep[] }
  /** "hi", "help", "what can you do": a friendly menu of what Crux can do. */
  | { kind: "help"; greeting: boolean }
  /** "what do I hold?", "how am I doing?": the coins in the one balance with profit / loss. */
  | { kind: "portfolio" }
  /** "what's trending?" (on one chain, or all). */
  | { kind: "trending"; chain?: CommandChain }
  /** "show my orders", "cancel my orders". */
  | { kind: "orders"; cancel: boolean }
  | { kind: "copy"; rule: CopyRule }
  | { kind: "lookup"; coin: string; chain?: CommandChain }
  /** "take initials on BONK": sell enough to get back what was put in (the page works the share out from the entry). */
  | { kind: "initials"; coin: string; chain?: CommandChain }
  | { kind: "scan"; rule: ScanRule }
  /** A question. `template`: the next message fills its "{}" (e.g. the coin a buy was missing). */
  | { kind: "ask"; text: string; options?: ChatOption[]; template?: string }
  | { kind: "error"; text: string }
  /** Ask Crux's AI (lib/askAi): its words, then the cards it showed. */
  | { kind: "ai"; text: string; cards: Reply[] }
  /** The AI is still answering. */
  | { kind: "thinking" }
  /** A list of coins the AI found (e.g. a creator's coins that reached a value), each tappable. */
  | { kind: "coins"; title: string; chain: CommandChain; coins: { address: string; symbol?: string; note?: string }[] };

export const SCAN_LIMITS = { minMinutes: 5, maxMinutes: 180, maxAgeHours: 24 };
/** A scan buys a coin it found itself: unless told otherwise, it's sold if it drops this much. */
export const SAFETY_STOP_PCT = 30;
export const COPY_LIMITS = { maxCopies: 10, defaultCopies: 3 };
export const BUY_SIZES = [5, 10, 25];

const ADDRESS = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;
const VERBS = /\b(buy|ape|get|purchase|grab|sell|dump|exit|close|take|tp|stop|sl|trail|trailing|scan|watch|hunt|find|snipe|wait)\b/i;
const CHAIN_WORDS: Record<string, CommandChain> = { base: "base", solana: "solana", sol: "solana", bnb: "bnb", bsc: "bnb" };

const num = (s: string) => Number(s.replace(/,/g, ""));
const scaled = (n: string, unit?: string) => num(n) * (unit?.toLowerCase() === "m" ? 1_000_000 : unit?.toLowerCase() === "k" ? 1_000 : 1);

/**
 * The command a message stands for: an answer to a question ("Which coin?" → "BONK") goes into the command that asked
 * (its "{}"); anything with its own verb is a new command. A "$" typed with an amount isn't doubled. Pure.
 */
export function fillTemplate(raw: string, template?: string): string {
  const text = withoutFiller(raw.trim().replace(/\s+/g, " "));
  if (!text || !template || VERBS.test(text)) return text;
  return template.replace("{}", template.includes("${}") ? text.replace(/^\$/, "") : text);
}

/** A command with its coin word swapped for "{}", so the next message (a pasted address) can stand in for it. Pure. */
export function askForCoin(command: string, coinWord: string): string {
  const esc = coinWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return command.replace(new RegExp(`(^|[^A-Za-z0-9])\\$?${esc}(?![A-Za-z0-9])`, "i"), "$1{}");
}

/** The questions Crux answers about the trader's own account and the market (no coin named). Pure, for tests. */
export function readQuestion(raw: string): Reply | null {
  const t = raw.trim().toLowerCase().replace(/[!.?]+$/g, "").trim();
  if (/^(hi|hello|hey|hii+|gm|good (morning|afternoon|evening)|yo|sup|hola|namaste|vanakkam)( crux)?$/.test(t)) return { kind: "help", greeting: true };
  if (/^(help|menu|options|commands|\?)$/.test(t) || /\bwhat can (you|crux) do\b|\bhow (does this|do i use this|does it) work\b|\bwhat (else )?can i (say|ask|do)\b/.test(t)) return { kind: "help", greeting: false };
  if (/\bcancel (all |every |my |all my )?(open )?orders?\b/.test(t)) return { kind: "orders", cancel: true };
  // A message that trades ("…sell when my profit reaches 20%") is a command, not a question.
  if (!/^what (do|did) i\b/.test(t) && /\b(buy|ape|sell|dump|scan|snipe|copy|follow|take profit|stop loss|tp|sl)\b/.test(t)) return null;
  if (/\b(my|open|show|list|see|check)\s+(my\s+)?(open\s+)?orders\b/.test(t) || /^orders$/.test(t)) return { kind: "orders", cancel: false };
  if (
    /\bwhat (do|did) i (hold|have|own|buy|bought)\b|\bhow am i doing\b|\bhow('?s| is| are) my\b|\bmy (coins|bags?|holdings|portfolio|positions|pnl|p&l|p\/l|profits?|losses)\b|^(portfolio|holdings|positions|pnl|bags?)$/.test(t)
  )
    return { kind: "portfolio" };
  if (/\b(trending|what'?s hot|hot coins|top (coins|movers|gainers)|what'?s (pumping|moving|up)|movers|gainers)\b/.test(t)) {
    const c = t.match(/\bon\s+(base|solana|sol|bnb|bsc)\b/) ?? t.match(/\b(base|solana|bnb|bsc)\b/);
    return { kind: "trending", chain: c ? CHAIN_WORDS[c[1]] : undefined };
  }
  return null;
}

/** Reads one chat message. `template`: a question's "{}" that this message answers. Pure, for tests. */
export function readMessage(raw: string, template?: string): Reply {
  // Trader slang first ("ape 5 into bonk", "leave a moon bag", "sl 20"): rewritten into the plain commands below.
  if (!template) {
    const slang = deslang(raw);
    if (slang.notYet) return { kind: "error", text: slang.notYet };
    if (slang.initials) return { kind: "initials", ...slang.initials };
    raw = slang.text;
  }
  // Questions about the account and the market come first (they name no coin, and "hi" mustn't vanish as filler).
  const q = template ? null : readQuestion(raw);
  if (q) return q;
  const text = fillTemplate(raw, template);
  if (!text) return { kind: "error", text: "Type what you want to do, or paste a coin's address." };

  // "When <wallet> buys a coin, buy it…", "copy <wallet>": copy-trading (checked first: it names an address too).
  if (isCopy(text)) return readCopy(text);
  // "copy a wallet", "copy trade": which one?
  if (/^(?:copy|follow|mirror|copytrade)\b/i.test(text) || /\bcopy[- ]?trad/i.test(text)) {
    return { kind: "ask", text: "Which wallet should I copy? Paste its address.", template: "copy {}" };
  }

  // A pasted address, or a coin's name on its own: its facts first, then what to do with it.
  const bare = text.replace(/^(?:check|look ?up|info(?: on)?|about|price of|what about|show(?: me)?)\s+/i, "").replace(/\s+on\s+(base|solana|sol|bnb|bsc)$/i, (_, c: string) => ` @${c}`);
  const [word, at] = bare.split(" @");
  if (ADDRESS.test(word) || (/^\$?[A-Za-z][A-Za-z0-9]{1,14}$/.test(word) && !VERBS.test(word) && bare.split(" ").length <= 2)) {
    return { kind: "lookup", coin: word.replace(/^\$/, ""), chain: at ? CHAIN_WORDS[at.toLowerCase()] : undefined };
  }

  if (isScan(text)) return readScan(text);

  const r = parseCommand(text);
  if (r.ok) return { kind: "plan", steps: r.steps };
  if (r.missing?.what === "amount" && r.missing.coin) {
    const coin = r.missing.coin;
    return {
      kind: "ask",
      text: `How much ${coin} should I buy?`,
      options: BUY_SIZES.map((d) => ({ label: `$${d}`, command: text.replace(r.missing!.clause, `buy $${d} of ${coin}`) })),
      template: text.replace(r.missing.clause, "buy $" + "{} of " + coin),
    };
  }
  if (r.missing?.what === "coin") {
    return { kind: "ask", text: "Which coin? Type its name or paste its address.", template: text.replace(r.missing.clause, `${r.missing.clause} {}`) };
  }
  return { kind: "error", text: r.error };
}

/** Whether a message asks to copy a wallet's trades: a wallet address with "copy"/"follow", or "when … buys". Pure. */
export function isCopy(text: string): boolean {
  const wallet = /\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/.test(text);
  return wallet && (/\b(copy|copies|copying|follow|mirror|track|copytrade)\b/i.test(text) || /\b(when|whenever|if|once)\b.*\b(buys?|bought|apes?|gets?)\b/i.test(text));
}

/** "when <wallet> buys a coin, buy $5 and sell when it sells or at 20% profit". Pure, for tests. */
export function readCopy(text: string): Reply {
  const w = text.match(/\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (!w) return { kind: "error", text: "Paste the wallet's address to copy." };
  if (w[1].startsWith("0x")) return { kind: "error", text: "Copying works for Solana wallets for now. Paste a Solana wallet's address." };
  const lower = plainSymbols(text.replace(w[1], " ")).toLowerCase();

  const dur = lower.match(new RegExp(`\\b(?:for|next|over)\\s+(?:the\\s+next\\s+)?(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b`));
  const minutes = dur ? minutesOf(dur[1], dur[2]) : 60;
  const max = lower.match(/\b(?:up to|max(?:imum)?|at most|only)\s*(\d+)\s*(?:coins?|tokens?|copies|trades|buys)?\b/) ?? lower.match(/\b(\d+)\s*(?:coins?|tokens?|copies|trades)\b/);
  const maxCopies = max ? num(max[1]) : COPY_LIMITS.defaultCopies;

  const gain = lower.match(/(\d+(?:\.\d+)?)\s?%\s*(?:profit|gain|up)\b/) ?? lower.match(/\b(?:up|profit of|gain of|reaches|hits)\s*\+?(\d+(?:\.\d+)?)\s?%/);
  const rest = gain ? lower.replace(gain[0], " ") : lower;
  const tpx = rest.match(/(\d+(?:\.\d+)?)\s?x\b/);
  const takeProfit = tpx ? num(tpx[1]) : gain ? 1 + num(gain[1]) / 100 : undefined;
  const sl = rest.match(/\b(?:stop[- ]?loss|sl)\s*(?:at|of)?\s*-?(\d+(?:\.\d+)?)\s?%/) ?? rest.match(/\b(?:drops?|falls?|dips?)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s?%/);
  // "sell when it sells", "after they sell", "exit with them": on by default unless an exit was named without it.
  const said = /\b(?:when|after|once|if)\s+(?:it|they|he|she|the wallet|that wallet|this wallet)\s+(?:sells?|dumps?|exits?)\b|\bwith (?:it|them)\b/.test(rest);
  const followSells = said || (takeProfit === undefined && !sl);
  const usd = rest.match(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:usd[ct]?|dollars?|bucks)\b/);

  if (!usd) {
    return {
      kind: "ask",
      text: "How much should I buy each time that wallet buys?",
      options: BUY_SIZES.map((d) => ({ label: `$${d}`, command: `${text}, buy $${d}` })),
      template: text + ", buy $" + "{}",
    };
  }
  const rule: CopyRule = { wallet: w[1], usd: num(usd[1] ?? usd[2]), minutes, maxCopies, followSells, takeProfit, stopLossPct: sl ? num(sl[1]) : undefined };
  if (rule.minutes < SCAN_LIMITS.minMinutes || rule.minutes > SCAN_LIMITS.maxMinutes) return { kind: "error", text: `Copying runs between ${SCAN_LIMITS.minMinutes} minutes and ${SCAN_LIMITS.maxMinutes / 60} hours.` };
  if (!(rule.maxCopies >= 1 && rule.maxCopies <= COPY_LIMITS.maxCopies)) return { kind: "error", text: `I copy between 1 and ${COPY_LIMITS.maxCopies} coins at a time.` };
  if (!(rule.usd > 0)) return { kind: "error", text: "Each copy needs an amount above $0." };
  if (rule.takeProfit !== undefined && !(rule.takeProfit > 1 && rule.takeProfit <= 1000)) return { kind: "error", text: "Take profit is above what you paid, for example 2x or 20% profit." };
  if (rule.stopLossPct !== undefined && !(rule.stopLossPct > 0 && rule.stopLossPct < 100)) return { kind: "error", text: "A stop loss is between 1% and 99%." };
  return { kind: "copy", rule };
}

/** The copy's rules in plain words, for its card. */
export function describeCopy(r: CopyRule): string[] {
  const exits = [
    r.followSells ? "sell all of it when that wallet sells (half or more of what it bought)" : null,
    r.takeProfit ? (r.takeProfit < 2 ? `sell it all when it's up ${Math.round((r.takeProfit - 1) * 100)}%` : `sell it all at ${r.takeProfit}× the price I paid`) : null,
    r.stopLossPct ? `sell it all if it drops ${r.stopLossPct}%` : null,
  ].filter(Boolean);
  return [
    `Watch wallet ${r.wallet.slice(0, 4)}…${r.wallet.slice(-4)} for ${span(r.minutes)} (keep this page open).`,
    `Each time it buys a Solana coin that passes the safety checks, buy $${r.usd} of it. At most ${r.maxCopies} coin${r.maxCopies === 1 ? "" : "s"}.`,
    exits.length ? `Then ${exits.join(", or ")}, whichever comes first.` : "No exit set: you sell them yourself.",
  ];
}

/**
 * Whether a message asks Crux to go and find a coin rather than trade a named one: "scan…", "find…", or "buy a coin
 * which/that/with…" ("buy a solana coin which is launched in 1 hour and with 50k volume"). Pure.
 */
export function isScan(text: string): boolean {
  return (
    /\b(scan|watch|hunt|snipe|look for|find)\b/i.test(text) ||
    /\b(?:a|any|some|one|the)\s+(?:(?:new|newest|fresh|trending|hot|hyped|young|top|random|good|newly\s+launched)\s+)?(?:solana\s+|sol\s+|base\s+|bnb\s+)?(?:new\s+)?(?:coin|token|memecoin|meme|launch|pair)s?\b/i.test(text) ||
    /\b(?:something|anything)\b/i.test(text) ||
    // Describing the coin instead of naming it (2026-11-24, live: "buy coin which was launched in 15 mins and has 50k
    // volume" read "WAS" as a coin): "coin which/that…", "launched in 15 mins", "50k volume".
    /\b(?:coin|token|memecoin|meme)s?\s+(?:which|that|with|launched|created)\b/i.test(text) ||
    /\b(?:launched|created|listed)\s+(?:in|within|less than|under|the last|in the last)\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*[km]\s*(?:usd\s*)?(?:of\s+)?(?:vol|volume)\b/i.test(text)
  );
}

/** "1 hour", "30 min" → minutes. */
const minutesOf = (n: string, unit: string) => Math.round(num(n) * (/^h/i.test(unit) ? 60 : 1));
const TIME_UNIT = "(hours?|hrs?|h|minutes?|mins?|m)";

/** "scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x". Pure, for tests. */
export function readScan(text: string): Reply {
  let lower = plainSymbols(text).toLowerCase();

  // Which chains: the ones named ("scan solana…", "base and bnb"), else every chain Crux trades.
  const named = ALL_CHAINS.filter((c) => (c === "solana" ? /\b(solana|sol)\b/ : c === "base" ? /\bbase\b/ : /\b(bnb|bsc|binance)\b/).test(lower));
  const chains = /\b(all|every|any|each)\s+(?:the\s+)?(?:3\s+|three\s+)?chains?\b|\b(?:3|three)\s+chains\b|\ball of them\b/.test(lower) ? ALL_CHAINS : named.length ? named : ALL_CHAINS;

  // How old the coin must be at least: "1 hour plus", "older than 2 hours", "at least 30 min old".
  const older =
    lower.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\s*(?:\\+|plus\\b|or (?:more|older)\\b)`)) ??
    lower.match(new RegExp(`\\b(?:older than|more than|over|at least|above|min(?:imum)?(?: age(?: of)?)?)\\s*(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b(?:\\s+old)?`));
  const minAgeHours = older ? minutesOf(older[1], older[2]) / 60 : 0;
  if (older) lower = lower.replace(older[0], " ");

  // How new the coin must be: "launched in 1 hour", "launched within the last 30 min", "under 2 hours old".
  const age =
    lower.match(new RegExp(`\\b(?:launched|created|listed|made|born|started)\\s+(?:in|within|in the|less than|under)?\\s*(?:the\\s+)?(?:last|past)?\\s*(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b`)) ??
    lower.match(new RegExp(`\\b(?:under|less than|below)?\\s*(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\s+old\\b`));
  // "just launched" / "brand new": the last hour.
  const justNow = !age && /\b(?:just|freshly)\s+(?:launched|created|listed|dropped)\b|\bbrand[- ]new\b/.test(lower);
  const maxAgeHours = age ? minutesOf(age[1], age[2]) / 60 : justNow ? 1 : SCAN_LIMITS.maxAgeHours;
  if (age) lower = lower.replace(age[0], " ");

  const dur = lower.match(new RegExp(`\\b(?:for|next|over)\\s+(?:the\\s+next\\s+)?(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b`)) ?? lower.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/);
  // Watching only when asked: "scan", "watch", "keep looking", "snipe", or how long to look for.
  const watch = !!dur || /\b(scan|scanning|watch|watching|monitor|snipe|sniping|hunt|keep (?:looking|watching|checking|scanning)|look out|wait for)\b/.test(lower);
  const minutes = dur ? minutesOf(dur[1], dur[2]) : 60;

  // Volume first, so its "$50k" isn't read as the buy amount.
  const vol =
    lower.match(/\$?\s?(\d+(?:\.\d+)?)\s*([km])?\s*(?:usd\s*)?(?:of\s+|in\s+)?(?:vol|volume)\b/) ??
    lower.match(/\b(?:vol|volume)\s*(?:of|is|:)?\s*(?:over|above|more than|greater than|bigger than|higher than|at least|min(?:imum)?(?: of)?|>=?)?\s*\$?\s?(\d+(?:\.\d+)?)\s*([km])?\b/);
  const minVolume = vol ? scaled(vol[1], vol[2]) : 50_000;
  const rest = vol ? lower.replace(vol[0], " ") : lower;

  // Profit as a percent ("20% profit", "up 50%", "when it reaches 20%"): 20% → sell at 1.2×.
  const gain = rest.match(/(\d+(?:\.\d+)?)\s?%\s*(?:profit|gain|up)\b/) ?? rest.match(/\b(?:up|profit of|gain of|reaches|hits)\s*\+?(\d+(?:\.\d+)?)\s?%/);
  const rest2 = gain ? rest.replace(gain[0], " ") : rest;
  const usd = rest2.match(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:usd[ct]?|dollars?|bucks)\b/);
  const tpx = rest2.match(/(\d+(?:\.\d+)?)\s?x\b/);
  const tp = tpx ? num(tpx[1]) : gain ? 1 + num(gain[1]) / 100 : undefined;
  const sl = rest2.match(/\b(?:stop[- ]?loss|sl)\s*(?:at|of)?\s*-?(\d+(?:\.\d+)?)\s?%/) ?? rest2.match(/\b(?:drops?|falls?|dips?)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s?%/);

  if (!usd) {
    return {
      kind: "ask",
      text: "How much should I buy when I find a coin?",
      options: BUY_SIZES.map((d) => ({ label: `$${d}`, command: `${text}, buy $${d}` })),
      template: text + ", buy $" + "{}",
    };
  }
  const noStop = /\bno stop[- ]?loss\b|\bwithout (?:a )?stop[- ]?loss\b|\bno safety stop\b/.test(lower);
  const rule: ScanRule = {
    chains,
    watch,
    minutes,
    minVolume,
    usd: num(usd[1] ?? usd[2]),
    takeProfit: tp,
    stopLossPct: sl ? num(sl[1]) : noStop ? undefined : SAFETY_STOP_PCT,
    safetyStop: !sl && !noStop,
    maxAgeHours,
    minAgeHours,
  };
  if (minAgeHours >= maxAgeHours) return { kind: "error", text: `I look at coins up to ${maxAgeHours} hours old, so “at least ${minAgeHours} hours old” leaves nothing. Try a smaller age.` };
  if (!(maxAgeHours > 0 && maxAgeHours <= SCAN_LIMITS.maxAgeHours)) return { kind: "error", text: `I can look at coins launched within the last ${SCAN_LIMITS.maxAgeHours} hours at most.` };
  if (watch && (rule.minutes < SCAN_LIMITS.minMinutes || rule.minutes > SCAN_LIMITS.maxMinutes)) return { kind: "error", text: `A scan runs between ${SCAN_LIMITS.minMinutes} minutes and ${SCAN_LIMITS.maxMinutes / 60} hours.` };
  if (!(rule.usd > 0)) return { kind: "error", text: "A scan's buy needs an amount above $0." };
  if (rule.takeProfit !== undefined && !(rule.takeProfit > 1 && rule.takeProfit <= 1000)) return { kind: "error", text: "Take profit is above what you paid, for example 2x or 20% profit." };
  if (rule.stopLossPct !== undefined && !(rule.stopLossPct > 0 && rule.stopLossPct < 100)) return { kind: "error", text: "A stop loss is between 1% and 99%." };
  return { kind: "scan", rule };
}

/** "$50k", "$1.2M". */
export const moneyShort = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(1)}k` : `$${n}`);

/** The scan's rules in plain words, for its card. */
/** "1 hour", "30 minutes", "1.5 hours". */
const span = (minutes: number) => (minutes >= 60 ? `${+(minutes / 60).toFixed(2)} hour${minutes === 60 ? "" : "s"}` : `${Math.round(minutes)} minutes`);

const CHAIN_WORDS_PLAIN: Record<CommandChain, string> = { solana: "Solana", base: "Base", bnb: "BNB Chain" };
const chainList = (cs: CommandChain[]) => {
  const n = cs.map((c) => CHAIN_WORDS_PLAIN[c]);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

export function describeScan(r: ScanRule): string[] {
  const age = r.minAgeHours > 0 ? `launched between ${span(r.minAgeHours * 60)} and ${span(r.maxAgeHours * 60)} ago` : `launched within the last ${span(r.maxAgeHours * 60)}`;
  const profit = r.takeProfit ? (r.takeProfit < 2 ? `when it's up ${Math.round((r.takeProfit - 1) * 100)}%` : `at ${r.takeProfit}× the price I paid`) : null;
  const exits = [profit ? `sell it all ${profit}` : null, r.stopLossPct ? `sell it all if it drops ${r.stopLossPct}%${r.safetyStop ? " (a safety stop; say “no stop loss” to skip it)" : ""}` : null].filter(Boolean).join(", or ");
  if (!r.watch) {
    return [
      `Find the best coin on ${chainList(r.chains)} right now: ${age}, at least ${moneyShort(r.minVolume)} traded in its last hour, and passing the safety checks.`,
      `Show it to you to buy $${r.usd}. Nothing is bought until you confirm.`,
      exits ? `Then ${exits}. That part keeps running even with the page closed.` : "No exit set: you sell it yourself.",
    ];
  }
  return [
    `Watch coins on ${chainList(r.chains)} for ${span(r.minutes)} (keep this page open).`,
    `Buy $${r.usd} of the first coin ${age} with at least ${moneyShort(r.minVolume)} traded in its last hour that passes the safety checks. One coin at most.`,
    exits ? `Then ${exits}. That part keeps running even with the page closed.` : "No exit set: you sell it yourself.",
  ];
}
