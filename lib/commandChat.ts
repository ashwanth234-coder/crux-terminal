import { parseCommand, withoutFiller, type CommandChain, type CommandStep } from "./commandIntent.ts";

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

/** A scan: watch new Solana coins for `minutes`, buy one (at most) that passes the rules, then the exits. */
export type ScanRule = {
  minutes: number;
  /** Dollars traded in the coin's last hour. */
  minVolume: number;
  usd: number;
  /** Sell everything at this multiple of the buy price (a take-profit order, kept by the server). */
  takeProfit?: number;
  /** Sell everything if it drops this much under the buy price. */
  stopLossPct?: number;
  /** Only coins launched within this many hours. */
  maxAgeHours: number;
};

export type Reply =
  | { kind: "plan"; steps: CommandStep[] }
  | { kind: "lookup"; coin: string; chain?: CommandChain }
  | { kind: "scan"; rule: ScanRule }
  /** A question. `template`: the next message fills its "{}" (e.g. the coin a buy was missing). */
  | { kind: "ask"; text: string; options?: ChatOption[]; template?: string }
  | { kind: "error"; text: string };

export const SCAN_LIMITS = { minMinutes: 5, maxMinutes: 180, maxAgeHours: 24 };
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

/** Reads one chat message. `template`: a question's "{}" that this message answers. Pure, for tests. */
export function readMessage(raw: string, template?: string): Reply {
  const text = fillTemplate(raw, template);
  if (!text) return { kind: "error", text: "Type what you want to do, or paste a coin's address." };

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

/**
 * Whether a message asks Crux to go and find a coin rather than trade a named one: "scan…", "find…", or "buy a coin
 * which/that/with…" ("buy a solana coin which is launched in 1 hour and with 50k volume"). Pure.
 */
export function isScan(text: string): boolean {
  return /\b(scan|watch|hunt|snipe|look for|find)\b/i.test(text) || /\b(?:a|any|some|one)\s+(?:new\s+|fresh\s+)?(?:solana\s+|sol\s+)?(?:new\s+)?(?:coin|token|memecoin|meme)s?\b/i.test(text);
}

/** "1 hour", "30 min" → minutes. */
const minutesOf = (n: string, unit: string) => Math.round(num(n) * (/^h/i.test(unit) ? 60 : 1));
const TIME_UNIT = "(hours?|hrs?|h|minutes?|mins?|m)";

/** "scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x". Pure, for tests. */
export function readScan(text: string): Reply {
  let lower = text.toLowerCase();
  if (/\b(base|bnb|bsc|binance)\b/.test(lower)) return { kind: "error", text: "Scanning works for Solana coins for now. Try “scan solana for 1 hour, buy $5 of a coin with 50k volume, sell at 2x”." };

  // How new the coin must be: "launched in 1 hour", "launched within the last 30 min", "under 2 hours old".
  const age =
    lower.match(new RegExp(`\\b(?:launched|created|listed|made|born|started)\\s+(?:in|within|in the|less than|under)?\\s*(?:the\\s+)?(?:last|past)?\\s*(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b`)) ??
    lower.match(new RegExp(`\\b(?:under|less than|below)?\\s*(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\s+old\\b`));
  const maxAgeHours = age ? minutesOf(age[1], age[2]) / 60 : SCAN_LIMITS.maxAgeHours;
  if (age) lower = lower.replace(age[0], " ");

  const dur = lower.match(new RegExp(`\\b(?:for|next|over)\\s+(?:the\\s+next\\s+)?(\\d+(?:\\.\\d+)?)\\s*${TIME_UNIT}\\b`)) ?? lower.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/);
  const minutes = dur ? minutesOf(dur[1], dur[2]) : 60;

  // Volume first, so its "$50k" isn't read as the buy amount.
  const vol =
    lower.match(/\$?\s?(\d+(?:\.\d+)?)\s*([km])?\s*(?:usd\s*)?(?:of\s+|in\s+)?(?:vol|volume)\b/) ??
    lower.match(/\b(?:vol|volume)\s*(?:of|over|above|at least|>=?)?\s*\$?\s?(\d+(?:\.\d+)?)\s*([km])?\b/);
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
  const rule: ScanRule = {
    minutes,
    minVolume,
    usd: num(usd[1] ?? usd[2]),
    takeProfit: tp,
    stopLossPct: sl ? num(sl[1]) : undefined,
    maxAgeHours,
  };
  if (!(maxAgeHours > 0 && maxAgeHours <= SCAN_LIMITS.maxAgeHours)) return { kind: "error", text: `I can look at coins launched within the last ${SCAN_LIMITS.maxAgeHours} hours at most.` };
  if (rule.minutes < SCAN_LIMITS.minMinutes || rule.minutes > SCAN_LIMITS.maxMinutes) return { kind: "error", text: `A scan runs between ${SCAN_LIMITS.minMinutes} minutes and ${SCAN_LIMITS.maxMinutes / 60} hours.` };
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

export function describeScan(r: ScanRule): string[] {
  const profit = r.takeProfit ? (r.takeProfit < 2 ? `when it's up ${Math.round((r.takeProfit - 1) * 100)}%` : `at ${r.takeProfit}× the price I paid`) : null;
  const exits = [profit ? `sell it all ${profit}` : null, r.stopLossPct ? `sell it all if it drops ${r.stopLossPct}%` : null].filter(Boolean).join(", or ");
  return [
    `Watch new Solana coins for ${span(r.minutes)} (keep this page open).`,
    `Buy $${r.usd} of the first coin launched within the last ${span(r.maxAgeHours * 60)} with at least ${moneyShort(r.minVolume)} traded in its last hour that passes the safety checks. One coin at most.`,
    exits ? `Then ${exits}. That part keeps running even with the page closed.` : "No exit set: you sell it yourself.",
  ];
}
