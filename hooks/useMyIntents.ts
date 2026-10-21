"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, fallback, getAbiItem, getAddress, http, isAddressEqual, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { useConnection, useReadContracts } from "wagmi";
import { cruxSettlerAbi, originSettlerAbi } from "@/contracts/abis/erc7683";
import { REFUND_GRACE_SECONDS, SETTLER, SETTLER_DEPLOYED, SETTLER_DEPLOY_BLOCK } from "@/lib/intents";

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
type OpenedOrder = { orderId: Hex; txHash: Hex; block: string; outAsset?: Hex; minOut?: string; inToken?: Address };
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

function cacheKey(user: Address) {
  // v2: orders carry their assets; older caches lack them, so they rescan once.
  return `crux:intents:v2:84532:${SETTLER.toLowerCase()}:${user.toLowerCase()}`;
}

function readCache(user: Address): ScanCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(user));
    return raw ? (JSON.parse(raw) as ScanCache) : null;
  } catch {
    return null;
  }
}

function writeCache(user: Address, cache: ScanCache) {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify(cache));
  } catch {
    // Private mode or full storage: the next load just rescans.
  }
}

/**
 * Every Open log the settler has emitted for `user`. The order's user sits in
 * unindexed event data, so all Open logs are read and filtered here. Scanned
 * ranges are cached per wallet, so refreshes only read new blocks.
 */
async function scanOpenedOrders(user: Address): Promise<OpenedOrder[]> {
  const cached = readCache(user);
  const orders = new Map((cached?.orders ?? []).map((o) => [o.orderId, o]));
  const head = await logClient.getBlockNumber();
  let from = cached ? BigInt(cached.scannedTo) + BigInt(1) : SETTLER_DEPLOY_BLOCK;

  while (from <= head) {
    const ranges: [bigint, bigint][] = [];
    for (let i = 0; i < PARALLEL && from <= head; i++) {
      const to = from + CHUNK - BigInt(1) < head ? from + CHUNK - BigInt(1) : head;
      ranges.push([from, to]);
      from = to + BigInt(1);
    }
    const batches = await Promise.all(
      ranges.map(([fromBlock, toBlock]) => logClient.getLogs({ address: SETTLER, event: OPEN_EVENT, fromBlock, toBlock })),
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
      });
    }
    writeCache(user, { scannedTo: ranges[ranges.length - 1][1].toString(), orders: [...orders.values()] });
  }

  return [...orders.values()].sort((a, b) => Number(BigInt(b.block) - BigInt(a.block)));
}

/**
 * ERC-7683 orders the connected wallet opened on the Base Sepolia settler,
 * newest first, joined with their live escrow state.
 */
export function useMyIntents() {
  const { address } = useConnection();
  const enabled = SETTLER_DEPLOYED && !!address;

  const opened = useQuery({
    queryKey: ["crux-my-intents", SETTLER, address],
    queryFn: () => scanOpenedOrders(address as Address),
    enabled,
    refetchInterval: 30_000,
  });

  const orders = opened.data ?? NONE;
  const escrows = useReadContracts({
    contracts: orders.map((o) => ({
      address: SETTLER,
      abi: cruxSettlerAbi,
      functionName: "escrows" as const,
      args: [o.orderId] as const,
      chainId: baseSepolia.id,
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
          refundAt: fillDeadline + REFUND_GRACE_SECONDS,
          status: ESCROW_STATUS[status] ?? null,
        };
      }),
    [orders, escrows.data],
  );

  return {
    enabled,
    intents,
    isLoading: opened.isLoading || (orders.length > 0 && escrows.isLoading),
    error: opened.error ?? escrows.error,
    refetch: async () => {
      await opened.refetch();
      await escrows.refetch();
    },
  };
}
