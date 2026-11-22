/**
 * BNB Chain coins for the terminal (docs: crux-solver docs/bnb-chain.md): search and coin facts from DexScreener's free
 * API (a coin appears once per pair; its deepest pair stands for it), candles from GeckoTerminal ("bsc").
 */
export type BnbCoin = {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  price?: number;
  change24h?: number;
  mcap?: number;
  liquidity?: number;
};

type Pair = {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  priceChange?: { h24?: number };
  info?: { imageUrl?: string };
};

/** The deepest pair of each coin on one chain (DexScreener's "bsc" or "base"), as a coin. */
function coinsOf(pairs: Pair[], chainId: "bsc" | "base" = "bsc"): BnbCoin[] {
  const best = new Map<string, Pair>();
  for (const p of pairs) {
    if (p.chainId !== chainId) continue;
    const k = p.baseToken.address.toLowerCase();
    const have = best.get(k);
    if (!have || (p.liquidity?.usd ?? 0) > (have.liquidity?.usd ?? 0)) best.set(k, p);
  }
  return [...best.values()].map((p) => ({
    address: p.baseToken.address,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol.replace(/^\$/, ""),
    icon: p.info?.imageUrl,
    price: p.priceUsd ? Number(p.priceUsd) : undefined,
    change24h: p.priceChange?.h24,
    mcap: p.marketCap ?? p.fdv,
    liquidity: p.liquidity?.usd,
  }));
}

/** BNB Chain coins matching a ticker, name or address, with real liquidity, deepest first. */
export async function searchBnbCoins(q: string, limit = 4, chainId: "bsc" | "base" = "bsc"): Promise<BnbCoin[]> {
  const s = q.trim().replace(/^\$/, "");
  if (s.length < 2) return [];
  const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(s)}`);
  if (!r.ok) return [];
  const pairs = ((await r.json()) as { pairs?: Pair[] }).pairs ?? [];
  return coinsOf(pairs, chainId)
    .filter((c) => (c.liquidity ?? 0) >= 50_000)
    .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
    .slice(0, limit);
}

/** One coin's facts by its address on BNB Chain, or null when no BNB Chain market has it. */
export async function bnbCoin(address: string, chainId: "bsc" | "base" = "bsc"): Promise<BnbCoin | null> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${address}`);
  if (!r.ok) return null;
  const hit = coinsOf(((await r.json()) as { pairs?: Pair[] }).pairs ?? [], chainId).find((c) => c.address.toLowerCase() === address.toLowerCase());
  return hit ?? null;
}

/**
 * Which chain a pasted 0x address trades on: "bnb" when DexScreener has it on BNB Chain and not on Base, else "base"
 * (Crux launches and Base coins open on /token/, as before).
 */
export async function chainOf0x(address: string): Promise<"bnb" | "base"> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${address}`);
    const pairs = (((await r.json()) as { pairs?: Pair[] }).pairs ?? []).filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
    return pairs.some((p) => p.chainId === "bsc") && !pairs.some((p) => p.chainId === "base") ? "bnb" : "base";
  } catch {
    return "base";
  }
}

/** Crux's fee on a BNB Chain coin, as the trade panel states it (majors aren't set up on BNB Chain yet). */
export const bnbFeeText = "Fee 0.5%, at least $0.05.";

/** Base coins matching a ticker, name or address, with real liquidity, deepest first (DexScreener). */
export const searchBaseCoins = (q: string, limit = 4) => searchBnbCoins(q, limit, "base");
/** One coin's facts by its address on Base, or null when no Base market has it. */
export const baseCoin = (address: string) => bnbCoin(address, "base");
