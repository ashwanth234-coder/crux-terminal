"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, getAbiItem, getAddress, http, isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
import { useConnection, useReadContracts } from "wagmi";
import { cruxSettlerAbi, originSettlerAbi } from "@/contracts/abis/erc7683";
import { PREVIOUS_SETTLERS, REFUND_GRACE_SECONDS, SETTLER, SETTLER_DEPLOYED, SETTLER_DEPLOY_BLOCK } from "@/lib/intents";
import { HEAD_LAG } from "@/lib/logs";
import { CROSS_CHAIN_REFUND_GRACE_SECONDS, LIVE_ORIGINS, originByKey, type OriginKey } from "@/lib/crosschain";

const OPEN_EVENT = getAbiItem({ abi: originSettlerAbi, name: "Open" });

// sepolia.base.org caps eth_getLogs at 200 blocks, so scans use RPCs that allow
// wide ranges. publicnode allows 50k blocks per call; Tenderly is the fallback.
const LOG_RPCS = [
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_LOGS_RPC,
  "https://base-sepolia-rpc.publicnode.com",
  "https://base-sepolia.gateway.tenderly.co",
].filter((url): url is string => Boolean(url));
const CHUNK = BigInt(45_000);
const PARALLEL = 4;

const logClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback(LOG_RPCS.map((url) => http(url, { timeout: 20_000 }))),
});

export const ESCROW_STATUS = ["none", "open", "settled", "refunded"] as const;
export type EscrowStatus = (typeof ESCROW_STATUS)[number];

/**
 * From the Open event: the asset the user receives (maxSpent[0].token, a keccak256 CAIP-19 id) with its signed
 * minimum, and the token escrowed (minReceived[0].token, an address). Amounts are decimal strings (cached as JSON).
 */
type OpenedOrder = {
  orderId: Hex;
  txHash: Hex;
  block: string;
  outAsset?: Hex;
  minOut?: string;
  inToken?: Address;
  /** Escrowed on a cross-chain origin (its CruxCrossChainSettler); otherwise on the Base Sepolia settler. */
  origin?: OriginKey;
  /** Opened on an earlier Base Sepolia settler (PREVIOUS_SETTLERS) rather than the active one. */
  settler?: Address;
};
type ScanCache = { scannedTo: string; orders: OpenedOrder[] };
const NONE: OpenedOrder[] = [];

export type MyIntent = OpenedOrder & {
  /** Escrowed input token: test USDC, or a launch token for a sell. */
  token: Address | null;
  /** Escrowed input in that token's base units. */
  amount: bigint | null;
  fillDeadline: number | null;
  /** Unix seconds after which refund() succeeds (fillDeadline + REFUND_GRACE). */
  refundAt: number | null;
  status: EscrowStatus | null;
};

/** Where a wallet's orders are opened: the Base Sepolia settler, and the cross-chain settler on Arbitrum Sepolia. */
type Source = { client: PublicClient; settler: Address; chainId: number; deployBlock: bigint; origin?: OriginKey; previous?: boolean };

const BASE_SOURCE: Source = { client: logClient as PublicClient, settler: SETTLER, chainId: baseSepolia.id, deployBlock: SETTLER_DEPLOY_BLOCK };
/** All origins' orders as one list (memoized by useQueries while the results don't change), and a refetch for all. */
function combineOrigins(results: { data?: OpenedOrder[]; refetch: () => Promise<unknown> }[]) {
  return { orders: results.flatMap((r) => r.data ?? NONE), refetch: () => Promise.all(results.map((r) => r.refetch())) };
}

/** Every live cross-chain origin's settler (lib/crosschain.ts). */
const ORIGIN_SOURCES: Source[] = [
  ...LIVE_ORIGINS.map((o) => ({ client: o.logClient, settler: o.settler, chainId: o.chain.id, deployBlock: o.deployBlock, origin: o.key })),
  // Earlier Base settlers still holding (or having held) this wallet's orders.
  ...PREVIOUS_SETTLERS.map((p) => ({ client: logClient as PublicClient, settler: p.address, chainId: baseSepolia.id, deployBlock: p.deployBlock, previous: true })),
];

function cacheKey(source: Source, user: Address) {
  // v2: orders carry their assets; older caches lack them, so they rescan once.
  return `crux:intents:v2:${source.chainId}:${source.settler.toLowerCase()}:${user.toLowerCase()}`;
}

function readCache(source: Source, user: Address): ScanCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(source, user));
    return raw ? (JSON.parse(raw) as ScanCache) : null;
  } catch {
    return null;
  }
}

function writeCache(source: Source, user: Address, cache: ScanCache) {
  try {
    localStorage.setItem(cacheKey(source, user), JSON.stringify(cache));
  } catch {
    // Private mode or full storage: the next load just rescans.
  }
}

