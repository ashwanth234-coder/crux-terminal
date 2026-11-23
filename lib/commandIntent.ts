/**
 * The command bar's reader: plain English in, a fixed list of steps out (no AI, so the same words always mean the
 * same thing, and nothing runs until the trader confirms the card). It only understands what Crux can do:
 *   buy $25 of BONK · sell all BT · sell half of PEPE on bnb · buy $10 of WIF and take profit at 2x
 *   stop loss 20% on BONK · buy $10 of BONK if it drops 30% · trailing stop 15% on WIF
 *   buy $5 of BT and sell it in 1 min (a timed step waits on the card: the page stays open)
 * Anything else comes back as a plain error with examples. Coins are only named here (a symbol or an address); the
 * bar finds them next (the same search as the header), and the server checks every trade as it does any click.
 */
export type CommandChain = "base" | "solana" | "bnb";

export type TradeStep =
  | { kind: "buy"; coin: string; usd: number; chain?: CommandChain }
  | { kind: "sell"; coin: string; pct: number; chain?: CommandChain }
  /** A price order: sell `pct` at `multiple`× today's price (take profit) or `dropPct` under it (stop loss). */
  | { kind: "takeProfit"; coin: string; multiple: number; pct: number; chain?: CommandChain }
  | { kind: "stopLoss"; coin: string; dropPct: number; pct: number; chain?: CommandChain }
  | { kind: "trailing"; coin: string; trailPct: number; pct: number; chain?: CommandChain }
  /** Buy `usd` once the price falls `dropPct` under today's. */
  | { kind: "dip"; coin: string; usd: number; dropPct: number; chain?: CommandChain };

/** A pause before the next step ("sell it in 1 min"): counted down on the card, which must stay open. */
export type WaitStep = { kind: "wait"; seconds: number };

export type CommandStep = TradeStep | WaitStep;

/** The longest pause a command may hold (the page has to stay open for it). */
export const MAX_WAIT_SECONDS = 600;

/**
 * `missing`: the command only lacks one thing (the bar then asks for it instead of refusing): an amount for a buy
 * (`coin` named), or which coin. `clause` is the words it was missing from.
 */
export type ParsedCommand = { ok: true; steps: CommandStep[] } | { ok: false; error: string; missing?: { what: "amount" | "coin"; clause: string; coin?: string } };

export const COMMAND_EXAMPLES = ["buy $5 of BONK", "sell all BT", "buy $10 of WIF and take profit at 2x", "stop loss 20% on BONK"];

/** At most this many steps in one command (each still gets its own line on the card). */
export const MAX_STEPS = 6;

const CHAIN_WORDS: Record<string, CommandChain> = { base: "base", solana: "solana", sol: "solana", bnb: "bnb", bsc: "bnb", binance: "bnb" };
/** Words that can sit where a coin's name goes but never are one. */
const NOT_COINS = new Set(
  "a an the of in into on for my it its at all everything max half quarter worth usd usdc dollars dollar bucks and then also with when if once price sell buy ape get take profit stop loss trailing trail drops dips falls hits reaches goes up down to from by x tp sl coin coins token tokens some more min mins minute minutes sec secs second seconds hour hours hr hrs within after wait".split(" "),
);

const num = (s: string) => Number(s.replace(/,/g, ""));
/** A timing phrase: "in 1 min", "after 30 seconds", "within 2 minutes", "wait 10s". */
const TIME = /\b(?:in|after|within|wait(?:\s+for)?)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/i;
/** Seconds in a TIME match. */
const secondsOf = (m: RegExpMatchArray) => num(m[1]) * (/^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1);
const USD = /\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:usd[ct]?|dollars?|bucks)\b/i;

/** The share being sold: "all", "half", "25%"; 100 when none is named. */
function shareOf(s: string): number | null {
  if (/\b(all|everything|max|entire|whole)\b/i.test(s)) return 100;
  if (/\bhalf\b/i.test(s)) return 50;
  if (/\bquarter\b/i.test(s)) return 25;
  const m = s.match(/(\d+(?:\.\d+)?)\s?%\s*(?:of\b|$|\s)/i);
  return m ? num(m[1]) : null;
}

