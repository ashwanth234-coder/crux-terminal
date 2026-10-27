import { getAddress, parseUnits, type Address } from "viem";
import { buildLedger, topTraders } from "@/lib/holders";
import { loadHistory } from "@/lib/history";
import {
  CRUX_SOLVER,
  DESTINATION_SETTLER,
  FACTORY_V2,
  FACTORY_V3,
  FACTORY_V4,
  FACTORY_V5,
  FACTORY_V6,
  FACTORY_V7,
  PREVIOUS_SETTLERS,
  SETTLER,
} from "@/lib/intents";
import { readLaunches, type FeedLaunch } from "@/lib/launchFeed";
import { readPairs, readTrades, type PairInfo } from "@/lib/marketData";

/**
 * The Discover leaderboards (server): Crux memecoins by market cap, and the wallets with the best PnL across them.
 * Only markets with at least `minLiquidityUsd` of pool liquidity count, so a token seeded with dust can't top a board
 * and dust trades can't make a trader "smart money". The floor is $1,000 on mainnet; LEADERBOARD_MIN_LIQUIDITY_USD
 * sets it (the testnet default is $1, where every pool holds a few test dollars).
 */
export const MIN_LIQUIDITY_USD = Number(process.env.LEADERBOARD_MIN_LIQUIDITY_USD ?? (process.env.NEXT_PUBLIC_MAINNET === "1" ? "1000" : "1"));
const TOP = 10;

export type CoinRow = {
  symbol: string;
  name: string;
  token: Address;
  href: string;
  marketCapUsd: number;
  liquidityUsd: number;
  priceUsd: number;
  /** Price over the auction's clearing price (1 = flat since graduation). */
  sinceLaunch: number | null;
  volume24hUsd: number;
  trades24h: number;
};

export type TraderRank = {
  address: Address;
  /** Realized plus unrealized PnL across the counted markets, USD. */
  pnlUsd: number;
  realizedUsd: number;
  boughtUsd: number;
  trades: number;
  /** Tickers this wallet traded among the counted markets, best PnL first. */
  markets: string[];
};

const factoryOf: Record<number, Address | null | undefined> = { 2: FACTORY_V2, 3: FACTORY_V3, 4: FACTORY_V4, 5: FACTORY_V5, 6: FACTORY_V6, 7: FACTORY_V7 };

async function coinRow(p: PairInfo, l: FeedLaunch, now: number): Promise<CoinRow> {
  const { trades } = await readTrades(l).catch(() => ({ trades: [] }));
  const day = trades.filter((t) => t.time >= now - 86_400);
  return {
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    token: p.baseToken.address,
    href: `/launch/v${l.version}/${l.auctionId}`,
    marketCapUsd: p.marketCapUsd ?? 0,
    liquidityUsd: p.liquidityUsd ?? 0,
    priceUsd: p.priceUsd ?? 0,
    sinceLaunch: p.priceUsd && p.clearingPriceUsd ? p.priceUsd / p.clearingPriceUsd : null,
    volume24hUsd: day.reduce((s, t) => s + Number(t.usdc) / 1e6, 0),
    trades24h: day.length,
  };
}

/** Each counted market's traders (full history from the relay's indexer), with PnL at the current price. */
async function tradersOf(p: PairInfo, l: FeedLaunch) {
  const factory = factoryOf[l.version];
  const h = factory ? await loadHistory(getAddress(p.id)) : null;
  if (!h || !factory) return [];
  const ledger = buildLedger(h.transfers, [...h.trades].reverse(), {
    totalSupply: parseUnits(l.totalSupply, 18),
    clearingPrice: l.clearingPriceUsd ?? 0,
    creator: l.creator,
    factory,
    pair: getAddress(p.id),
    solver: CRUX_SOLVER,
    destinationSettler: DESTINATION_SETTLER,
    me: undefined,
    batchPool: p.batchPool,
    settlers: [SETTLER, ...PREVIOUS_SETTLERS.map((s) => s.address)],
  });
  return topTraders(ledger, p.priceUsd).map((t) => ({ ...t, symbol: p.baseToken.symbol }));
}

export async function readLeaderboards(now = Math.floor(Date.now() / 1000)) {
  const [pairs, launches] = await Promise.all([readPairs(), readLaunches(now)]);
  const byPair = new Map(launches.filter((l) => l.pool).map((l) => [getAddress(l.pool!), l]));
  const counted = pairs.filter((p) => (p.liquidityUsd ?? 0) >= MIN_LIQUIDITY_USD && byPair.has(getAddress(p.id)));

  const coins = (await Promise.all(counted.map((p) => coinRow(p, byPair.get(getAddress(p.id))!, now))))
    .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
    .slice(0, TOP);

  const per = (await Promise.all(counted.map((p) => tradersOf(p, byPair.get(getAddress(p.id))!).catch(() => [])))).flat();
  const wallets = new Map<string, TraderRank & { best: { symbol: string; pnl: number }[] }>();
  for (const t of per) {
    const key = t.address.toLowerCase();
    const w = wallets.get(key) ?? { address: getAddress(t.address), pnlUsd: 0, realizedUsd: 0, boughtUsd: 0, trades: 0, markets: [], best: [] };
    w.pnlUsd += t.total;
    w.realizedUsd += t.realized;
    w.boughtUsd += t.boughtUsd;
    w.trades += t.buys + t.sells;
    w.best.push({ symbol: t.symbol, pnl: t.total });
    wallets.set(key, w);
  }
  const traders: TraderRank[] = [...wallets.values()]
    .sort((a, b) => b.pnlUsd - a.pnlUsd)
    .slice(0, TOP)
    .map(({ best, ...w }) => ({ ...w, markets: best.sort((a, b) => b.pnl - a.pnl).map((b) => b.symbol) }));

  return { minLiquidityUsd: MIN_LIQUIDITY_USD, counted: counted.length, coins, traders };
}
