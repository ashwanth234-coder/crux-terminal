import { findBundle, type MapHolder } from "./holderMap.ts";
import type { CoinTrade } from "./coinMarket.ts";

/**
 * The coin page's safety strip: who holds the coin and whether its pool money can be pulled, in five numbers a trader
 * checks before buying. Each is left unknown ("—") rather than guessed when its source can't say.
 *   - Top 10: the share the 10 biggest ordinary wallets hold (pools and locked contracts left out).
 *   - Dev: the creator's share (its holder row, else the market site's own figure).
 *   - Snipers: wallets (not the creator) that bought in the first seconds of trading, and how much of the supply they
 *     bought. Only when the trades Crux has reach back to the start.
 *   - Bundled: many wallets holding nearly the same amount (lib/holderMap findBundle).
 *   - Liquidity: whether the pool's money is locked.
 */
export type SafetyStrip = {
  top10?: number;
  dev?: number;
  snipers?: { wallets: number; pct: number };
  bundle?: { wallets: number; pct: number };
  liquidity?: Liquidity;
};

/** `locked`: can't be pulled (Crux's own launches, pump.fun's curve and its graduated pools); `pct`: share of pool shares locked. */
export type Liquidity = { kind: "locked"; why: string } | { kind: "pct"; pct: number };

/** Bought within this long of the first trade: a sniper. */
export const SNIPE_WINDOW_MS = 15_000;
/** The trades must start within this long of trading's start to say anything about snipers. */
const REACH_MS = 60_000;

export const top10Of = (holders: MapHolder[]) => holders.filter((h) => h.kind !== "pool").slice(0, 10).reduce((s, h) => s + h.pct, 0);

/** Pure. Null when the trades don't reach back to the start, or there's no supply to measure against. */
export function snipersOf(trades: readonly CoinTrade[], startedAt: number | undefined, supply: number, creator?: string | null): SafetyStrip["snipers"] | null {
  if (!trades.length || !(supply > 0)) return null;
  const first = Math.min(...trades.map((t) => t.time));
  if (startedAt !== undefined && first > startedAt + REACH_MS) return null;
  const dev = creator?.toLowerCase();
  const early = trades.filter((t) => t.side === "buy" && t.time <= first + SNIPE_WINDOW_MS && t.trader && t.trader.toLowerCase() !== dev);
  const wallets = new Set(early.map((t) => t.trader.toLowerCase()));
  const bought = early.reduce((s, t) => s + t.amount, 0);
  return { wallets: wallets.size, pct: Math.min(100, (bought / supply) * 100) };
}

export function stripOf(o: {
  holders: MapHolder[] | null | undefined;
  devPct?: number;
  trades: readonly CoinTrade[];
  startedAt?: number;
  supply: number;
  creator?: string | null;
  liquidity?: Liquidity;
}): SafetyStrip {
  const h = o.holders?.length ? o.holders : null;
  const devRow = h?.find((x) => x.kind === "creator" || (!!o.creator && x.owner.toLowerCase() === o.creator.toLowerCase()));
  const b = h ? findBundle(h) : null;
  return {
    top10: h ? top10Of(h) : undefined,
    dev: devRow?.pct ?? o.devPct,
    snipers: snipersOf(o.trades, o.startedAt, o.supply, o.creator) ?? undefined,
    bundle: h ? (b ? { wallets: b.wallets.length, pct: b.pct } : { wallets: 0, pct: 0 }) : undefined,
    liquidity: o.liquidity,
  };
}

/** Levels a trader should look twice at (the scan's own limits where it has one). */
export const RISKY = { top10: 40, dev: 10, snipers: 10, liquidityPct: 90 };
