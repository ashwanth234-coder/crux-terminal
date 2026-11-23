/** A coin bought through Crux (crux-solver positions.ts): cash in micro-dollars, coins in base units, as strings. */
export type PositionChain = "solana" | "bsc" | "base";
export type Position = { chain: PositionChain; coin: string; boughtUsd6: string; boughtUnits: string; soldUsd6: string; soldUnits: string; updatedAt: number };

/** Average entry: dollars paid per whole coin, or undefined with nothing bought. Pure. */
export function entryPrice(p: Position, decimals: number): number | undefined {
  const units = Number(p.boughtUnits) / 10 ** decimals;
  const usd = Number(p.boughtUsd6) / 1e6;
  return units > 0 && usd > 0 ? usd / units : undefined;
}

/** Profit / loss on what's held now, against the average entry: dollars and percent. Pure. */
export function pnlOf(heldCoins: number, price: number, entry: number): { usd: number; pct: number } {
  return { usd: heldCoins * (price - entry), pct: (price / entry - 1) * 100 };
}

/** "+$0.12 (+14.2%)", "−$0.40 (−8.0%)". */
export function pnlText(p: { usd: number; pct: number }): string {
  const sign = p.usd >= 0 ? "+" : "−";
  const usd = Math.abs(p.usd);
  const dollars = usd >= 100 ? usd.toFixed(0) : usd >= 1 ? usd.toFixed(2) : usd.toFixed(usd >= 0.01 ? 2 : 4);
  return `${sign}$${dollars} (${p.pct >= 0 ? "+" : "−"}${Math.abs(p.pct).toFixed(1)}%)`;
}
