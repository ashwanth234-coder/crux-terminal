/**
 * Solana coins for the terminal (plan: docs/one-account-everywhere.md, phase D): search and coin facts from Jupiter's
 * free token API, candles from GeckoTerminal's free API. Read straight from the browser; both allow it.
 */
export type SolanaCoin = {
  mint: string;
  name: string;
  symbol: string;
  icon?: string;
  price?: number;
  change24h?: number;
  mcap?: number;
  liquidity?: number;
  verified: boolean;
  decimals?: number;
};

type JupToken = {
  decimals?: number;
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  usdPrice?: number;
  mcap?: number;
  liquidity?: number;
  isVerified?: boolean;
  stats24h?: { priceChange?: number };
};

const toCoin = (t: JupToken): SolanaCoin => ({
  mint: t.id,
  // SOL trades as its wrapped form; traders know it as Solana.
  name: t.id === "So11111111111111111111111111111111111111112" ? "Solana" : (t.name ?? ""),
  // Some coins put the $ in their own symbol ("$WIF"); the UI adds one.
  symbol: (t.symbol ?? "").replace(/^\$/, ""),
  icon: t.icon,
  price: t.usdPrice,
  change24h: t.stats24h?.priceChange,
  mcap: t.mcap,
  liquidity: t.liquidity,
  verified: t.isVerified === true,
  decimals: t.decimals,
});

/**
 * Solana majors (verified on Jupiter, deep liquidity, 2026-11-17): the right side of the "barbell", for size traders.
 * They pay the lower fee; crux-solver soltraderelay.ts SOLANA_MAJOR_MINTS holds the same list (keep them in step).
 */
export const SOLANA_MAJORS = [
  "So11111111111111111111111111111111111111112", // SOL
  "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", // cbBTC
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
];
/** Crux's fee on a Solana coin, as the trade panel states it. */
export const solanaFeeText = (mint: string) => (SOLANA_MAJORS.includes(mint) ? "Fee 0.15%, at least $0.05." : "Fee 0.5%, at least $0.05.");

/** Several coins' facts at once (Jupiter's search takes a comma-separated list of mints). */
export async function solanaCoins(mints: string[]): Promise<SolanaCoin[]> {
  const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(",")}`);
  if (!r.ok) return [];
  const list = ((await r.json()) as JupToken[]).map(toCoin);
  return mints.map((m) => list.find((c) => c.mint === m)).filter((c): c is SolanaCoin => c !== undefined);
}

/** A Solana address (base58, 32-44 characters, no 0/O/I/l). */
export const isSolanaAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

/**
 * Solana coins matching a ticker, name or address: verified ones, or ones with real liquidity, best first. A thin
 * unverified copy of a famous ticker is left out, so a search for "BONK" doesn't put a fake first.
 */
export async function searchSolanaCoins(q: string, limit = 5): Promise<SolanaCoin[]> {
  const s = q.trim().replace(/^\$/, "");
  if (s.length < 2) return [];
  const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(s)}`);
  if (!r.ok) return [];
  const list = ((await r.json()) as JupToken[]).map(toCoin);
  const exact = isSolanaAddress(s);
  return list
    .filter((c) => exact || c.verified || (c.liquidity ?? 0) >= 50_000)
    .sort((a, b) => Number(b.verified) - Number(a.verified) || (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .slice(0, limit);
}

/** One coin's facts by its mint, or null when Jupiter doesn't know it. */
export async function solanaCoin(mint: string): Promise<SolanaCoin | null> {
  const r = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`);
  if (!r.ok) return null;
  const hit = ((await r.json()) as JupToken[]).find((t) => t.id === mint);
  return hit ? toCoin(hit) : null;
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
const FRAMES: Record<Timeframe, { unit: "minute" | "hour" | "day"; aggregate: number }> = {
  "1m": { unit: "minute", aggregate: 1 },
  "5m": { unit: "minute", aggregate: 5 },
  "15m": { unit: "minute", aggregate: 15 },
  "1h": { unit: "hour", aggregate: 1 },
  "4h": { unit: "hour", aggregate: 4 },
  "1d": { unit: "day", aggregate: 1 },
};

const poolCache = new Map<string, string>();
/** The coin's deepest pool on GeckoTerminal (its candles follow that pool). */
async function topPool(mint: string): Promise<string | null> {
  const known = poolCache.get(mint);
  if (known) return known;
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`, { headers: { accept: "application/json" } });
  if (!r.ok) return null;
  const pool = ((await r.json()) as { data?: { attributes?: { address?: string } }[] }).data?.[0]?.attributes?.address ?? null;
  if (pool) poolCache.set(mint, pool);
  return pool;
}

/** USD candles for the coin, oldest first, from its deepest pool. Empty when there's no pool or the API is busy. */
export async function solanaCandles(mint: string, tf: Timeframe): Promise<Candle[]> {
  const pool = await topPool(mint);
  if (!pool) return [];
  const f = FRAMES[tf];
  const q = new URLSearchParams({ aggregate: String(f.aggregate), limit: "300", currency: "usd", token: mint });
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${f.unit}?${q}`, { headers: { accept: "application/json" } });
  if (!r.ok) return [];
  const rows = ((await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } }).data?.attributes?.ohlcv_list ?? [];
  return rows
    .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
    .sort((a, b) => a.time - b.time);
}

/** A price for display: enough significant digits for a $0.00001 coin, two decimals for a $50 one. */
export const fmtPrice = (p: number) => (p >= 1 ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${p.toPrecision(4)}`);
/** $1.2M, $34K. */
export const fmtCompact = (n: number) => `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
