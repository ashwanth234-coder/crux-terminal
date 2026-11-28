import type { Address } from "viem";
import type { MarkTrade } from "./chartMarks.ts";
import type { ChartTrade } from "./devMarks.ts";

/**
 * Wallets a trader starred (crux-solver savedwallets.ts, kept on their Crux login): a nickname, "Show on charts" (their
 * buys and sells as ★ badges) and "Notify me" (a push each time they trade; Solana wallets for now).
 */
export type WalletChain = "solana" | "base" | "bnb";
export type SavedWallet = { chain: WalletChain; address: string; name: string; chart: boolean; notify: boolean; savedAt: number };
/** A saved wallet's trade seen by Crux's wallet watcher (Solana): `at` the chain's time in ms, `usd` / `tokens` its size. */
export type WalletEvent = { address: string; name: string; mint: string; symbol: string; side: "buy" | "sell"; sol: number; at: number; tx: string; usd?: number; tokens?: number };

export const chainOf = (network: "solana" | "bsc" | "base" | "bnb"): WalletChain => (network === "bsc" ? "bnb" : network);
/** One key per wallet: EVM addresses whatever their case, Solana's as they are. */
export const walletKey = (chain: WalletChain, address: string) => `${chain}:${chain === "solana" ? address : address.toLowerCase()}`;
export const shortWallet = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
export const walletLabel = (w: Pick<SavedWallet, "name" | "address">) => w.name || shortWallet(w.address);

/** Saved wallets by key. Pure. */
export function savedIndex(wallets: readonly SavedWallet[]): Map<string, SavedWallet> {
  return new Map(wallets.map((w) => [walletKey(w.chain, w.address), w]));
}

/** The chart's ★ badges: every trade in the list by a saved wallet with "Show on charts" on. Pure. */
export function savedMarks(trades: readonly ChartTrade[], chain: WalletChain, index: ReadonlyMap<string, SavedWallet>): MarkTrade[] {
  if (!index.size) return [];
  const out: MarkTrade[] = [];
  for (const t of trades) {
    const w = t.trader ? index.get(walletKey(chain, t.trader)) : undefined;
    if (!w?.chart) continue;
    out.push({ time: t.time, side: t.side, who: "saved", address: t.trader as Address, tokens: t.price > 0 ? t.usd / t.price : 0, usd: t.usd, txHash: t.tx });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * The chart's ★ badges from the wallet watcher: a saved wallet's buys and sells of `mint` (with "Show on charts" on),
 * also when the coin's own trade list doesn't say who traded. `skip`: transactions already marked. Pure.
 */
export function eventMarks(events: readonly WalletEvent[], mint: string, index: ReadonlyMap<string, SavedWallet>, skip: ReadonlySet<string> = new Set()): MarkTrade[] {
  const out: MarkTrade[] = [];
  for (const e of events) {
    if (e.mint !== mint || skip.has(e.tx)) continue;
    if (!index.get(walletKey("solana", e.address))?.chart) continue;
    out.push({ time: Math.floor(e.at / 1000), side: e.side, who: "saved", address: e.address as Address, tokens: e.tokens ?? 0, usd: e.usd ?? 0, txHash: e.tx });
  }
  return out.sort((a, b) => a.time - b.time);
}
