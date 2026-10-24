"use client";

import { useQuery } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import { pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";
import { poolTradeReader, type PoolTrade } from "@/lib/poolTrades";

export type { PoolTrade };

const newestFirst = (scan: LogScan<PoolTrade>) => ({ trades: [...scan.items].reverse(), truncated: scan.truncated });

/**
 * Every trade on a graduated launch since graduation, newest first: swaps on its locked Uniswap V2 pool, and for a
 * V5 / V6 launch also each order filled in its batch pool's batches (at its batch's uniform price). Decoded by
 * lib/poolTrades, as the public API does.
 */
export function usePoolSwaps(pair: Address, settledAt: number, enabled: boolean, tokenDecimals = 18) {
  const queryKey = ["pool-swaps", pair];
  const pollId = queryKey.join(":");
  return useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () => scanLogs(client.getQueryData<LogScan<PoolTrade>>(queryKey), settledAt, poolTradeReader(pair, tokenDecimals))),
    select: newestFirst,
    enabled: enabled && pair !== zeroAddress,
    refetchInterval: () => pollInterval(pollId, 10_000),
    retry: false,
  });
}
