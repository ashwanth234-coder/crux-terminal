/**
 * The Ask Crux coach's rulebook (docs/superpowers/specs/2026-11-24-ask-crux-coach-design.md): ten hand-written trader
 * rules, each a pure function from facts to a card (one plain sentence, one or two one-tap buttons). No language model.
 * A card only suggests: every button sends a command that lands on the normal confirm card. Crux never trades on its own.
 *
 * The same file lives in crux-solver (scripts/coach.ts), which runs the four urgent rules on coins Crux watches and
 * pushes them; the page runs the six review rules when Ask Crux opens. Keep the two copies in step.
 */
export type RuleId =
  | "creatorSelling"
  | "cashLeaving"
  | "nearFloor"
  | "twoXNoPlan"
  | "oversized"
  | "pullback"
  | "noFloor"
  | "deadBags"
  | "concentration"
  | "idleCash";

/** The tie-break order: when two cards are equally urgent, the earlier rule wins. */
export const RULE_ORDER: RuleId[] = ["creatorSelling", "cashLeaving", "nearFloor", "twoXNoPlan", "oversized", "pullback", "noFloor", "deadBags", "concentration", "idleCash"];

export type CoinRef = { chain: "solana" | "base" | "bnb"; address: string; symbol: string };
/** Same shape as Ask Crux's chat options. An empty command just dismisses the card ("Keep my floor"). */
export type CardAction = { label: string; command: string; say?: string };
export type Card = { rule: RuleId; coin?: CoinRef; urgency: 1 | 2 | 3; text: string; actions: CardAction[]; at: number };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** How long a card stays quiet after it was shown or dismissed, per coin. */
export const QUIET_MS: Record<RuleId, number> = {
  twoXNoPlan: 6 * HOUR,
  creatorSelling: 30 * MIN,
  cashLeaving: 30 * MIN,
  nearFloor: 15 * MIN,
  oversized: DAY,
  pullback: DAY,
  noFloor: DAY,
  deadBags: DAY,
  concentration: DAY,
  idleCash: DAY,
};

/** Whether a rule is still in its quiet period. */
export const quiet = (rule: RuleId, lastAt: number | undefined, now: number) => lastAt !== undefined && now - lastAt < QUIET_MS[rule];

/**
 * Cards about the whole portfolio, not one coin: at most one of each. (Concentration names its coin, so it competes
 * for that coin's one card; only one coin can be over 60%, so there's never more than one.)
 */
const PORTFOLIO: RuleId[] = ["deadBags", "idleCash"];
/** The most cards shown at once. */
export const MAX_CARDS = 5;
/** Ask Crux's limit on steps in one command (commandIntent MAX_STEPS). */
const MAX_SWEEP = 6;

const on = (c: CoinRef) => ` on ${c.chain}`;
const sym = (c: CoinRef) => `$${c.symbol}`;
const usd = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const known = (...xs: (number | undefined)[]) => xs.every((x) => x !== undefined && Number.isFinite(x));

const sellAll = (c: CoinRef, label = "Sell all"): CardAction => ({ label, command: `sell all ${c.address}${on(c)}`, say: `Sell all my ${c.symbol}` });
const sellHalf = (c: CoinRef): CardAction => ({ label: "Sell half", command: `sell half of ${c.address}${on(c)}`, say: `Sell half my ${c.symbol}` });
const floor25 = (c: CoinRef): CardAction => ({ label: "Floor at −25%", command: `stop loss 25% on ${c.address}${on(c)}`, say: `Stop loss 25% on ${c.symbol}` });
const card = (rule: RuleId, urgency: Card["urgency"], text: string, actions: CardAction[], now: number, coin?: CoinRef): Card => ({ rule, coin, urgency, text, actions, at: now });

// ------------------------------------------------------------------ the server's four (coins Crux watches)

/** Up 2× or more and nothing set to sell. */
export function twoXNoPlan(f: { coin: CoinRef; price?: number; entry?: number; hasTakeProfit: boolean }, now: number): Card | null {
  if (f.hasTakeProfit || !known(f.price, f.entry) || !(f.entry! > 0) || f.price! < 2 * f.entry!) return null;
  return card("twoXNoPlan", 2, `Up 2× on ${sym(f.coin)} and no exit plan? Bold. Lock some in?`, [sellHalf(f.coin), floor25(f.coin)], now, f.coin);
}

/** The coin's creator sold 20% or more of what they held (solcreatoralert.ts sees it). Serious: no sass. */
export function creatorSelling(f: { coin: CoinRef; soldPct: number; all: boolean }, now: number): Card | null {
  if (!f.all && !(f.soldPct >= 20)) return null;
  const text = f.all ? `The creator of ${sym(f.coin)} sold everything they held.` : `The creator of ${sym(f.coin)} just sold ${Math.round(f.soldPct)}% of their coins.`;
  return card("creatorSelling", 3, text, [sellAll(f.coin), sellHalf(f.coin)], now, f.coin);
}

/** The cash in the coin's market fell 30% or more under its high of the last hour. Serious: no sass. */
export function cashLeaving(f: { coin: CoinRef; cashNow?: number; cashHigh1h?: number }, now: number): Card | null {
  if (!known(f.cashNow, f.cashHigh1h) || !(f.cashHigh1h! > 0) || f.cashNow! > f.cashHigh1h! * 0.7) return null;
  return card("cashLeaving", 3, `Cash is leaving ${sym(f.coin)}'s market fast. It may get hard to sell.`, [sellAll(f.coin), sellHalf(f.coin)], now, f.coin);
}

