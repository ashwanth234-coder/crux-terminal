import { formatUnits, getAddress, parseAbi, type Address } from "viem";
import { loadHistory } from "./history";
import { batchPoolAbi } from "@/lib/batchPool";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { readLaunches, type FeedLaunch } from "@/lib/launchFeed";
import { LOG_WINDOW_LABEL, logClient, scanLogs, type LogScan } from "@/lib/logs";
import { poolTradeReader, readBatchPool, readUsdcIs0, type PoolTrade } from "@/lib/poolTrades";
import { SITE_URL } from "@/lib/site";

/**
 * The public market data API's reads (/api/pairs, /api/trades, /api/candles), server-side: every graduated Crux
 * launch's market and its trades, from the chain. Trades are decoded exactly as the terminal's tape and chart decode
 * them (lib/poolTrades), within the same log window (lib/logs).
 */

const pairAbi = parseAbi(["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"]);

export type PairInfo = {
  /** The Uniswap V2 pair (token / test USDC): the market's id. */
  id: Address;
  chainId: 84532;
  dex: "uniswap-v2";
  baseToken: { address: Address; symbol: string; name: string; decimals: 18 };
  quoteToken: { address: Address; symbol: "USDC"; decimals: 6 };
  /** Where the liquidity trades now: the pair, or (anti-sniper window) the launch's batch pool. */
  venue: "uniswap-v2" | "crux-batch-pool";
  batchPool: Address | null;
  /** Unix seconds the batch-only window ends, while it's on. */
  batchOnlyUntil: number | null;
  /** USD per whole token from the live reserves (mid price), and the reserves as decimal strings. */
  priceUsd: number | null;
  reserves: { base: string; quote: string };
  liquidityUsd: number;
  marketCapUsd: number | null;
  clearingPriceUsd: number | null;
  graduatedAt: number | null;
  antiSniperSeconds: number;
  creatorVestingDays: number;
  lpBurned: boolean;
  launch: { key: string; version: number; auctionId: number; creator: Address };
  urls: { terminal: string; pair: string; token: string; trades: string; candles: string };
};

async function pairOf(l: FeedLaunch): Promise<PairInfo> {
  const pair = getAddress(l.pool!);
  const batch = await readBatchPool(pair);
  let venue: PairInfo["venue"] = "uniswap-v2";
  let base = BigInt(0);
  let quote = BigInt(0);
  let batchOnlyUntil: number | null = null;
  if (batch) {
    const [state, until] = await Promise.all([
      logClient.readContract({ address: batch.pool, abi: batchPoolAbi, functionName: "pools", args: [batch.token] }),
      logClient.readContract({ address: batch.pool, abi: batchPoolAbi, functionName: "protectedUntil", args: [batch.token] }).catch(() => null),
    ]);
    const [reserveQuote, reserveToken, , seededAt, migrated] = state;
    // Seeded and not yet migrated: the batch pool holds the liquidity (the pair is empty and locked).
    if (seededAt > BigInt(0) && !migrated) {
      venue = "crux-batch-pool";
      quote = reserveQuote;
      base = reserveToken;
      batchOnlyUntil = until !== null ? Number(until) : null;
    }
  }
  if (venue === "uniswap-v2") {
    const [[r0, r1], usdcIs0] = await Promise.all([logClient.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }), readUsdcIs0(pair)]);
    [quote, base] = usdcIs0 ? [r0, r1] : [r1, r0];
  }
  const priceUsd = base > BigInt(0) ? Number(formatUnits(quote, 6)) / Number(formatUnits(base, 18)) : null;
  const q = `?pair=${pair}`;
  return {
    id: pair,
    chainId: 84532,
    dex: "uniswap-v2",
    baseToken: { address: l.token, symbol: l.symbol, name: l.name, decimals: 18 },
    quoteToken: { address: TESTNET_USDC, symbol: "USDC", decimals: 6 },
    venue,
    batchPool: batch?.pool ?? null,
    batchOnlyUntil,
    priceUsd,
    reserves: { base: formatUnits(base, 18), quote: formatUnits(quote, 6) },
    liquidityUsd: 2 * Number(formatUnits(quote, 6)),
    marketCapUsd: priceUsd !== null ? priceUsd * Number(l.totalSupply) : null,
    clearingPriceUsd: l.clearingPriceUsd,
    graduatedAt: l.graduatedAt,
    antiSniperSeconds: l.antiSniperSeconds,
    creatorVestingDays: l.creatorVestingDays,
    lpBurned: l.lpBurned,
    launch: { key: l.key, version: l.version, auctionId: l.auctionId, creator: l.creator },
    urls: {
      terminal: l.urls.terminal,
      pair: `${TESTNET_EXPLORER}/address/${pair}`,
      token: l.urls.token,
      trades: `${SITE_URL}/api/trades${q}`,
      candles: `${SITE_URL}/api/candles${q}`,
    },
  };
}

/** Every graduated launch's market, newest launch first. */
export async function readPairs(): Promise<PairInfo[]> {
  const graduated = (await readLaunches()).filter((l) => l.pool !== null);
  return Promise.all(graduated.map(pairOf));
}

/** The graduated launch behind `pair`, or null. */
export async function launchOfPair(pair: Address): Promise<FeedLaunch | null> {
  const launches = await readLaunches();
  return launches.find((l) => l.pool !== null && getAddress(l.pool) === getAddress(pair)) ?? null;
}

export async function readPair(pair: Address): Promise<PairInfo | null> {
  const l = await launchOfPair(pair);
  return l ? pairOf(l) : null;
}

/** Each pair's last scan: a warm server reads only new blocks. */
const scans = new Map<Address, LogScan<PoolTrade>>();

/** A pair's trades since graduation, oldest first, within the log window (`truncated` when older ones are cut). */
export async function readTrades(l: FeedLaunch): Promise<{ trades: PoolTrade[]; truncated: boolean }> {
  const pair = getAddress(l.pool!);
  // Read from shortly before the auction closed, so nothing at graduation is missed.
  const since = (l.graduatedAt ?? l.closesAt) - 120;
  const scan = await scanLogs(scans.get(pair), since, poolTradeReader(pair, 18), async () => {
    // The relay's full history, when it has it, so the API reaches back to the launch too.
    const h = await loadHistory(pair);
    return h ? { items: h.trades, scannedTo: h.scannedTo } : null;
  });
  scans.set(pair, scan);
  return { trades: scan.items, truncated: scan.truncated };
}

/** A trade as the API publishes it: amounts as decimal strings, blocks as strings. */
export function tradeJson(t: PoolTrade) {
  return {
    txHash: t.txHash,
    logIndex: t.logIndex,
    blockNumber: t.blockNumber.toString(),
    time: t.time,
    side: t.side,
    priceUsd: t.price,
    baseAmount: formatUnits(t.tokens, 18),
    quoteAmount: formatUnits(t.usdc, 6),
    recipient: t.to,
    viaCruxSolver: t.viaIntent,
    venue: t.venue,
    ...(t.batch !== undefined ? { batch: t.batch } : {}),
  };
}

export const API_NOTES = {
  chainId: 84532,
  network: "base-sepolia",
  testnet: true,
  notes: `Test tokens on Base Sepolia only; prices are in test USDC. Trades cover the last ${LOG_WINDOW_LABEL} at most.`,
} as const;
