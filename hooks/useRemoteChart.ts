"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { watchCoinTrades, type FeedStatus } from "@/lib/coinFeed";
import { relay } from "@/hooks/useSolanaTrading";
import { newestFirst, poolTrades, type CoinTrade } from "@/lib/coinMarket";
import type { Address, Hex } from "viem";
import { toCandles, type Candle } from "@/lib/candles";
import { topPool, type ChartNetwork } from "@/lib/solanaCoins";
import type { PoolTrade } from "@/hooks/usePoolSwaps";
import { joinLaunch, launchCandles, type LaunchHistory } from "@/lib/launchHistory";

/** A Solana or BNB Chain coin the Crux pro chart draws (its busiest market; history and live trades from Crux's server). */
export type RemoteCoin = { network: ChartNetwork; token: string };

/** USD candles at `interval` seconds: the largest size GeckoTerminal has that divides it, merged up when needed. */
async function remoteCandles(network: ChartNetwork, pool: string, token: string, interval: number): Promise<Candle[]> {
  // Crux's server reads them once for every page and caches them (crux-solver coinfeed.ts): a page never calls the
  // free chart-data API itself, so no viewer's own limit with it can blank the chart.
  const r = await relay<{ candles: number[][] }>("/v1/coin-candles", { chain: network, coin: token, pool, interval });
  return r.candles.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume, trades: 0 }));
}

/**
 * What the pro chart draws for a coin on another chain: its latest trades (newest first, as the chart's own swaps
 * are) and candles at the picked timeframe. Under a minute, candles are made from the latest trades (GeckoTerminal's
 * smallest candle is one minute); from a minute up, from GeckoTerminal's candles, merged when the size isn't one it has.
 */
