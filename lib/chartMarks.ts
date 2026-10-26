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
    a === focus ? "focus" : me.has(a) ? "me" : a === dev ? "dev" : whales.has(a) ? "whale" : top.has(a) ? "top" : null;

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
