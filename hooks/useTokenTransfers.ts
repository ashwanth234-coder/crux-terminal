"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { logClient, mergeIntoScan, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";
import { watchLogsOf } from "@/lib/stream";
import { loadHistory } from "@/lib/history";
import type { FeedFrame, FeedTransfer } from "@/lib/feed";
import { useFeedJoin } from "@/hooks/useFeed";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const CLAIMED = parseAbiItem("event Claimed(uint256 indexed auctionId, address indexed account, uint256 tokens, uint256 refund)");

export type TokenTransfer = {
  /** "claim" marks an auction Claimed event: the token transfer in the same transaction was paid for at the clearing price. */
  kind: "transfer" | "claim";
  from: Address;
  to: Address;
  value: bigint;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  time: number;
};

const fromFeed = (t: FeedTransfer): TokenTransfer => ({ ...t, value: BigInt(t.value), blockNumber: BigInt(t.blockNumber) });
/** Feed frames that arrived before a token's transfer list was first read (they're added once it is). */
const waiting = new Map<string, FeedFrame[]>();

/**
 * Every Transfer of a launch token since shortly before its auction opened, plus the auction's Claimed events
 * (so a claim can be told apart from a creator vesting release), oldest first, read incrementally like the bids
 * and swaps (lib/logs scanLogs). Enough to rebuild holder balances while the history fits the three-day log window;
 * `truncated` says when it doesn't. Once loaded, new transfers come over the shared feed (no chain reads); while it's
 * down, or for a token it doesn't serve, the page follows the chain itself.
 */
export function useTokenTransfers(token: Address, factory: Address, auctionId: bigint, since: number, enabled: boolean) {
  const queryKey = ["token-transfers", token];
  const pollId = queryKey.join(":");
  const qc = useQueryClient();
  const on = enabled && token !== zeroAddress;
  const live =
    useFeedJoin(on ? token : null, (f) => {
      if (f.transfers.length === 0 && f.removedTransfers.length === 0 && !f.gap) return;
      const scan = qc.getQueryData<LogScan<TokenTransfer>>(queryKey);
      if (!scan) {
        waiting.set(token.toLowerCase(), [...(waiting.get(token.toLowerCase()) ?? []), f]);
        return;
      }
      if (f.gap) void qc.refetchQueries({ queryKey });
      const next = mergeIntoScan(scan, f.transfers.map(fromFeed), f.removedTransfers);
      if (next !== scan) qc.setQueryData(queryKey, next);
    }) === "live";
  // Without the feed: any Transfer of the token refetches at once; the poll is the fallback.
  useEffect(() => {
    if (!on || live) return;
    return watchLogsOf([token], () => void qc.refetchQueries({ queryKey: ["token-transfers", token] }));
  }, [on, live, token, qc]);
  return useQuery({
    // Many thousands of transfers: no deep compare of every one on each poll (lib/logs keeps the array when unchanged).
    structuralSharing: false,
    queryKey,
    queryFn: async ({ client }) => {
      const scan = await tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<TokenTransfer>>(queryKey), since, async (fromBlock, toBlock) => {
          const [logs, claims] = await Promise.all([
            logClient.getLogs({ address: token, event: TRANSFER, fromBlock, toBlock }),
            logClient.getLogs({ address: factory, event: CLAIMED, args: { auctionId }, fromBlock, toBlock }),
          ]);
          const claimItems: Omit<TokenTransfer, "time">[] = claims.map(
            (l) =>
              ({
                kind: "claim",
                from: factory,
                to: (l.args.account ?? zeroAddress) as Address,
                value: l.args.tokens ?? BigInt(0),
                txHash: l.transactionHash,
                blockNumber: l.blockNumber,
                logIndex: l.logIndex,
              }) satisfies Omit<TokenTransfer, "time">,
          );
          const transferItems: Omit<TokenTransfer, "time">[] = logs.map(
            (l) =>
              ({
                kind: "transfer",
                from: (l.args.from ?? zeroAddress) as Address,
                to: (l.args.to ?? zeroAddress) as Address,
                value: l.args.value ?? BigInt(0),
                txHash: l.transactionHash,
                blockNumber: l.blockNumber,
                logIndex: l.logIndex,
              }) satisfies Omit<TokenTransfer, "time">,
          );
          return [...transferItems, ...claimItems];
        }, async () => {
          // The whole history from the relay's indexer, when it has it: holders reach back to the launch.
          const h = await loadHistory(token);
          return h ? { items: h.transfers, scannedTo: h.scannedTo } : null;
        }),
      );
      const held = waiting.get(token.toLowerCase()) ?? [];
      waiting.delete(token.toLowerCase());
      return held.reduce((s, f) => mergeIntoScan(s, f.transfers.map(fromFeed), f.removedTransfers), scan);
    },
    enabled: on,
    refetchInterval: live ? false : () => pollInterval(pollId, 6_000),
    retry: false,
  });
}