/** The price is within 5% above the trader's floor. */
export function nearFloor(f: { coin: CoinRef; price?: number; floor?: number; dropPct: number }, now: number): Card | null {
  if (!known(f.price, f.floor) || !(f.floor! > 0) || f.price! < f.floor! || f.price! > f.floor! * 1.05) return null;
  return card("nearFloor", 2, `${sym(f.coin)} is close to your floor (−${Math.round(f.dropPct)}%).`, [sellAll(f.coin, "Sell now"), { label: "Keep my floor", command: "" }], now, f.coin);
}

// ------------------------------------------------------------------ the page's six (when Ask Crux opens)

/** The holding is over 3% of the cash in its market: selling it all at once would move the price a lot. */
export function oversized(f: { coin: CoinRef; valueUsd: number; marketCash?: number }, now: number): Card | null {
  if (!known(f.marketCash) || !(f.marketCash! > 0) || f.valueUsd <= f.marketCash! * 0.03) return null;
  return card("oversized", 2, `Your ${sym(f.coin)} is big for its market. Selling it all at once would cost you.`, [sellHalf(f.coin)], now, f.coin);
}

/** 40% or more under the highest price since the buy (the server keeps the high for coins it watches). */
export function pullback(f: { coin: CoinRef; price?: number; peak?: number }, now: number): Card | null {
  if (!known(f.price, f.peak) || !(f.peak! > 0) || f.price! > f.peak! * 0.6) return null;
  const pct = Math.round((1 - f.price! / f.peak!) * 100);
  return card("pullback", 2, `${sym(f.coin)} has fallen ${pct}% from its high since you bought.`, [sellHalf(f.coin), floor25(f.coin)], now, f.coin);
}

/** A holding worth $2 or more with no floor under it. */
export function noFloor(f: { coin: CoinRef; valueUsd: number; hasFloor: boolean }, now: number): Card | null {
  if (f.hasFloor || !(f.valueUsd >= 2)) return null;
  return card("noFloor", 2, `${sym(f.coin)} has no floor. A fall isn't capped.`, [floor25(f.coin)], now, f.coin);
}

/**
 * Coins that look dead: held over a day and down more than 65%, or under $1,000 of cash in their market. Never on value
 * alone (founder 2026-11-24: a fresh $1 buy is $0.98 after fees). One card sells up to six of them.
 */
export function deadBags(f: { coins: { coin: CoinRef; valueUsd: number; heldMs?: number; pnlPct?: number; marketCash?: number }[] }, now: number): Card | null {
  const dead = f.coins.filter((c) => (c.heldMs !== undefined && c.heldMs > DAY && c.pnlPct !== undefined && c.pnlPct < -65) || (c.marketCash !== undefined && c.marketCash < 1_000)).slice(0, MAX_SWEEP);
  if (dead.length === 0) return null;
  const total = Math.round(dead.reduce((s, c) => s + c.valueUsd, 0) * 100) / 100;
  const n = dead.length === 1 ? "This coin is" : `These ${dead.length} coins are`;
  return card("deadBags", 1, `${n} just sitting there looking sad (${usd(total)} total). Sweep ${dead.length === 1 ? "it" : "them"}?`, [
    { label: dead.length === 1 ? "Sell it" : "Sell them all", command: dead.map((c) => `sell all ${c.coin.address}${on(c.coin)}`).join(" and "), say: "Sweep my dead coins" },
  ], now);
}

/** One coin is over 60% of everything the trader holds (coins + cash). */
export function concentration(f: { coin: CoinRef; valueUsd: number; totalUsd: number }, now: number): Card | null {
  if (!(f.totalUsd > 0) || f.valueUsd <= f.totalUsd * 0.6) return null;
  const pct = Math.round((f.valueUsd / f.totalUsd) * 100);
  return card("concentration", 1, `${sym(f.coin)} is ${pct}% of everything you hold.`, [{ label: "Sell a quarter", command: `sell 25% of ${f.coin.address}${on(f.coin)}`, say: `Sell a quarter of my ${f.coin.symbol}` }], now, f.coin);
}

/** $20+ of cash that is half or more of everything. Never after a loss today (then the only suggestion is a break). */
export function idleCash(f: { cashUsd: number; totalUsd: number; boughtThisSession: boolean; lossesToday: number }, now: number): Card | null {
  if (f.boughtThisSession || f.lossesToday > 0 || !(f.cashUsd >= 20) || f.cashUsd < f.totalUsd * 0.5) return null;
  return card("idleCash", 1, `${usd(Math.floor(f.cashUsd))} doing nothing. No pressure. Want me to find something?`, [{ label: "Find me a coin", command: "what's trending", say: "What's trending?" }], now);
}

// ------------------------------------------------------------------ the cap

const coinKey = (c: CoinRef) => `${c.chain}:${c.chain === "solana" ? c.address : c.address.toLowerCase()}`;
const rank = (c: Card) => -c.urgency * 100 + RULE_ORDER.indexOf(c.rule);

/**
 * What the trader sees: one card per coin (the most urgent; equal urgency goes by RULE_ORDER), at most one of each
 * portfolio card, most urgent first, MAX_CARDS at most. The rest are dropped, not queued.
 */
export function capCards(cards: Card[]): Card[] {
  const best = new Map<string, Card>();
  for (const c of [...cards].sort((a, b) => rank(a) - rank(b))) {
    const k = PORTFOLIO.includes(c.rule) || !c.coin ? `portfolio:${c.rule}` : coinKey(c.coin);
    if (!best.has(k)) best.set(k, c);
  }
  return [...best.values()].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_CARDS);
}
