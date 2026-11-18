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
/** A freshly launched Solana coin, with the facts that tell a rug from a runner (the Trenches tab). */
export type FreshCoin = SolanaCoin & {
  createdAt: number;
  holders?: number;
  launchpad?: string;
  /** Nobody can mint more of it / freeze holders' coins. */
  mintOff?: boolean;
  freezeOff?: boolean;
  /** How much of the supply the creator holds, in percent, and how many coins they've launched before. */
  creatorPct?: number;
  creatorLaunches?: number;
  organic?: string;
  buys5m?: number;
  sells5m?: number;
};

type JupRecent = JupToken & {
  createdAt?: string;
  firstPool?: { createdAt?: string };
  holderCount?: number;
  launchpad?: string;
  organicScoreLabel?: string;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; devBalancePercentage?: number; devMints?: number };
  stats5m?: { numBuys?: number; numSells?: number };
};

/** The newest Solana coins (Jupiter's recent list), newest first, leaving out ones with almost no money in their pool. */
export async function freshSolanaCoins(minLiquidity = 1_000): Promise<FreshCoin[]> {
  const r = await fetch("https://lite-api.jup.ag/tokens/v2/recent");
  if (!r.ok) return [];
  const list = (await r.json()) as JupRecent[];
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => ({
      ...toCoin(t),
      createdAt: Date.parse(t.firstPool?.createdAt ?? t.createdAt ?? "") || Date.now(),
      holders: t.holderCount,
      launchpad: t.launchpad,
      mintOff: t.audit?.mintAuthorityDisabled,
      freezeOff: t.audit?.freezeAuthorityDisabled,
      creatorPct: t.audit?.devBalancePercentage,
      creatorLaunches: t.audit?.devMints,
      organic: t.organicScoreLabel,
      buys5m: t.stats5m?.numBuys,
      sells5m: t.stats5m?.numSells,
    }))
    .filter((c) => (c.liquidity ?? 0) >= minLiquidity)
    .sort((a, b) => b.createdAt - a.createdAt);
}

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
  // A busy or failed read is retried, never taken as "not listed" (a fresh pump coin showed that, 2026-11-18).
  if (!r.ok) throw new Error(`coin lookup ${r.status}`);
  const hit = ((await r.json()) as JupToken[]).find((t) => t.id === mint);
  if (hit) return toCoin(hit);
  // Not in Jupiter's list yet (minutes-old coins): its market on DexScreener still names it.
  const pair = await deepestPair("solana", mint);
  if (!pair || pair.baseToken.address !== mint) return null;
  return {
    mint,
    name: pair.baseToken.name ?? "",
    symbol: (pair.baseToken.symbol ?? "").replace(/^\$/, ""),
    price: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    change24h: pair.priceChange?.h24,
    mcap: pair.marketCap ?? pair.fdv,
    liquidity: pair.liquidity?.usd,
    verified: false,
  };
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

/** GeckoTerminal's name for each chain the terminal charts. */
export type ChartNetwork = "solana" | "bsc";
/** A coin's market as DexScreener lists it (its free API allows ~300 reads a minute, so it carries the live stats). */
export type DexPair = {
  dexId?: string;
  pairAddress: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken: { address: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: Record<"m5" | "h1" | "h6" | "h24", { buys?: number; sells?: number } | undefined>;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
};

const DEX_CHAIN: Record<ChartNetwork, string> = { solana: "solana", bsc: "bsc" };
const pairCache = new Map<string, { at: number; pair: Promise<DexPair | null> }>();
/**
 * The coin's deepest market (most money in it), with its live numbers: one read per coin every 15 s, shared by
 * everything on the page asking at once. Its address is the pool the chart and trades follow.
 */
export function deepestPair(network: ChartNetwork, token: string): Promise<DexPair | null> {
  const key = `${network}:${token.toLowerCase()}`;
  const hit = pairCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.pair;
  const pair = (async () => {
    const r = await fetch(`https://api.dexscreener.com/token-pairs/v1/${DEX_CHAIN[network]}/${token}`);
    if (!r.ok) throw new Error(`markets ${r.status}`);
    const t = token.toLowerCase();
    const pairs = ((await r.json()) as DexPair[]).filter(
      // Pools with a 0x… address (or any Solana one): the chart's source reads those.
      (p) => (p.baseToken.address.toLowerCase() === t || p.quoteToken.address.toLowerCase() === t) && (network === "solana" || /^0x[0-9a-fA-F]{40}$/.test(p.pairAddress)),
    );
    // The market trading right now (last 5 minutes, then the hour, then today; the server's live feed picks the same):
    // a coin that just moved from its pump.fun curve to PumpSwap still shows the curve as today's busiest.
    const v = (p: DexPair) => [p.volume?.m5 ?? 0, p.volume?.h1 ?? 0, p.volume?.h24 ?? 0, p.liquidity?.usd ?? 0];
    return pairs.sort((x, y) => {
      const a = v(x);
      const b = v(y);
      return b[0] - a[0] || b[1] - a[1] || b[2] - a[2] || b[3] - a[3];
    })[0] ?? null;
  })();
  pairCache.set(key, { at: Date.now(), pair });
  pair.catch(() => pairCache.delete(key));
  return pair;
}

/** The coin's deepest pool (its candles, stats and trades follow that pool). */
export const topPool = async (network: ChartNetwork, token: string) => (await deepestPair(network, token))?.pairAddress ?? null;

/** USD candles for a coin, oldest first, from its deepest pool. Empty when there's no pool or the API is busy. */
export async function coinCandles(network: ChartNetwork, token: string, tf: Timeframe): Promise<Candle[]> {
  const pool = await topPool(network, token);
  if (!pool) return [];
  const f = FRAMES[tf];
  const q = new URLSearchParams({ aggregate: String(f.aggregate), limit: "300", currency: "usd", token });
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/ohlcv/${f.unit}?${q}`, { headers: { accept: "application/json" } });
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

/** USD candles for a Solana coin. */
export const solanaCandles = (mint: string, tf: Timeframe) => coinCandles("solana", mint, tf);
