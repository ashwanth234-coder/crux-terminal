/**
 * A coin's biggest holders, for its holder map and the buy check: Solana from Crux's own connection
 * (crux-solver /v1/solana/holders: the 20 largest, pools and the creator marked), BNB Chain and Base from GoPlus's free
 * token check (its top 10). Plus the one sign a holder map shows best: many wallets holding the same amount, which is
 * one buyer split across wallets ("bundled"), the pattern behind $MINELIUS (8 top wallets at 2.33% each, 2026-11-23).
 */
export type HolderKind = "pool" | "creator" | "wallet";
export type MapHolder = { owner: string; pct: number; kind: HolderKind };

/** Wallets holding nearly the same share: one buyer split across them, likely. */
export type Bundle = { wallets: string[]; pct: number };

/**
 * The biggest group of ordinary wallets whose shares are within 3% of each other: 5 or more of them holding 10%+ of
 * the supply together is a bundle. Pure, for tests.
 */
export function findBundle(holders: MapHolder[]): Bundle | null {
  const wallets = holders.filter((h) => h.kind === "wallet" && h.pct >= 0.3).sort((a, b) => b.pct - a.pct);
  let best: MapHolder[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const group = wallets.filter((w) => Math.abs(w.pct - wallets[i].pct) <= wallets[i].pct * 0.03);
    if (group.length > best.length) best = group;
  }
  const pct = best.reduce((s, w) => s + w.pct, 0);
  return best.length >= 5 && pct >= 10 ? { wallets: best.map((w) => w.owner), pct } : null;
}

/** The bundle as a warning sign, in plain words. */
export const bundleWarning = (b: Bundle) => `${b.wallets.length} wallets hold almost the same amount (${b.pct.toFixed(1)}% together): likely one buyer split across wallets`;

/** Ordinary wallets' share of the top holders (pools aren't people). Pure. */
export const walletShare = (holders: MapHolder[]) => holders.filter((h) => h.kind !== "pool").reduce((s, h) => s + h.pct, 0);