/**
 * Every Open log the settler has emitted for `user`. The order's user sits in
 * unindexed event data, so all Open logs are read and filtered here. Scanned
 * ranges are cached per wallet, so refreshes only read new blocks.
 */
async function scanOpenedOrders(source: Source, user: Address): Promise<OpenedOrder[]> {
  const { client, settler } = source;
  const cached = readCache(source, user);
  const orders = new Map((cached?.orders ?? []).map((o) => [o.orderId, o]));
  // A couple of blocks behind the head, so a lagging pool node never rejects the range (lib/logs.ts).
  const head = (await client.getBlockNumber()) - HEAD_LAG;
  let from = cached ? BigInt(cached.scannedTo) + BigInt(1) : source.deployBlock;

  while (from <= head) {
    const ranges: [bigint, bigint][] = [];
    for (let i = 0; i < PARALLEL && from <= head; i++) {
      const to = from + CHUNK - BigInt(1) < head ? from + CHUNK - BigInt(1) : head;
      ranges.push([from, to]);
      from = to + BigInt(1);
    }
    const batches = await Promise.all(
      ranges.map(([fromBlock, toBlock]) => client.getLogs({ address: settler, event: OPEN_EVENT, fromBlock, toBlock })),
    );
    for (const log of batches.flat()) {
      const { orderId, resolvedOrder } = log.args;
      if (!orderId || !resolvedOrder || !isAddressEqual(resolvedOrder.user, user)) continue;
      const out = resolvedOrder.maxSpent[0];
      const input = resolvedOrder.minReceived[0];
      orders.set(orderId, {
        orderId,
        txHash: log.transactionHash,
        block: log.blockNumber.toString(),
        outAsset: out?.token,
        minOut: out?.amount.toString(),
        inToken: input ? getAddress(`0x${input.token.slice(-40)}`) : undefined,
        ...(source.origin ? { origin: source.origin } : {}),
        ...(source.previous ? { settler: source.settler } : {}),
      });
    }
    writeCache(source, user, { scannedTo: ranges[ranges.length - 1][1].toString(), orders: [...orders.values()] });
  }

  return [...orders.values()].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block)));
}

/**
 * ERC-7683 orders the connected wallet opened on the Base Sepolia settler and on the cross-chain settler on
 * Arbitrum Sepolia, newest first, joined with their live escrow state.
 */
export function useMyIntents() {
  const { address } = useConnection();
  const enabled = SETTLER_DEPLOYED && !!address;

  const opened = useQuery({
    queryKey: ["crux-my-intents", SETTLER, address],
    queryFn: () => scanOpenedOrders(BASE_SOURCE, address as Address),
    enabled,
    refetchInterval: 30_000,
  });
  // Each cross-chain origin is read separately, so one slow RPC never hides Base orders or another chain's.
  const fromOrigins = useQueries({
    queries: ORIGIN_SOURCES.map((source) => ({
      queryKey: ["crux-my-intents", source.settler, source.chainId, address],
      queryFn: () => scanOpenedOrders(source, address as Address),
      enabled,
      refetchInterval: 30_000,
    })),
    combine: combineOrigins,
  });

  const orders = useMemo(() => [...(opened.data ?? NONE), ...fromOrigins.orders], [opened.data, fromOrigins.orders]);
  const escrows = useReadContracts({
    contracts: orders.map((o) => ({
      address: o.origin ? originByKey(o.origin)!.settler : (o.settler ?? SETTLER),
      abi: cruxSettlerAbi,
      functionName: "escrows" as const,
      args: [o.orderId] as const,
      chainId: o.origin ? originByKey(o.origin)!.chain.id : baseSepolia.id,
    })),
    query: { enabled: enabled && orders.length > 0, refetchInterval: 15_000 },
  });

  const intents = useMemo<MyIntent[]>(
    () =>
      orders.map((o, i) => {
        const escrow = escrows.data?.[i]?.result;
        if (!escrow) return { ...o, token: null, amount: null, fillDeadline: null, refundAt: null, status: null };
        const [, token, amount, fillDeadline, status] = escrow;
        return {
          ...o,
          token,
          amount,
          fillDeadline,
          refundAt: fillDeadline + (o.origin ? CROSS_CHAIN_REFUND_GRACE_SECONDS : REFUND_GRACE_SECONDS),
          status: ESCROW_STATUS[status] ?? null,
        };
      })
        // Block numbers aren't comparable across chains; every order's fill deadline is 10 minutes after it opened.
        .sort((a, b) => (b.fillDeadline ?? 0) - (a.fillDeadline ?? 0)),
    [orders, escrows.data],
  );

  return {
    enabled,
    intents,
    isLoading: opened.isLoading || (orders.length > 0 && escrows.isLoading),
    error: opened.error ?? escrows.error,
    refetch: async () => {
      await Promise.all([opened.refetch(), fromOrigins.refetch()]);
      await escrows.refetch();
    },
  };
}
