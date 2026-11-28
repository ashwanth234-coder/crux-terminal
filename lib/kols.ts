import type { Address } from "viem";
import type { MarkTrade } from "./chartMarks.ts";

/** A KOL's trade of a coin (crux-solver kols.ts): `time` in ms, the KOL's name and X handle as GMGN lists them. */
export type KolTrade = { time: number; side: "buy" | "sell"; usd: number; price: number; tokens: number; address: string; name: string; twitter: string; tx: string };

/** The chart's KOL badges (KB / KS), oldest first. Pure. */
export function kolMarks(trades: readonly KolTrade[]): MarkTrade[] {
  return trades
    .map((t) => ({ time: Math.floor(t.time / 1000), side: t.side, who: "kol" as const, address: t.address as Address, tokens: t.tokens, usd: t.usd, txHash: t.tx, name: kolName(t) }))
    .sort((a, b) => a.time - b.time);
}

/** How a KOL is named: their name, else their X handle, else a short address. */
export const kolName = (t: Pick<KolTrade, "name" | "twitter" | "address">) => t.name || (t.twitter ? `@${t.twitter}` : `${t.address.slice(0, 4)}…${t.address.slice(-4)}`);

/** KOLs by wallet (EVM addresses in lower case), for naming them in a trades list. Pure. */
export function kolIndex(trades: readonly KolTrade[]): Map<string, KolTrade> {
  const m = new Map<string, KolTrade>();
  for (const t of trades) m.set(t.address.startsWith("0x") ? t.address.toLowerCase() : t.address, t);
  return m;
}
