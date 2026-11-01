"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import { feedSocket, type FeedFrame, type FeedStatus, type FeedTrade } from "@/lib/feed";
import { pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";
import { poolTradeReader, readBatchPool, type PoolTrade } from "@/lib/poolTrades";
import { watchLogsOf } from "@/lib/stream";
import { loadHistory } from "@/lib/history";

export type { PoolTrade };

// Built once per items array (a poll with nothing new keeps the array), so the chart's work keys off real changes.
const views = new WeakMap<PoolTrade[], { trades: PoolTrade[]; truncated: boolean }>();
const newestFirst = (scan: LogScan<PoolTrade>) => {
  let v = views.get(scan.items);
  if (!v || v.truncated !== scan.truncated) views.set(scan.items, (v = { trades: [...scan.items].reverse(), truncated: scan.truncated }));
  return v;
};

const keyOf = (t: { txHash: string; logIndex: number }) => `${t.txHash}:${t.logIndex}`;
const fromFeed = (t: FeedTrade): PoolTrade => ({ ...t, usdc: BigInt(t.usdc), tokens: BigInt(t.tokens), blockNumber: BigInt(t.blockNumber) });

/** Adds feed trades to a scan and drops a reorg's removed ones. Returns the scan itself when nothing changed. */
function merge(scan: LogScan<PoolTrade>, trades: FeedTrade[], removed: string[] = []): LogScan<PoolTrade> {
  const gone = new Set(removed);
  let items = gone.size ? scan.items.filter((t) => !gone.has(keyOf(t))) : scan.items;
  const incoming = trades.map(fromFeed);
  // Held trades from the oldest incoming block on (items are oldest first): the only ones an incoming trade can repeat.
  const oldest = incoming.reduce((m, t) => (t.blockNumber < m ? t.blockNumber : m), incoming[0]?.blockNumber ?? BigInt(0));
  let from = items.length;
  while (from > 0 && items[from - 1].blockNumber >= oldest) from--;
  const have = new Set(items.slice(from).map(keyOf));
  const fresh = incoming.filter((t) => !have.has(keyOf(t)));
  if (fresh.length === 0 && items === scan.items) return scan;
  if (fresh.length) {
    const last = items.at(-1);
    items = [...items, ...fresh];
    const ordered = (a: PoolTrade, b: PoolTrade) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
    if (last && fresh.some((t) => ordered(t, last) < 0)) items.sort(ordered);
  }
  return { ...scan, items };
}

/**
 * One feed subscription per pool, however many components read its trades: each frame's new trades are added to the
 * pool's trade list, a reorg's dropped ones removed, and a gap (a long disconnect) reloads it. Frames that arrive
 * before the list's first read wait for it.
 */
const feeds = new Map<string, { refs: number; stop: () => void }>();
const statuses = new Map<string, FeedStatus>();
const listeners = new Map<string, Set<() => void>>();
const waiting = new Map<string, FeedFrame[]>();

function setStatus(k: string, s: FeedStatus) {
  statuses.set(k, s);
  listeners.get(k)?.forEach((l) => l());
}

function onFrame(qc: QueryClient, pair: Address, f: FeedFrame) {
  const key = ["pool-swaps", pair];
  const scan = qc.getQueryData<LogScan<PoolTrade>>(key);
  if (!scan) {
    waiting.set(pair.toLowerCase(), [...(waiting.get(pair.toLowerCase()) ?? []), f]);
    return;
  }
  if (f.gap) void qc.refetchQueries({ queryKey: key });
  const next = merge(scan, f.trades, f.removed);
  if (next !== scan) qc.setQueryData(key, next);
}

function joinFeed(qc: QueryClient, pair: Address): () => void {
  const k = pair.toLowerCase();
  let entry = feeds.get(k);
  if (!entry) {
    const stop = feedSocket().subscribe({
      pair,
      // Daily candles, the lightest subscription: it's here for the trades.
      interval: 86_400,
      since: () => Math.floor(Date.now() / 1000) - 86_400,
      onFrame: (f) => onFrame(qc, pair, f),
      onStatus: (s) => setStatus(k, s),
    });
    feeds.set(k, (entry = { refs: 0, stop }));
  }
  entry.refs++;
  return () => {
    if (--entry.refs > 0) return;
    entry.stop();
    feeds.delete(k);
    statuses.delete(k);
    waiting.delete(k);
  };
}

function useFeedStatus(pair: Address): FeedStatus {
  const k = pair.toLowerCase();
  return useSyncExternalStore(
    (l) => {
      if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k)!.add(l);
      return () => listeners.get(k)?.delete(l);
    },
    () => statuses.get(k) ?? "connecting",
    () => "connecting" as FeedStatus,
  );
}

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
  useEffect(() => (on ? joinFeed(qc, pair) : undefined), [on, pair, qc]);
  const live = useFeedStatus(pair) === "live";
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
  return useQuery({
    queryKey,
    queryFn: async ({ client }) => {
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
      return held.reduce((s, f) => merge(s, f.trades, f.removed), scan);
    },
    select: newestFirst,
    // A busy pool holds 100k+ trades: comparing them all deeply on every poll cost more than drawing the chart.
    structuralSharing: false,
    enabled: on,
    // Every 3 s while the page is in view and the feed isn't (Base makes a block every 0.2 s); each poll reads only
    // the new blocks.
    refetchInterval: live ? false : () => pollInterval(pollId, 3_000),
    retry: false,
  });
}
