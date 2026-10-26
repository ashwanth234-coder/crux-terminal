"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import { pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";
import { poolTradeReader, readBatchPool, type PoolTrade } from "@/lib/poolTrades";
import { watchLogsOf } from "@/lib/stream";

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
  const qc = useQueryClient();
  // Streamed: a swap on the pair (or a batch-pool fill) refetches at once; the poll below is the fallback.
  useEffect(() => {
    if (!enabled || pair === zeroAddress) return;
    let stop = () => {};
    let live = true;
    void readBatchPool(pair)
      .catch(() => null)
      .then((batch) => {
        if (!live) return;
        stop = watchLogsOf(batch ? [pair, batch.pool] : [pair], () => void qc.refetchQueries({ queryKey: ["pool-swaps", pair] }));
      });
    return () => {
      live = false;
      stop();
    };
  }, [enabled, pair, qc]);
  return useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () => scanLogs(client.getQueryData<LogScan<PoolTrade>>(queryKey), settledAt, poolTradeReader(pair, tokenDecimals))),
    select: newestFirst,
    enabled: enabled && pair !== zeroAddress,
    // Every 3 s while the page is in view (Base makes a block every 0.2 s); each poll reads only the new blocks.
    refetchInterval: () => pollInterval(pollId, 3_000),
    retry: false,
  });
}
