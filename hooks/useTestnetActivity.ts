"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, formatUnits, getAbiItem, http, parseAbiItem, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { cruxFactoryAbi } from "@/contracts/abis/batchAuction";
import { originSettlerAbi } from "@/contracts/abis/erc7683";
import { FACTORY, SETTLER, SETTLER_DEPLOYED, SETTLER_DEPLOY_BLOCK } from "@/lib/intents";

// sepolia.base.org caps eth_getLogs at 200 blocks; these allow wide ranges.
const client = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    http("https://base-sepolia-rpc.publicnode.com", { timeout: 15_000 }),
    http("https://base-sepolia.gateway.tenderly.co", { timeout: 15_000 }),
  ]),
});

/** About a day of Base Sepolia blocks (2s each), inside publicnode's 50k-block window. */
const LOOKBACK = BigInt(43_000);
const MAX_ITEMS = 5;

// Settler events beyond the ERC-7683 interface (crux-contracts/src/CruxSettler.sol).
const ORDER_SETTLED = parseAbiItem("event OrderSettled(bytes32 indexed orderId, address indexed filler, uint256 amount)");
const ORDER_REFUNDED = parseAbiItem("event OrderRefunded(bytes32 indexed orderId, address indexed user, uint256 amount)");
const OPEN = getAbiItem({ abi: originSettlerAbi, name: "Open" });
const AUCTION_CREATED = getAbiItem({ abi: cruxFactoryAbi, name: "AuctionCreated" });
const DEPOSITED = getAbiItem({ abi: cruxFactoryAbi, name: "Deposited" });
const AUCTION_SETTLED = getAbiItem({ abi: cruxFactoryAbi, name: "AuctionSettled" });

export type ActivityKind = "intent-opened" | "intent-filled" | "intent-refunded" | "launch-created" | "launch-deposit" | "launch-settled";

export type Activity = {
  key: string;
  kind: ActivityKind;
  tx: Hex;
  block: bigint;
  /** Unix seconds; null until the block header is read. */
  time: number | null;
  /** USDC moved, when the event carries an amount. */
  usdc: string | null;
  /** Wallet involved (user, solver or creator). */
  account: Address | null;
  auctionId: number | null;
};

const usdc = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function readActivity(): Promise<Activity[]> {
  const head = await client.getBlockNumber();
  const fromBlock = head - LOOKBACK > SETTLER_DEPLOY_BLOCK ? head - LOOKBACK : SETTLER_DEPLOY_BLOCK;

  const [settlerLogs, factoryLogs] = await Promise.all([
    client.getLogs({ address: SETTLER, events: [OPEN, ORDER_SETTLED, ORDER_REFUNDED], fromBlock, toBlock: head }),
    FACTORY
      ? client.getLogs({ address: FACTORY, events: [AUCTION_CREATED, DEPOSITED, AUCTION_SETTLED], fromBlock, toBlock: head })
      : Promise.resolve([]),
  ]);

  const items: Activity[] = [];
  const base = (log: { transactionHash: Hex; blockNumber: bigint; logIndex: number }) => ({
    key: `${log.transactionHash}-${log.logIndex}`,
    tx: log.transactionHash,
    block: log.blockNumber,
    time: null,
  });

  for (const log of settlerLogs) {
    if (log.eventName === "Open") {
      const r = log.args.resolvedOrder;
      items.push({ ...base(log), kind: "intent-opened", usdc: r?.minReceived[0] ? usdc(r.minReceived[0].amount) : null, account: r?.user ?? null, auctionId: null });
    } else if (log.eventName === "OrderSettled") {
      items.push({ ...base(log), kind: "intent-filled", usdc: usdc(log.args.amount ?? BigInt(0)), account: log.args.filler ?? null, auctionId: null });
    } else if (log.eventName === "OrderRefunded") {
      items.push({ ...base(log), kind: "intent-refunded", usdc: usdc(log.args.amount ?? BigInt(0)), account: log.args.user ?? null, auctionId: null });
    }
  }
  for (const log of factoryLogs) {
    const id = log.args.auctionId !== undefined ? Number(log.args.auctionId) : null;
    if (log.eventName === "AuctionCreated") {
      items.push({ ...base(log), kind: "launch-created", usdc: usdc(log.args.graduationTarget ?? BigInt(0)), account: log.args.creator ?? null, auctionId: id });
    } else if (log.eventName === "Deposited") {
      items.push({ ...base(log), kind: "launch-deposit", usdc: usdc(log.args.amount ?? BigInt(0)), account: log.args.account ?? null, auctionId: id });
    } else if (log.eventName === "AuctionSettled") {
      items.push({ ...base(log), kind: "launch-settled", usdc: null, account: null, auctionId: id });
    }
  }

  // Newest first; within one transaction, the later log first.
  items.sort((a, b) => (a.block === b.block ? (a.key < b.key ? 1 : -1) : a.block < b.block ? 1 : -1));
  const recent = items.slice(0, MAX_ITEMS);

  const blocks = [...new Set(recent.map((i) => i.block))];
  const headers = await Promise.all(blocks.map((blockNumber) => client.getBlock({ blockNumber }).catch(() => null)));
  const times = new Map(blocks.map((b, i) => [b, headers[i] ? Number(headers[i]!.timestamp) : null]));
  return recent.map((i) => ({ ...i, time: times.get(i.block) ?? null }));
}

/** The newest real events from the Crux contracts on Base Sepolia (last ~24h). */
export function useTestnetActivity() {
  const query = useQuery({
    queryKey: ["crux-testnet-activity", SETTLER, FACTORY],
    queryFn: readActivity,
    enabled: SETTLER_DEPLOYED,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  return {
    configured: SETTLER_DEPLOYED,
    items: query.data ?? [],
    loading: query.isPending && SETTLER_DEPLOYED,
    error: query.error !== null,
  };
}
