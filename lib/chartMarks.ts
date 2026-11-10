import type { Address } from "viem";
import type { TokenTransfer } from "../hooks/useTokenTransfers";

/**
 * Whose trade a chart mark shows, strongest first: the wallet picked in the desk, the viewer, the launch's creator, a
 * whale, a top-10 holder.
 */
export type MarkWho = "focus" | "me" | "dev" | "whale" | "top";

export type MarkTrade = { time: number; side: "buy" | "sell"; who: MarkWho; address: Address; tokens: number; usd: number };

export type MarkContext = {
  /** Where buys come from: the pool, the batch pool, the solver (intent fills). */
  sources: Address[];
  /** Where sells go: the pool, the batch pool, the origin settlers (intent escrow). */
  sinks: Address[];
  me: Address[];
  dev: Address;
  whales: Address[];
  top: Address[];
  /** A wallet picked in the desk: its trades are marked whoever it is. */
  focus?: Address | null;
};

const ONE = 1e18;

/**
 * The market trades of the people worth marking on the chart, rebuilt from the token's Transfer logs: tokens out of a
 * market venue to a holder is a buy, a holder's tokens into one is a sell. Valued at `priceAt(time)` (USDC per token).
 * Claims, mints and transfers between holders are not trades.
 */
export function markTrades(transfers: TokenTransfer[], ctx: MarkContext, priceAt: (time: number) => number | null): MarkTrade[] {
  const low = (as: Address[]) => new Set(as.map((a) => a.toLowerCase()));
  const sources = low(ctx.sources);
  const sinks = low(ctx.sinks);
  const me = low(ctx.me);
  const whales = low(ctx.whales);
  const top = low(ctx.top);
  const dev = ctx.dev.toLowerCase();
  const focus = ctx.focus?.toLowerCase() ?? null;
  const whoOf = (a: string): MarkWho | null =>
    // The dev first: a creator trading their own token is marked DB / DS, whoever is looking.
    a === focus ? "focus" : a === dev ? "dev" : me.has(a) ? "me" : whales.has(a) ? "whale" : top.has(a) ? "top" : null;

  const out: MarkTrade[] = [];
  for (const t of transfers) {
    if (t.kind !== "transfer" || t.value === BigInt(0)) continue;
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    let side: "buy" | "sell" | null = null;
    let holder: Address | null = null;
    if (sources.has(from) && !sources.has(to) && !sinks.has(to)) {
      side = "buy";
      holder = t.to;
    } else if (sinks.has(to) && !sources.has(from) && !sinks.has(from)) {
      side = "sell";
      holder = t.from;
    }
    if (!side || !holder) continue;
    const who = whoOf(holder.toLowerCase());
    if (!who) continue;
    const tokens = Number(t.value) / ONE;
    const price = priceAt(t.time);
    out.push({ time: t.time, side, who, address: holder, tokens, usd: price === null ? 0 : tokens * price });
  }
  return out;
}

/** How far after a sell's transfer its pool trade (and so its candle) can land: an account sell's tokens go to escrow
 *  at the click, and the solver sells them into the pool a few seconds later. */
export const SELL_LAG_SECONDS = 30;

/**
 * The candle a trade's badge goes on. A buy's tokens arrive after its pool trade: the latest candle at or before it.
 * A sell's tokens leave first (to escrow, at the click) and its pool trade lands seconds later: the first candle at or
 * after it within SELL_LAG_SECONDS, the red candle the sale made (it sat on the candle before, often a green one).
 */
export function markBarTime(
  times: number[],
  time: number,
  side: "buy" | "sell",
  isDown?: (candleTime: number) => boolean,
  interval?: number,
): number | null {
  const at = barTime(times, time);
  if (side !== "sell") return at;
  // The transfer's own candle, if one covers it (a wallet sale straight into the pool lands there).
  const own = at !== null && (interval === undefined || time < at + interval) ? at : null;
  if (own !== null && isDown?.(own)) return own;
  // Otherwise the candles that start soon after it: an account sale's tokens went to escrow at the click and the sale
  // lands seconds later. A sale pushes the price down, so the first red one (a quick buy in between made a green one).
  const soon = times.filter((t) => t > time && t <= time + SELL_LAG_SECONDS);
  const down = isDown ? soon.find(isDown) : soon[0];
  if (down !== undefined) return down;
  // No sale nearby (escrow for a standing order, a refund): the transfer's own candle, or no badge at all, never one
  // pinned on an older, unrelated candle.
  return own;
}

/** The latest candle time at or before `time` (candle times ascending), so a mark sits on an existing bar. */
export function barTime(times: number[], time: number): number | null {
  let lo = 0;
  let hi = times.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) {
      found = times[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found ?? (times.length ? times[0] : null);
}
