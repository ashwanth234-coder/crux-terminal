"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import type { FeedFrame, FeedTrade } from "@/lib/feed";
import { mergeIntoScan, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";
import { useFeedJoin } from "@/hooks/useFeed";
import { poolTradeReader, readBatchPool, type PoolTrade } from "@/lib/poolTrades";
import { watchLogsOf } from "@/lib/stream";
import { HISTORY_ON, fetchHistory, loadHistory } from "@/lib/history";
import { externalPoolOf } from "@/lib/externalPools";

export type { PoolTrade };

// Built once per items array (a poll with nothing new keeps the array), so the chart's work keys off real changes.
const views = new WeakMap<PoolTrade[], { trades: PoolTrade[]; truncated: boolean }>();
const newestFirst = (scan: LogScan<PoolTrade>) => {
  let v = views.get(scan.items);
  if (!v || v.truncated !== scan.truncated) views.set(scan.items, (v = { trades: [...scan.items].reverse(), truncated: scan.truncated }));
  return v;
};

const fromFeed = (t: FeedTrade): PoolTrade => ({ ...t, usdc: BigInt(t.usdc), tokens: BigInt(t.tokens), blockNumber: BigInt(t.blockNumber) });
/** Feed frames that arrived before a pool's trade list was first read (they're added once it is). */
const waiting = new Map<string, FeedFrame[]>();

/**
 * Every trade on a graduated launch since graduation, newest first: swaps on its locked Uniswap V2 pool, and for a
 * V5 / V6 launch also each order filled in its batch pool's batches (at its batch's uniform price). Decoded by
 * lib/poolTrades, as the public API does. Loaded once (the relay's history, then the newest blocks); after that new
 * trades come over the shared feed, so an open page reads nothing from the chain. While the feed is down, or for a
 * pool it doesn't serve, the page follows the chain itself as before.
 */
export function usePoolSwaps(pair: Address, settledAt: number, enabled: boolean, tokenDecimals = 18) {
  const queryKey = ["pool-swaps", pair];
  const pollId = queryKey.join(":");
  const qc = useQueryClient();
  const on = enabled && pair !== zeroAddress;
  // New trades from the shared feed go straight into the list; a reorg's are dropped; a gap reloads it.
  const live =
    useFeedJoin(on ? pair : null, "trades", (f) => {
      const scan = qc.getQueryData<LogScan<PoolTrade>>(queryKey);
      if (!scan) {
        waiting.set(pair.toLowerCase(), [...(waiting.get(pair.toLowerCase()) ?? []), f]);
        return;
      }
      if (f.gap) void qc.refetchQueries({ queryKey });
      const next = mergeIntoScan(scan, f.trades.map(fromFeed), f.removed);
      if (next !== scan) qc.setQueryData(queryKey, next);
    }) === "live";
  // Without the feed: a swap on the pair (or a batch-pool fill) refetches at once; the poll below is the fallback.
  useEffect(() => {
    if (!on || live) return;
    let stop = () => {};
    let active = true;
    void readBatchPool(pair)
      .catch(() => null)
      .then((batch) => {
        if (!active) return;
        stop = watchLogsOf(batch ? [pair, batch.pool] : [pair], () => void qc.refetchQueries({ queryKey: ["pool-swaps", pair] }));
      });
    return () => {
      active = false;
      stop();
    };
  }, [on, live, pair, qc]);
  // A Crux launch's trades come from the Crux relay only, decoded once on the server: its history, then the live feed
  // (and, while the feed is down, its history again every few seconds). The page doesn't decode them itself: its own
  // decoder drifted from the server's (a sell through the V9 router showed as a "whale" trade by the router, closed at
  // its average price). A token that isn't a Crux launch, or a local fork the relay doesn't serve, reads the chain.
  const serverOnly = HISTORY_ON && !externalPoolOf(pair);
  return useQuery({
    queryKey,
    queryFn: async ({ client }) => {
      if (serverOnly) {
        const h = await tracked(pollId, () => fetchHistory(pair));
        if (!h) throw new Error("The relay's trade history isn't available right now.");
        const prev = client.getQueryData<LogScan<PoolTrade>>(queryKey);
        const base: LogScan<PoolTrade> = { items: h.trades, floor: BigInt(0), scannedTo: h.scannedTo, truncated: false, windowBlocks: BigInt(0) };
        // Trades the feed brought that the history (a few blocks behind the head) doesn't have yet stay.
        const newer = prev ? prev.items.filter((t) => t.blockNumber > h.scannedTo) : [];
        const merged = newer.length ? mergeIntoScan(base, newer) : base;
        const held = waiting.get(pair.toLowerCase()) ?? [];
        waiting.delete(pair.toLowerCase());
        return held.reduce((s, f) => mergeIntoScan(s, f.trades.map(fromFeed), f.removed), merged);
      }
      const scan = await tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<PoolTrade>>(queryKey), settledAt, poolTradeReader(pair, tokenDecimals), async () => {
          // The whole history from the relay's indexer, when it has it: the chart reaches back to the launch.
          const h = await loadHistory(pair);
          return h ? { items: h.trades, scannedTo: h.scannedTo } : null;
        }),
      );
      // Feed frames that came in while this first read ran.
      const held = waiting.get(pair.toLowerCase()) ?? [];
      waiting.delete(pair.toLowerCase());
      return held.reduce((s, f) => mergeIntoScan(s, f.trades.map(fromFeed), f.removed), scan);
    },
    select: newestFirst,
    // A busy pool holds 100k+ trades: comparing them all deeply on every poll cost more than drawing the chart.
    structuralSharing: false,
    enabled: on,
    // Every 3 s while the page is in view and the feed isn't (Base makes a block every 0.2 s); each poll reads only
    // the new blocks.
    refetchInterval: live ? false : () => pollInterval(pollId, 3_000),
    // From the relay: a missed read is tried again, and what's shown stays meanwhile.
    retry: serverOnly ? 3 : false,
  });
}
