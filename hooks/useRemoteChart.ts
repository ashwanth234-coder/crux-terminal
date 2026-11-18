"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { toCandles, type Candle } from "@/lib/candles";
import { poolTrades } from "@/lib/coinMarket";
import { topPool, type ChartNetwork } from "@/lib/solanaCoins";
import type { PoolTrade } from "@/hooks/usePoolSwaps";

/** A Solana or BNB Chain coin the Crux pro chart draws (its deepest pool, read from GeckoTerminal). */
export type RemoteCoin = { network: ChartNetwork; token: string };

const GT = "https://api.geckoterminal.com/api/v2/networks";
/** GeckoTerminal's candle sizes, in seconds, and how it names them. */
const FRAMES: [number, "minute" | "hour" | "day", number][] = [
  [86_400, "day", 1],
  [14_400, "hour", 4],
  [3_600, "hour", 1],
  [900, "minute", 15],
  [300, "minute", 5],
  [60, "minute", 1],
];

/** USD candles at `interval` seconds: the largest size GeckoTerminal has that divides it, merged up when needed. */
async function remoteCandles(network: ChartNetwork, pool: string, token: string, interval: number): Promise<Candle[]> {
  const [size, unit, aggregate] = FRAMES.find(([s]) => interval % s === 0) ?? FRAMES[FRAMES.length - 1];
  const q = new URLSearchParams({ aggregate: String(aggregate), limit: "1000", currency: "usd", token });
  const r = await fetch(`${GT}/${network}/pools/${pool}/ohlcv/${unit}?${q}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`candles ${r.status}`);
  const rows = ((await r.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } }).data?.attributes?.ohlcv_list ?? [];
  const base = rows.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume, trades: 0 })).sort((a, b) => a.time - b.time);
  if (size === interval) return base;
  const out: Candle[] = [];
  for (const c of base) {
    const t = Math.floor(c.time / interval) * interval;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else out.push({ ...c, time: t });
  }
  return out;
}

/**
 * What the pro chart draws for a coin on another chain: its latest trades (newest first, as the chart's own swaps
 * are) and candles at the picked timeframe. Under a minute, candles are made from the latest trades (GeckoTerminal's
 * smallest candle is one minute); from a minute up, from GeckoTerminal's candles, merged when the size isn't one it has.
 */
export function useRemoteChart(coin: RemoteCoin | null, interval: number) {
  const pool = useQuery({ queryKey: ["coin-pool-addr", coin?.network, coin?.token], queryFn: () => topPool(coin!.network, coin!.token), enabled: coin !== null, staleTime: 60_000 });
  const addr = pool.data ?? null;
  const trades = useQuery({
    // The same query the terminal's trades tab reads (one request for both).
    queryKey: ["coin-trades", coin?.network, addr],
    queryFn: () => poolTrades(coin!.network, addr!, coin!.token),
    enabled: coin !== null && addr !== null,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
  const fine = interval < 60;
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

  const drawn = useMemo(() => {
    if (fine) {
      if (!swapData) return undefined;
      const fills = [...swapData.trades].reverse().map((t) => ({ time: t.time, price: t.price, usdc: t.usdc }));
      return toCandles(fills, interval);
    }
    if (!candles.data) return undefined;
    // The newest candle moves with trades that landed after GeckoTerminal last counted it.
    const out = candles.data.map((c) => ({ ...c }));
    const last = out[out.length - 1];
    if (last && swapData) {
      for (const t of [...swapData.trades].reverse()) {
        if (t.time < last.time + interval && t.time >= last.time) {
          last.close = t.price;
          last.high = Math.max(last.high, t.price);
          last.low = Math.min(last.low, t.price);
        }
      }
    }
    return out;
  }, [fine, swapData, candles.data, interval]);

  return {
    candles: drawn,
    swapData,
    isPending: coin !== null && drawn === undefined && !pool.isError && !trades.isError && !candles.isError,
    isError: pool.isError || trades.isError || (!fine && candles.isError),
    noMarket: pool.data === null,
  };
}
