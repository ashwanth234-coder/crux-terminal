import type { Candle } from "./candles.ts";

/**
 * What the chart draws on top of the candles the trades made, worked out without React so the chart can paint it in
 * the same task as a click or a feed frame: the live bar of the current period, your trades on their way, the trade
 * badges of each candle, and when a launch graduated.
 */

const priceOk = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

/**
 * `candles` with the current period's bar: when the newest candle's period is over (by the wall clock, `nowS` in unix
 * seconds), a flat bar at its close (O = H = L = C) for the period now running, so the chart always has a bar for
 * "now" and a trade lands in a bar that's already there. Only that one bar: a period that ends without a trade isn't
 * kept, so a quiet token's history stays its traded candles side by side.
 */
export function withLiveBar(candles: Candle[], nowS: number | null, interval: number): Candle[] {
  if (nowS === null || candles.length === 0 || !(interval > 0)) return candles;
  const newest = candles[candles.length - 1];
  const bucket = Math.floor(nowS / interval) * interval;
  if (bucket <= newest.time || !priceOk(newest.close)) return candles;
  return [...candles, { time: bucket, open: newest.close, high: newest.close, low: newest.close, close: newest.close, volume: 0, trades: 0 }];
}

export type AheadTrade = { at: number; price: number; expected?: number; usdc?: number; tx?: string };

/**
 * `candles` with this browser's trades on their way in them: each moves the newest bar (or opens the next, when it
 * was pressed after that bar's time was up) to the price it should leave, with its volume and count. One whose own
 * trade is already on the chart (`onChart`: tx hashes, lowercased) isn't added again. A price that isn't a positive
 * number (a quote not back yet, a failed read) never touches the bar: it would turn the candle into NaN.
 */
export function withPendingTrades(candles: Candle[], pending: readonly AheadTrade[], onChart: ReadonlySet<string>, interval: number): Candle[] {
  const ahead = pending.filter((p) => !(p.tx && p.tx !== "none" && onChart.has(p.tx.toLowerCase())));
  if (ahead.length === 0 || candles.length === 0) return candles;
  const out = candles.slice();
  const newest = out[out.length - 1];
  const nowS = Math.floor(Math.max(...ahead.map((p) => p.at)) / 1000);
  const barAt = nowS < newest.time + interval ? newest.time : Math.floor(nowS / interval) * interval;
  const bar: Candle =
    barAt > newest.time ? { time: barAt, open: newest.close, high: newest.close, low: newest.close, close: newest.close, volume: 0, trades: 0 } : { ...newest };
  for (const p of ahead) {
    const to = priceOk(p.expected) ? p.expected : priceOk(p.price) ? p.price : null;
    if (to !== null) {
      bar.high = Math.max(bar.high, to);
      bar.low = Math.min(bar.low, to);
      bar.close = to;
    }
    bar.volume += priceOk(p.usdc) ? p.usdc : 0;
    bar.trades += 1;
  }
  if (barAt > newest.time) out.push(bar);
  else out[out.length - 1] = bar;
  return out;
}

/**
 * When a curve launch (V9) graduated, from its trades (any order): the time of its first trade in the pool, which the
 * graduating buy itself makes. Null while every trade is still on the curve.
 */
export function graduationTime(trades: readonly { time: number; venue: string }[]): number | null {
  let first: number | null = null;
  for (const t of trades) if (t.venue !== "curve" && (first === null || t.time < first)) first = t.time;
  return first;
}

/** One trade behind a badge, for its hover list. `at` in ms; `pending`: pressed here, its trade still on its way. */
export type BadgeFill = {
  who: string;
  side: "buy" | "sell";
  label: string;
  usd: number | null;
  tokens: number | null;
  /** What it traded at (USDC per token): its own swap's price, or null when its swap isn't known. */
  price: number | null;
  at: number;
  pending?: boolean;
};

/** A swap as the trade list has it, for matching to a marked trade. */
export type ExecSwap = { time: number; side: "buy" | "sell"; usdc: number; tokens: number; txHash: string };

/**
 * Each marked trade's own swap: what it really paid or got, and the price it traded at (USDC over tokens), not its
 * candle's close. A mark is a token transfer; its swap is the one in the same transaction, or (a Crux account's trade,
 * where the solver swaps in one transaction and delivers in another) the nearest swap of the same side and the same
 * token amount within a few seconds. Each swap answers one mark. Null where no swap matches.
 */
export function matchExecutions(
  marks: readonly { time: number; side: "buy" | "sell"; tokens: number; txHash?: string }[],
  swaps: readonly ExecSwap[],
): ({ usd: number; price: number } | null)[] {
  const byTx = new Map<string, number[]>();
  swaps.forEach((s, i) => {
    const key = s.txHash.toLowerCase();
    const at = byTx.get(key);
    if (at) at.push(i);
    else byTx.set(key, [i]);
  });
  const used = new Set<number>();
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.01;
  const take = (i: number) => {
    used.add(i);
    const s = swaps[i];
    return s.tokens > 0 && s.usdc > 0 ? { usd: s.usdc, price: s.usdc / s.tokens } : null;
  };
  return marks.map((m) => {
    const same = (m.txHash ? byTx.get(m.txHash.toLowerCase()) : undefined)?.filter((i) => !used.has(i) && swaps[i].side === m.side) ?? [];
    const exact = same.find((i) => close(swaps[i].tokens, m.tokens)) ?? (same.length === 1 ? same[0] : undefined);
    if (exact !== undefined) return take(exact);
    // A buy's tokens arrive just after its swap; a sell's leave up to half a minute before it.
    let best = -1;
    for (let i = 0; i < swaps.length; i++) {
      const s = swaps[i];
      if (used.has(i) || s.side !== m.side || !close(s.tokens, m.tokens)) continue;
      const lag = s.time - m.time;
      if (lag < -10 || lag > 35) continue;
      if (best < 0 || Math.abs(lag) < Math.abs(swaps[best].time - m.time)) best = i;
    }
    return best >= 0 ? take(best) : null;
  });
}

/** One badge: every marked trade of one side in one candle. */
export type BadgeCluster = { time: number; side: "buy" | "sell"; label: string; count: number; fills: BadgeFill[] };

/** Whose label a mixed badge carries: the creator's first (DB / DS), then yours, a whale's, a top holder's. */
const WHO_RANK = ["dev", "me", "whale", "top", "focus"];
const rank = (who: string) => {
  const i = WHO_RANK.indexOf(who);
  return i < 0 ? WHO_RANK.length : i;
};

/**
 * A candle's marked trades as at most two badges: one for its buys and one for its sells, each labelled by its
 * highest-ranked trader (DB before B, WB, TB) with how many trades it stands for, the trades themselves newest first.
 */
export function clusterBadges(columns: ReadonlyMap<number, readonly BadgeFill[]>): BadgeCluster[] {
  const out: BadgeCluster[] = [];
  for (const [time, fills] of columns) {
    for (const side of ["buy", "sell"] as const) {
      const mine = fills.filter((f) => f.side === side);
      if (mine.length === 0) continue;
      const lead = mine.reduce((a, b) => (rank(b.who) < rank(a.who) ? b : a));
      out.push({ time, side, label: lead.label, count: mine.length, fills: [...mine].sort((a, b) => b.at - a.at) });
    }
  }
  return out;
}

/** A badge's text: its label, with the count when it stands for several trades ("DB×4"). */
export const badgeText = (label: string, count: number) => (count > 1 ? `${label}×${count > 99 ? "99+" : count}` : label);