/** The coin named in a clause: an address, a $TICKER, or a word that isn't one of the command's own words. */
function coinOf(s: string): string | null {
  const addr = s.match(/\b(0x[a-fA-F0-9]{40})\b/) ?? s.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (addr) return addr[1];
  const ticker = s.match(/\$([A-Za-z][A-Za-z0-9]{0,14})\b/);
  if (ticker) return ticker[1].toUpperCase();
  for (const w of s.split(/[\s,]+/)) {
    const t = w.replace(/[^A-Za-z0-9]/g, "");
    if (!t || NOT_COINS.has(t.toLowerCase()) || CHAIN_WORDS[t.toLowerCase()] || /^\d/.test(t) || /^\d+x$/i.test(t)) continue;
    if (t.length >= 2 && t.length <= 15) return t.toUpperCase();
  }
  return null;
}

function chainOf(s: string): CommandChain | undefined {
  const m = s.match(/\bon\s+(base|solana|sol|bnb|bsc|binance)\b/i);
  return m ? CHAIN_WORDS[m[1].toLowerCase()] : undefined;
}

/** A clause without its "on <chain>" (so the chain's name isn't read as the coin). */
const withoutChain = (s: string) => s.replace(/\bon\s+(base|solana|sol|bnb|bsc|binance)\b/gi, " ");

type Partial = { step?: TradeStep; needsCoin?: boolean; needsAmount?: string; error?: string };

function readClause(raw: string, coin: string | null, chain: CommandChain | undefined): Partial {
  const s = withoutChain(raw).trim();
  const lower = s.toLowerCase();
  const named = coinOf(
    s
      .replace(USD, " ")
      .replace(/\b\d+(?:\.\d+)?\s?(?:x\b|%)/gi, " ")
      .replace(/\b(take[- ]?profit|stop[- ]?loss|trailing(?: stop)?)\b/gi, " "),
  );
  const c = named ?? coin;
  const usd = s.match(USD);
  const dollars = usd ? num(usd[1] ?? usd[2]) : null;

  // Trailing stop: "trailing stop 15% on WIF".
  const trail = lower.match(/\btrail(?:ing)?(?:\s+stop)?\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s?%/);
  if (trail) return c ? { step: { kind: "trailing", coin: c, trailPct: num(trail[1]), pct: sellShare(withoutNumber(lower, trail[0], /\d+(?:\.\d+)?\s?%/)), chain } } : { needsCoin: true };

  // Take profit: "take profit at 2x", "tp 3x", "sell half at 2x", "sell when it hits 5x".
  const tp = lower.match(/\b(?:take[- ]?profit|tp)\s*(?:at|@)?\s*(\d+(?:\.\d+)?)\s?x\b/) ?? lower.match(/\bsell\b.*?\b(?:at|@|when it (?:hits|reaches|does)|if it (?:hits|reaches|does))\s*(\d+(?:\.\d+)?)\s?x\b/);
  if (tp) return c ? { step: { kind: "takeProfit", coin: c, multiple: num(tp[1]), pct: sellShare(withoutNumber(lower, tp[0], /\d+(?:\.\d+)?\s?x\b/)), chain } } : { needsCoin: true };

  // Stop loss: "stop loss 20%", "sl 15%", "sell if it drops 20%".
  const sl = lower.match(/\b(?:stop[- ]?loss|sl)\s*(?:at|of)?\s*-?(\d+(?:\.\d+)?)\s?%/) ?? lower.match(/\bsell\b.*?\b(?:if|when|once) it (?:drops|dips|falls|goes down)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s?%/);
  if (sl) return c ? { step: { kind: "stopLoss", coin: c, dropPct: num(sl[1]), pct: sellShare(withoutNumber(lower, sl[0], /-?\d+(?:\.\d+)?\s?%/)), chain } } : { needsCoin: true };

  // Dip buy: "buy $10 of BONK if it drops 30%".
  const dip = lower.match(/\bbuy\b.*?\b(?:if|when|once) it (?:drops|dips|falls|goes down)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s?%/);
  if (dip) {
    if (dollars === null) return { error: "Say how much to buy, for example “buy $10 of BONK if it drops 30%”." };
    return c ? { step: { kind: "dip", coin: c, usd: dollars, dropPct: num(dip[1]), chain } } : { needsCoin: true };
  }

  if (/\b(buy|ape|get|purchase|grab)\b/.test(lower)) {
    if (dollars === null) return c ? { needsAmount: c } : { needsCoin: true };
    return c ? { step: { kind: "buy", coin: c, usd: dollars, chain } } : { needsCoin: true };
  }
  if (/\b(sell|dump|exit|close)\b/.test(lower)) {
    return c ? { step: { kind: "sell", coin: c, pct: sellShare(lower), chain } } : { needsCoin: true };
  }
  return { error: "" };
}

/** The clause with only the trigger's number taken out of its phrase (so "sell half at 3x" keeps "half"). */
const withoutNumber = (s: string, phrase: string, n: RegExp) => s.replace(phrase, phrase.replace(n, " "));

