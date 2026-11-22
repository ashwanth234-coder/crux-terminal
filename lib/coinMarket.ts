/**
 * Live market facts for a Solana or BNB Chain coin's terminal (its deepest pool on GeckoTerminal's free API, read in the
 * browser): the stats bar, the trades tape, and BNB Chain's fresh coins for the Trenches tab.
 */
import { deepestPair, isStable, type ChartNetwork } from "@/lib/solanaCoins";

const GT = "https://api.geckoterminal.com/api/v2/networks";
const get = async <T,>(url: string): Promise<T | null> => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  return r.ok ? ((await r.json()) as T) : null;
};
const num = (s: string | number | null | undefined) => (s === null || s === undefined || s === "" ? undefined : Number(s));

/** BNB Chain's big coins (deep PancakeSwap pools, checked on DexScreener 2026-11-19). */
export const BNB_MAJORS = [
  { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "BNB" },
  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB" },
  { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH" },
  { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", symbol: "CAKE" },
  { address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", symbol: "XRP" },
  { address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", symbol: "LINK" },
  { address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", symbol: "DOGE" },
];

/** Base's big coins (deep Uniswap / Aerodrome pools; Kyber routes them). ETH is wrapped ETH, which trades as ETH. */
export const BASE_MAJORS = [
  { address: "0x4200000000000000000000000000000000000006", symbol: "ETH" },
  { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC" },
  { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO" },
  { address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", symbol: "VIRTUAL" },
  { address: "0x1111111111166b7FE7bd91427724B487980aFc69", symbol: "ZORA" },
  { address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", symbol: "BRETT" },
  { address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", symbol: "DEGEN" },
];

/** An EVM chain the terminal lists coins for: BNB Chain ("bsc") or Base. */
export type EvmNetwork = "bsc" | "base";
/** Wrapped gas coins, stablecoins and wrapped BTC on the base side are a new pool, not a new coin. */
const NOT_A_COIN: Record<EvmNetwork, RegExp> = {
  bsc: /^(WBNB|USDT|USDC|BUSD|FDUSD|ETH|BTCB)$/i,
  base: /^(WETH|ETH|USDC|USDbC|USDT|DAI|EURC|cbBTC|cbETH|wstETH|weETH)$/i,
};

/** BNB Chain's trending coins of the last hour (GeckoTerminal), stablecoins and wrapped BNB left out. */
export async function trendingBnbCoins(): Promise<(MajorCoin & { change1h?: number })[]> {
  return trendingEvmCoins("bsc");
}

/** A chain's trending coins of the last hour (GeckoTerminal), stablecoins and wrapped gas coins left out. */
export async function trendingEvmCoins(network: EvmNetwork): Promise<(MajorCoin & { change1h?: number })[]> {
  type Included = { id: string; attributes: { address: string; name?: string; symbol?: string; image_url?: string | null } };
  const j = await get<{ data?: PoolData[]; included?: Included[] }>(`${GT}/${network}/trending_pools?include=base_token&duration=1h`);
  const tokens = new Map((j?.included ?? []).map((i) => [i.id, i.attributes]));
  const seen = new Set<string>();
  const out: (MajorCoin & { change1h?: number })[] = [];
  for (const d of j?.data ?? []) {
    if ((d.relationships?.dex?.data?.id ?? "").startsWith("four-meme")) continue;
    const tok = tokens.get(d.relationships?.base_token?.data?.id ?? "");
    const symbol = (tok?.symbol ?? "").replace(/^\$/, "");
    if (!tok || seen.has(tok.address.toLowerCase()) || isStable(symbol) || NOT_A_COIN[network].test(symbol)) continue;
    seen.add(tok.address.toLowerCase());
    const a = d.attributes;
    out.push({
      address: tok.address,
      symbol,
      name: tok.name ?? symbol,
      icon: tok.image_url && !tok.image_url.includes("missing") ? tok.image_url : undefined,
      price: num(a.base_token_price_usd),
      change1h: num(a.price_change_percentage?.h1),
      change24h: num(a.price_change_percentage?.h24),
      mcap: num(a.market_cap_usd) ?? num(a.fdv_usd),
      liquidity: num(a.reserve_in_usd),
    });
  }
  return out;
}

export type MajorCoin ={ address: string; symbol: string; name: string; icon?: string; price?: number; change24h?: number; mcap?: number; liquidity?: number };

/** The BNB majors' live facts, from each one's deepest DexScreener market (one read for all of them). */
export async function bnbMajors(): Promise<MajorCoin[]> {
  return evmMajors("bsc");
}

/** A chain's majors' live facts (BNB_MAJORS / BASE_MAJORS), from each one's deepest DexScreener market. */
export async function evmMajors(network: EvmNetwork): Promise<MajorCoin[]> {
  type Pair = { baseToken: { address: string; name?: string }; priceUsd?: string; priceChange?: { h24?: number }; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; info?: { imageUrl?: string } };
  const list = network === "base" ? BASE_MAJORS : BNB_MAJORS;
  const pairs = (await get<Pair[]>(`https://api.dexscreener.com/tokens/v1/${network}/${list.map((m) => m.address).join(",")}`)) ?? [];
  return list.map((m) => {
    const best = pairs
      .filter((p) => p.baseToken.address.toLowerCase() === m.address.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return {
      address: m.address,
      symbol: m.symbol,
      name: m.symbol === "BNB" || m.symbol === "ETH" ? m.symbol : (best?.baseToken.name ?? m.symbol),
      icon: best?.info?.imageUrl,
      price: best?.priceUsd ? Number(best.priceUsd) : undefined,
      change24h: best?.priceChange?.h24,
      mcap: best?.marketCap ?? best?.fdv,
      liquidity: best?.liquidity?.usd,
    };
  });
}

type Txns = { buys?: number; sells?: number; buyers?: number; sellers?: number };
type PoolAttrs = {
  address: string;
  base_token_price_usd?: string;
  fdv_usd?: string | null;
  market_cap_usd?: string | null;
  reserve_in_usd?: string;
  pool_created_at?: string;
  price_change_percentage?: Record<string, string>;
  transactions?: Record<string, Txns>;
  volume_usd?: Record<string, string>;
};
type PoolData = { attributes: PoolAttrs; relationships?: { base_token?: { data?: { id?: string } }; dex?: { data?: { id?: string } } } };

export type PoolStats = {
  pool: string;
  /** The coin is the pool's first token (else its price is the quote side's; GeckoTerminal prices base). */
  price?: number;
  mcap?: number;
  liquidity?: number;
  createdAt?: number;
  venue?: string;
  change: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume24h?: number;
  volume1h?: number;
  buys24h?: number;
  sells24h?: number;
};

/** A venue id as traders know it ("pancakeswap_v2" → "PancakeSwap", "pump-fun" → "pump.fun"). */
const VENUES: [RegExp, string][] = [
  [/^pancakeswap/, "PancakeSwap"],
  [/^raydium/, "Raydium"],
  [/^meteora/, "Meteora"],
  [/^orca/, "Orca"],
  [/^pump/, "PumpSwap"],
  [/^four-meme/, "four.meme"],
  [/^uniswap/, "Uniswap"],
];
export const venueName = (id?: string) => (id ? (VENUES.find(([r]) => r.test(id))?.[1] ?? id.replace(/[-_]/g, " ")) : undefined);

/** The coin's deepest pool and its numbers (DexScreener). Null when it has no market. */
export async function poolStats(network: ChartNetwork, token: string): Promise<PoolStats | null> {
  const p = await deepestPair(network, token);
  if (!p) return null;
  const isBase = p.baseToken.address.toLowerCase() === token.toLowerCase();
  const t24 = p.txns?.h24;
  return {
    pool: p.pairAddress,
    price: isBase && p.priceUsd ? Number(p.priceUsd) : undefined,
    mcap: isBase ? (p.marketCap ?? p.fdv) : undefined,
    liquidity: p.liquidity?.usd,
    createdAt: p.pairCreatedAt,
    venue: venueName(p.dexId),
    change: isBase ? { m5: p.priceChange?.m5, h1: p.priceChange?.h1, h6: p.priceChange?.h6, h24: p.priceChange?.h24 } : {},
    volume24h: p.volume?.h24,
    volume1h: p.volume?.h1,
    buys24h: t24?.buys,
    sells24h: t24?.sells,
  };
}

export type CoinTrade = { id: string; time: number; side: "buy" | "sell"; usd: number; amount: number; price: number; trader: string; tx: string };

type TradeAttrs = {
  block_timestamp: string;
  tx_hash: string;
  tx_from_address: string;
  from_token_address: string;
  to_token_address: string;
  from_token_amount: string;
  to_token_amount: string;
  price_from_in_usd: string;
  price_to_in_usd: string;
  volume_in_usd: string;
};

/** The pool's latest trades (up to 300, newest first), as buys and sells of `token`. */
export async function poolTrades(network: ChartNetwork, pool: string, token: string): Promise<CoinTrade[]> {
  const j = await get<{ data?: { id: string; attributes: TradeAttrs }[] }>(`${GT}/${network}/pools/${pool}/trades`);
  const t = token.toLowerCase();
  return (j?.data ?? []).map(({ id, attributes: a }) => {
    const buy = a.to_token_address.toLowerCase() === t;
    return {
      id,
      time: Date.parse(a.block_timestamp),
      side: buy ? "buy" : "sell",
      usd: Number(a.volume_in_usd),
      amount: Number(buy ? a.to_token_amount : a.from_token_amount),
      price: Number(buy ? a.price_to_in_usd : a.price_from_in_usd),
      trader: a.tx_from_address,
      tx: a.tx_hash,
    } satisfies CoinTrade;
  });
}

export type FreshBnbCoin = {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  createdAt: number;
  mcap?: number;
  liquidity?: number;
  buys5m?: number;
  sells5m?: number;
  venue?: string;
};

/**
 * The newest BNB Chain coins with a tradeable pool (GeckoTerminal's new pools, two pages), newest first. Coins still on
 * four.meme's curve are left out: Crux's BNB Chain route can't trade them until they move to PancakeSwap.
 */
export async function freshBnbCoins(minLiquidity = 1_000): Promise<FreshBnbCoin[]> {
  return freshEvmCoins("bsc", minLiquidity);
}

/** A chain's newest coins with a tradeable pool (see freshBnbCoins), newest first. */
export async function freshEvmCoins(network: EvmNetwork, minLiquidity = 1_000): Promise<FreshBnbCoin[]> {
  type Included = { id: string; attributes: { address: string; name?: string; symbol?: string; image_url?: string | null } };
  const pages = await Promise.all(
    [1, 2].map((p) => get<{ data?: PoolData[]; included?: Included[] }>(`${GT}/${network}/new_pools?include=base_token&page=${p}`).catch(() => null)),
  );
  const tokens = new Map(pages.flatMap((p) => p?.included ?? []).map((i) => [i.id, i.attributes]));
  const seen = new Set<string>();
  const out: FreshBnbCoin[] = [];
  for (const d of pages.flatMap((p) => p?.data ?? [])) {
    const dex = d.relationships?.dex?.data?.id ?? "";
    if (dex.startsWith("four-meme")) continue;
    const tok = tokens.get(d.relationships?.base_token?.data?.id ?? "");
    if (!tok) continue;
    const key = tok.address.toLowerCase();
    if (seen.has(key) || NOT_A_COIN[network].test(tok.symbol ?? "")) continue;
    const a = d.attributes;
    const liquidity = num(a.reserve_in_usd);
    if ((liquidity ?? 0) < minLiquidity) continue;
    seen.add(key);
    out.push({
      address: tok.address,
      name: tok.name ?? "",
      symbol: (tok.symbol ?? "").replace(/^\$/, ""),
      icon: tok.image_url && !tok.image_url.includes("missing") ? tok.image_url : undefined,
      createdAt: a.pool_created_at ? Date.parse(a.pool_created_at) : Date.now(),
      mcap: num(a.market_cap_usd) ?? num(a.fdv_usd),
      liquidity,
      buys5m: a.transactions?.m5?.buys,
      sells5m: a.transactions?.m5?.sells,
      venue: venueName(dex),
    });
  }
  return out.sort((x, y) => y.createdAt - x.createdAt);
}

/** Where a transaction or wallet opens, per chain. */
export const explorer = (network: ChartNetwork) => {
  if (network === "solana")
    return { tx: (h: string) => `https://solscan.io/tx/${h}`, account: (a: string) => `https://solscan.io/account/${a}`, token: (a: string) => `https://solscan.io/token/${a}` };
  const host = network === "base" ? "https://basescan.org" : "https://bscscan.com";
  return { tx: (h: string) => `${host}/tx/${h}`, account: (a: string) => `${host}/address/${a}`, token: (a: string) => `${host}/token/${a}` };
};
