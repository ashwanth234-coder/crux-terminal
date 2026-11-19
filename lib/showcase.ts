/**
 * The Layer 2 mirror showcase (Base MAINNET): one Crux coin whose liquidity lives in its Base pool, with fixed-supply
 * copies on Solana and BNB Chain in one-sided pools, backed by the coin locked on Base (crux-solver mirror/keeper.ts).
 * Its page is /showcase/<base coin>; pasting any of its three addresses into search opens it.
 * Filled in as each piece goes live (the copies don't exist until the coin graduates).
 */
export type ShowcaseCoin = {
  /** The coin on Base mainnet (its graduated Uniswap pool is the market everything follows). */
  base: string;
  name: string;
  symbol: string;
  solanaMint?: string;
  bnbToken?: string;
  vault?: string;
};

export const SHOWCASE: ShowcaseCoin[] = [];

/** The showcase coin any of its three addresses belongs to. */
export function findShowcase(address: string): ShowcaseCoin | null {
  const a = address.trim().toLowerCase();
  return SHOWCASE.find((c) => [c.base, c.solanaMint, c.bnbToken].some((x) => x?.toLowerCase() === a)) ?? null;
}

export const showcasePath = (c: ShowcaseCoin) => `/showcase/${c.base}`;

/** The keeper's backing check, from the server (crux-solver POST /v1/mirror/status). */
export type MirrorStatus = {
  coin: string;
  at: number;
  held: string;
  locked: string;
  solanaHeld: string;
  bnbHeld: string;
  last: string | null;
  error: string | null;
  paused: boolean;
};