/** The share sold (100 when none is named; out-of-range shares are refused by checkStep, never quietly capped). */
const sellShare = (s: string) => shareOf(s) ?? 100;

/** Reads one command. Pure, for tests. */
export function parseCommand(text: string): ParsedCommand {
  const input = text.trim().replace(/\s+/g, " ");
  if (!input) return { ok: false, error: "Type what you want to do." };
  if (input.length > 240) return { ok: false, error: "That's a long command. Try one or two steps at a time." };
  const chainAll = chainOf(input);
  const clauses = input.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\bplus\b)\s*/i).filter((c) => c.trim().length > 0);
  const steps: CommandStep[] = [];
  let coin: string | null = null;
  for (const raw of clauses) {
    // A timing phrase becomes its own wait step, before the rest of the clause.
    const time = raw.match(TIME);
    let clause = raw;
    if (time) {
      steps.push({ kind: "wait", seconds: secondsOf(time) });
      clause = raw.replace(time[0], " ").trim();
      if (!clause || /^wait$/i.test(clause)) continue;
    }
    const r = readClause(clause, coin, chainOf(clause) ?? chainAll);
    if (r.error !== undefined) {
      if (r.error) return { ok: false, error: r.error };
      return { ok: false, error: `I didn't understand “${clause}”. Try: ${COMMAND_EXAMPLES.map((e) => `“${e}”`).join(", ")}.` };
    }
    if (r.needsCoin) return { ok: false, error: "Which coin? Type its name or paste its address.", missing: { what: "coin", clause } };
    if (r.needsAmount) return { ok: false, error: `How much ${r.needsAmount} should I buy?`, missing: { what: "amount", clause, coin: r.needsAmount } };
    const step = r.step!;
    coin = step.coin;
    steps.push(step);
  }
  if (steps.length > MAX_STEPS) return { ok: false, error: `At most ${MAX_STEPS} steps in one command.` };
  for (const st of steps) {
    const bad = checkStep(st);
    if (bad) return { ok: false, error: bad };
  }
  return { ok: true, steps };
}

/** The limits a step must meet before it's even shown (the server checks the trade itself again). */
function checkStep(s: CommandStep): string | null {
  if (s.kind === "wait") return s.seconds >= 1 && s.seconds <= MAX_WAIT_SECONDS ? null : `A wait is between 1 second and ${MAX_WAIT_SECONDS / 60} minutes.`;
  if ((s.kind === "buy" || s.kind === "dip") && !(s.usd > 0)) return "A buy needs an amount above $0.";
  if ("pct" in s && !(s.pct > 0 && s.pct <= 100)) return "Sell between 1% and 100%.";
  if (s.kind === "takeProfit" && !(s.multiple > 1 && s.multiple <= 1000)) return "Take profit is a multiple above 1x, for example 2x.";
  if ((s.kind === "stopLoss" || s.kind === "dip") && !(s.dropPct > 0 && s.dropPct < 100)) return "A drop is between 1% and 99%.";
  if (s.kind === "trailing" && !(s.trailPct > 0 && s.trailPct < 100)) return "A trailing stop is between 1% and 99%.";
  return null;
}

/** The step in plain words, for the confirmation card. */
export function describeStep(s: CommandStep, symbol = s.kind === "wait" ? "" : s.coin): string {
  const share = (pct: number) => (pct >= 100 ? "all your" : pct === 50 ? "half your" : `${pct}% of your`);
  switch (s.kind) {
    case "buy":
      return `Buy $${s.usd} of ${symbol}`;
    case "sell":
      return `Sell ${share(s.pct)} ${symbol}`;
    case "takeProfit":
      return `Sell ${share(s.pct)} ${symbol} when it reaches ${s.multiple}× today's price`;
    case "stopLoss":
      return `Sell ${share(s.pct)} ${symbol} if it drops ${s.dropPct}%`;
    case "trailing":
      return `Sell ${share(s.pct)} ${symbol} if it falls ${s.trailPct}% from its high`;
    case "dip":
      return `Buy $${s.usd} of ${symbol} if it drops ${s.dropPct}%`;
    case "wait":
      return `Wait ${waitText(s.seconds)} (keep this page open)`;
  }
}

/** "30 seconds", "1 minute", "1 min 30 s". */
export function waitText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const r = Math.round(seconds % 60);
  if (m === 0) return `${r} second${r === 1 ? "" : "s"}`;
  if (r === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  return `${m} min ${r} s`;
}
