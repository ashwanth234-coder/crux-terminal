"use client";

import { useQuery } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import { tradingSince } from "@/lib/coinAge";
import type { LaunchHistory } from "@/lib/launchHistory";
import type { ChartNetwork } from "@/lib/solanaCoins";

/**
 * When a coin really started trading (ms), from its market's first traded hour (Crux's cached candles) and, for a
 * Solana coin, its launch history (shared with the chart's read). Falls back to the market's creation date.
 */
export function useTradingSince(network: ChartNetwork, token: string, pool: string | undefined, marketCreatedAt: number | undefined): number | undefined {
  const hours = useQuery({
    queryKey: ["coin-first-hour", network, pool],
    enabled: !!pool,
    staleTime: 30 * 60_000,
    queryFn: async () => (await relay<{ candles: number[][] }>("/v1/coin-candles", { chain: network, coin: token, pool, interval: 3_600 })).candles,
  });
  const launch = useQuery({
    queryKey: ["launch-history", network, token],
    enabled: network === "solana",
    staleTime: 10_000,
    queryFn: () => relay<LaunchHistory>("/v1/launch-history", { chain: network, coin: token }),
  });
  const first = hours.data?.[0]?.[0];
  const launchTrades = launch.data && !launch.data.loading && !launch.data.none ? launch.data.trades : null;
  const launchFirst = launchTrades?.length ? Math.min(...launchTrades.map((t) => t.time)) : undefined;
  return tradingSince({ marketCreatedAt, firstHour: first, hours: hours.data?.length ?? 0, launchFirst });
}
