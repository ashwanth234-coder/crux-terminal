"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, http, parseAbiItem, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import type { AuctionV2 } from "@/lib/launchV2";

// sepolia.base.org caps eth_getLogs at 200 blocks; publicnode allows 50k per call, Tenderly is the fallback.
const LOGS_RPCS = [process.env.NEXT_PUBLIC_BASE_SEPOLIA_LOGS_RPC, "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.gateway.tenderly.co"].filter(
  (u): u is string => Boolean(u),
);
const logClient = createPublicClient({ chain: baseSepolia, transport: fallback(LOGS_RPCS.map((u) => http(u, { timeout: 15_000 }))) });

/** Same signature on CruxFactoryV2 and V3. On V3, maxPrice is the bid's tick price, the limit the contract uses. */
const BID_PLACED = parseAbiItem(
  "event BidPlaced(uint256 indexed auctionId, address indexed account, uint256 quoteAdded, uint256 totalQuote, uint256 maxPrice)",
);

const BLOCK_SECONDS = 2; // Base Sepolia
const CHUNK = BigInt(45_000);
/** About six days of blocks; older history isn't fetched (and the page says so). */
const MAX_CHUNKS = 6;

export type BidEvent = {
  account: Address;
  quoteAdded: bigint;
  totalQuote: bigint;
  maxPrice: bigint;
  blockNumber: bigint;
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

async function fetchBids(factory: Address, id: bigint, startTime: number): Promise<AuctionBids> {
  const head = await logClient.getBlock();
  const elapsed = Math.max(0, Number(head.timestamp) - startTime);
  // No bid can land before startTime: begin a little earlier than that block.
  const wanted = head.number - BigInt(Math.ceil(elapsed / BLOCK_SECONDS) + 300);
  const floorBlock = head.number - CHUNK * BigInt(MAX_CHUNKS);
  const from = wanted > floorBlock ? wanted : floorBlock;
  const truncated = wanted < floorBlock;

  const ranges: [bigint, bigint][] = [];
  for (let start = from < BigInt(0) ? BigInt(0) : from; start <= head.number; start += CHUNK) {
    const end = start + CHUNK - BigInt(1);
    ranges.push([start, end > head.number ? head.number : end]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) => logClient.getLogs({ address: factory, event: BID_PLACED, args: { auctionId: id }, fromBlock, toBlock })),
  );

  const events: BidEvent[] = chunks
    .flat()
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
    .map((l) => ({
      account: l.args.account!,
      quoteAdded: l.args.quoteAdded!,
      totalQuote: l.args.totalQuote!,
      maxPrice: l.args.maxPrice!,
      blockNumber: l.blockNumber,
      txHash: l.transactionHash,
      time: Number(head.timestamp) - Number(head.number - l.blockNumber) * BLOCK_SECONDS,
    }));

  // A top-up replaces the wallet's limit and reports its new total, so the latest event per wallet is its bid.
  const latest = new Map<string, BookEntry>();
  for (const e of events) latest.set(e.account.toLowerCase(), { account: e.account, quote: e.totalQuote, maxPrice: e.maxPrice });
  return { events, book: [...latest.values()], truncated };
}

/** Every bid in one auction, read from BidPlaced logs; polls while deposits are open. */
export function useAuctionBids(factory: Address, auction: AuctionV2, id: bigint, live: boolean) {
  return useQuery({
    queryKey: ["auction-bids", factory, id.toString(), auction.status, auction.bidderCount],
    queryFn: () => fetchBids(factory, id, auction.startTime),
    refetchInterval: live ? 6_000 : false,
    staleTime: live ? 0 : 60_000,
  });
}
