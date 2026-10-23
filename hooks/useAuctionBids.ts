"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address, type Hex } from "viem";
import type { AuctionV2 } from "@/lib/launchV2";
import { logClient, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";

/** Same signature on CruxFactoryV2 and V3. On V3, maxPrice is the bid's tick price, the limit the contract uses. */
const BID_PLACED = parseAbiItem(
  "event BidPlaced(uint256 indexed auctionId, address indexed account, uint256 quoteAdded, uint256 totalQuote, uint256 maxPrice)",
);

export type BidEvent = {
  account: Address;
  quoteAdded: bigint;
  totalQuote: bigint;
  maxPrice: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  /** Unix seconds, from the block number (Base blocks are exactly 2s apart). */
  time: number;
};

/** Each wallet's latest bid: its total deposit and the limit the whole bid now carries. */
export type BookEntry = { account: Address; quote: bigint; maxPrice: bigint };

export type AuctionBids = {
  events: BidEvent[];
  book: BookEntry[];
  /** True when the auction is older than the fetched window, so early bids may be missing. */
  truncated: boolean;
};

function toBids(scan: LogScan<BidEvent>): AuctionBids {
  // A top-up replaces the wallet's limit and reports its new total, so the latest event per wallet is its bid.
  const latest = new Map<string, BookEntry>();
  for (const e of scan.items) latest.set(e.account.toLowerCase(), { account: e.account, quote: e.totalQuote, maxPrice: e.maxPrice });
  return { events: scan.items, book: [...latest.values()], truncated: scan.truncated };
}

/** Every bid in one auction, read from BidPlaced logs; polls only new blocks while deposits are open. */
export function useAuctionBids(factory: Address, auction: AuctionV2, id: bigint, live: boolean) {
  const queryKey = ["auction-bids", factory, id.toString()];
  const pollId = queryKey.join(":");
  const query = useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<BidEvent>>(queryKey), auction.startTime, async (fromBlock, toBlock) => {
          const logs = await logClient.getLogs({ address: factory, event: BID_PLACED, args: { auctionId: id }, fromBlock, toBlock });
          return logs.map((l) => ({
            account: l.args.account!,
            quoteAdded: l.args.quoteAdded!,
            totalQuote: l.args.totalQuote!,
            maxPrice: l.args.maxPrice!,
            blockNumber: l.blockNumber,
            logIndex: l.logIndex,
            txHash: l.transactionHash,
          }));
        }),
      ),
    select: toBids,
    refetchInterval: () => pollInterval(pollId, live ? 6_000 : false),
    staleTime: live ? 0 : 60_000,
    // viem already retries and falls back between RPCs within one read; a failed poll waits for the backoff.
    retry: false,
  });

  // A new bidder or a status change (deposits closing) means new logs: read the new blocks now, not at the next tick.
  // Every component on the page runs this; cancelRefetch: false folds them into one read.
  const { refetch } = query;
  const seen = useRef(`${auction.status}:${auction.bidderCount}`);
  useEffect(() => {
    const now = `${auction.status}:${auction.bidderCount}`;
    if (seen.current === now) return;
    seen.current = now;
    void refetch({ cancelRefetch: false });
  }, [auction.status, auction.bidderCount, refetch]);

  return query;
}