export function useRemoteChart(coin: RemoteCoin | null, interval: number) {
  const [liveFeed, setLiveFeed] = useState(false);
  // How current the feed says it is (BNB Chain and Base), and how long after their block trades reached this page.
  const [feed, setFeed] = useState<{ key: string; status: FeedStatus } | null>(null);
  const [arrival, setArrival] = useState<{ key: string; lags: number[] } | null>(null);
  const pool = useQuery({ queryKey: ["coin-pool-addr", coin?.network, coin?.token], queryFn: () => topPool(coin!.network, coin!.token), enabled: coin !== null, staleTime: 60_000 });
  const addr = pool.data ?? null;
  const trades = useQuery({
    // The same query the terminal's trades tab reads (one request for both).
    // Keyed by the coin when it has no listed market yet (minutes old): the live feed still brings its trades.
    queryKey: ["coin-trades", coin?.network, addr ?? coin?.token],
    // Filled by the live feed: the market's latest trades when it opens, then each one as it lands.
    queryFn: () => [] as CoinTrade[],
    enabled: false,
    // With the live feed on, this only fills in history now and then; the feed brings each trade as it lands.
    refetchInterval: () => (liveFeed ? 60_000 : 10_000),
    staleTime: 5_000,
  });

  // The coin's launch phase, before any market data site saw it (crux-solver launchhistory.ts: a Solana coin's
  // pump.fun curve trades): the chart and the creator's DB / DS badges start at its first trade. A first read can
  // take minutes on the server: asked again every 10 s until it's ready; a coin still on its curve every 30 s.
  const launch = useQuery({
    queryKey: ["launch-history", coin?.network, coin?.token],
    enabled: coin?.network === "solana",
    staleTime: 10_000,
    queryFn: () => relay<LaunchHistory>("/v1/launch-history", { chain: coin!.network, coin: coin!.token }),
    refetchInterval: (q) => {
      const d = q.state.data;
      return !d || d.loading ? 10_000 : d.none || d.complete ? false : 30_000;
    },
  });
  const launchTrades = launch.data && !launch.data.loading && !launch.data.none ? launch.data.trades : null;

  // Every trade on the coin's market, pushed by Crux's server the moment it lands (crux-solver coinfeed.ts), merged
  // into the trades list the chart and the trades tab both read.
  const qc = useQueryClient();
  useEffect(() => {
    if (!coin || pool.isPending) return;
    const key = ["coin-trades", coin.network, addr ?? coin.token];
    const me = `${coin.network}:${coin.token}`;
    let first = true;
    return watchCoinTrades(
      coin.network,
      coin.token,
      (fresh) => {
      setLiveFeed(true);
      const at = Date.now();
      // Timed: trades that land while the page is open (the first batch is what already happened).
      const lags = first ? [] : fresh.filter((t) => t.seq !== undefined && at - t.time < 120_000).map((t) => at - t.time);
      first = false;
      if (lags.length) setArrival((a) => ({ key: me, lags: [...(a?.key === me ? a.lags : []), ...lags].slice(-200) }));
      qc.setQueryData<CoinTrade[]>(key, (old) => {
        // A trade read from a market's balances carries no transaction: its own id keeps it apart.
        const keyOf = (t: CoinTrade) => t.tx || t.id;
        const have = new Set((old ?? []).map(keyOf));
        const add = fresh.filter((t) => !have.has(keyOf(t)));
        if (add.length === 0) return old;
        return [...add, ...(old ?? [])].sort(newestFirst).slice(0, 600);
      });
      },
      (status) => setFeed({ key: me, status }),
    );
  }, [coin, addr, qc, pool.isPending]);

  // Base: Crux's server streams each trade from the chain; only while that feed hasn't answered (or can't follow the
  // market) are the market's latest trades read from GeckoTerminal every 15 s.
  useEffect(() => {
    if (!coin || coin.network !== "base" || !addr || liveFeed) return;
    const key = ["coin-trades", coin.network, addr];
    let stop = false;
    const read = () =>
      poolTrades("base", addr, coin.token)
        .then((fresh) => {
          if (stop || fresh.length === 0) return;
          qc.setQueryData<CoinTrade[]>(key, (old) => {
            const have = new Set((old ?? []).map((t) => t.tx || t.id));
            const add = fresh.filter((t) => !have.has(t.tx || t.id));
            if (add.length === 0) return old;
            return [...add, ...(old ?? [])].sort(newestFirst).slice(0, 600);
          });
        })
        .catch(() => undefined);
    void read();
    const t = setInterval(read, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [coin, addr, qc, liveFeed]);
  const fine = interval < 60;
  const candles = useQuery({
    queryKey: ["coin-ohlcv", coin?.network, addr, interval],
    queryFn: () => remoteCandles(coin!.network, addr!, coin!.token, interval),
    enabled: coin !== null && addr !== null && !fine,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const swapData = useMemo(() => {
    if (!trades.data && !launchTrades) return undefined;
    // The market's trades, then the launch phase's before them (each trade once), newest first.
    const all = joinLaunch(trades.data ?? [], launchTrades);
    const list: PoolTrade[] = all.map((t) => ({
      side: t.side,
      usdc: BigInt(Math.round(t.usd * 1e6)),
      tokens: BigInt(0),
      price: t.price,
      to: t.trader as Address,
      viaIntent: false,
      // Not a Base pool: "uniswap-v2" only means an ordinary pool swap to the chart.
      venue: "uniswap-v2",
      txHash: t.tx as Hex,
      blockNumber: BigInt(0),
      logIndex: 0,
      time: Math.floor(t.time / 1000),
    }));
    return { trades: list, truncated: false };
  }, [trades.data, launchTrades]);

  const base = useMemo(() => {
    // Under a minute, or a market with no stored candles (some markets aren't charted anywhere): from the trades.
    if (fine || (candles.data && candles.data.length === 0)) {
      if (!swapData) return undefined;
      const fills = [...swapData.trades].reverse().map((t) => ({ time: t.time, price: t.price, usdc: t.usdc }));
      return toCandles(fills, interval);
    }
    if (!candles.data) return undefined;
    // Trades that landed after GeckoTerminal last counted its candles move the newest one, and open the next ones.
    // The launch phase's candles go in front of the market's (GeckoTerminal never saw that phase).
    const out = [...launchCandles(launchTrades, candles.data[0]?.time ?? Infinity, interval), ...candles.data.map((c) => ({ ...c }))];
    if (out.length && swapData) {
      for (const t of [...swapData.trades].reverse()) {
        const last = out[out.length - 1];
        if (t.time < last.time) continue;
        const usd = Number(t.usdc) / 1e6;
        const b = Math.floor(t.time / interval) * interval;
        if (b === last.time) {
          last.close = t.price;
          last.high = Math.max(last.high, t.price);
          last.low = Math.min(last.low, t.price);
          last.volume += usd;
        } else out.push({ time: b, open: t.price, high: t.price, low: t.price, close: t.price, volume: usd, trades: 1 });
      }
    }
    return out;
  }, [fine, swapData, candles.data, interval, launchTrades]);

  // Only trades draw candles: a quoted price (Jupiter, DexScreener) trails the coin's own trades and isn't a trade.
  const busy = trades.isError || (!fine && candles.isError);
  const drawn = base;

  const me = coin ? `${coin.network}:${coin.token}` : "";
  const sorted = arrival?.key === me ? [...arrival.lags].sort((a, b) => a - b) : [];
  return {
    /** The feed's state for the chart's Live sign, with the median time from a trade's block to this page; null when unknown. */
    feed: feed?.key === me ? { ...feed.status, pageLagMs: sorted.length >= 3 ? sorted[sorted.length >> 1] : null } : null,
    candles: drawn,
    swapData,
    isPending: coin !== null && drawn === undefined && !pool.isError && !busy,
    isError: pool.isError || trades.isError || (!fine && candles.isError),
    noMarket: pool.data === null,
    /** When the coin left its launch curve (unix s), for a "Graduated" line; null when unknown or still on it. */
    graduatedAt: launch.data && !launch.data.loading && launch.data.complete ? (launch.data.graduatedAt ?? null) : null,
    /** The launch phase is still being read (the chart says so). */
    launchLoading: launch.data?.loading === true,
  };
}
