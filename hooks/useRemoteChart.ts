"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { watchCoinTrades } from "@/lib/coinFeed";
import { relay } from "@/hooks/useSolanaTrading";
import type { CoinTrade } from "@/lib/coinMarket";
import type { Address, Hex } from "viem";
import { toCandles, type Candle } from "@/lib/candles";
import { topPool, type ChartNetwork } from "@/lib/solanaCoins";
import type { PoolTrade } from "@/hooks/usePoolSwaps";

/** A Solana or BNB Chain coin the Crux pro chart draws (its busiest market; history and live trades from Crux's server). */
export type RemoteCoin = { network: ChartNetwork; token: string };

/**
 * The coin's price right now, read every few seconds so the newest candle moves between trade reads: Jupiter's price
 * for Solana (generous free limits), the pool's DexScreener price for BNB Chain (~300 reads a minute).
 */
async function livePrice(network: ChartNetwork, pool: string, token: string): Promise<number | null> {
  if (network === "solana") {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${token}`);
    if (!r.ok) return null;
    const p = ((await r.json()) as Record<string, { usdPrice?: number } | undefined>)[token]?.usdPrice;
    return typeof p === "number" && p > 0 ? p : null;
  }
  const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${network}/${pool}`);
  if (!r.ok) return null;
  const pair = ((await r.json()) as { pair?: { baseToken?: { address?: string }; priceUsd?: string } }).pair;
  if (!pair?.priceUsd || pair.baseToken?.address?.toLowerCase() !== token.toLowerCase()) return null;
  const p = Number(pair.priceUsd);
  return p > 0 ? p : null;
}

/** Every live price read this visit, per coin: the chart draws from these while the candle source is busy. */
const tickLog = new Map<string, { time: number; price: number }[]>();

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

  // Every trade on the coin's market, pushed by Crux's server the moment it lands (crux-solver coinfeed.ts), merged
  // into the trades list the chart and the trades tab both read.
  const qc = useQueryClient();
  useEffect(() => {
    if (!coin || pool.isPending) return;
    const key = ["coin-trades", coin.network, addr ?? coin.token];
    return watchCoinTrades(coin.network, coin.token, (fresh) => {
      setLiveFeed(true);
      qc.setQueryData<CoinTrade[]>(key, (old) => {
        // A trade read from a market's balances carries no transaction: its own id keeps it apart.
        const keyOf = (t: CoinTrade) => t.tx || t.id;
        const have = new Set((old ?? []).map(keyOf));
        const add = fresh.filter((t) => !have.has(keyOf(t)));
        if (add.length === 0) return old;
        return [...add, ...(old ?? [])].sort((a, b) => b.time - a.time).slice(0, 600);
      });
    });
  }, [coin, addr, qc, pool.isPending]);
  const fine = interval < 60;
  const tick = useQuery({
    queryKey: ["coin-tick", coin?.network, addr, coin?.token],
    queryFn: async () => {
      const p = await livePrice(coin!.network, addr!, coin!.token);
      if (p !== null) {
        const key = `${coin!.network}:${coin!.token}`;
        const log = tickLog.get(key) ?? [];
        log.push({ time: Math.floor(Date.now() / 1000), price: p });
        if (log.length > 5_000) log.splice(0, log.length - 5_000);
        tickLog.set(key, log);
      }
      return p;
    },
    enabled: coin !== null && addr !== null,
    refetchInterval: coin?.network === "solana" ? 2_000 : 3_000,
    staleTime: 1_000,
  });
  const candles = useQuery({
    queryKey: ["coin-ohlcv", coin?.network, addr, interval],
    queryFn: () => remoteCandles(coin!.network, addr!, coin!.token, interval),
    enabled: coin !== null && addr !== null && !fine,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const swapData = useMemo(() => {
    if (!trades.data) return undefined;
    const list: PoolTrade[] = trades.data.map((t) => ({
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
  }, [trades.data]);

  const base = useMemo(() => {
    // Under a minute, or a market with no stored candles (some markets aren't charted anywhere): from the trades.
    if (fine || (candles.data && candles.data.length === 0)) {
      if (!swapData) return undefined;
      const fills = [...swapData.trades].reverse().map((t) => ({ time: t.time, price: t.price, usdc: t.usdc }));
      return toCandles(fills, interval);
    }
    if (!candles.data) return undefined;
    // Trades that landed after GeckoTerminal last counted its candles move the newest one, and open the next ones.
    const out = candles.data.map((c) => ({ ...c }));
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
        } else out.push({ time: b, open: last.close, high: Math.max(last.close, t.price), low: Math.min(last.close, t.price), close: t.price, volume: usd, trades: 1 });
      }
    }
    return out;
  }, [fine, swapData, candles.data, interval]);

  // The live price moves the newest candle (or opens the next one when its period has begun), every tick.
  const live = tick.data ?? null;
  const tickAt = tick.dataUpdatedAt;
  const busy = trades.isError || (!fine && candles.isError);
  const drawn = useMemo(() => {
    // The candle source is busy: draw this visit's live prices instead of a blank chart.
    if (!base && busy && coin && tickAt) {
      const log = tickLog.get(`${coin.network}:${coin.token}`) ?? [];
      return log.length ? toCandles(log.map((t) => ({ time: t.time, price: t.price, usdc: BigInt(0) })), interval) : undefined;
    }
    if (!base || live === null || base.length === 0 || !tickAt) return base;
    const out = base.slice();
    const last = { ...out[out.length - 1] };
    const now = Math.floor(tickAt / 1000);
    const bucket = Math.floor(now / interval) * interval;
    if (bucket > last.time) {
      out.push({ time: bucket, open: last.close, high: Math.max(last.close, live), low: Math.min(last.close, live), close: live, volume: 0, trades: 0 });
    } else {
      last.close = live;
      last.high = Math.max(last.high, live);
      last.low = Math.min(last.low, live);
      out[out.length - 1] = last;
    }
    return out;
  }, [base, live, tickAt, interval, busy, coin]);

  return {
    candles: drawn,
    swapData,
    isPending: coin !== null && drawn === undefined && !pool.isError && !busy,
    isError: pool.isError || trades.isError || (!fine && candles.isError),
    noMarket: pool.data === null,
  };
}
