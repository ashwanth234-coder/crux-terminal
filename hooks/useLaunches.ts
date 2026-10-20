"use client";

import { erc20Abi, zeroAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { cruxBatchFactoryAbi, cruxFactoryAbi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import type { AuctionState } from "@/lib/launch";
import { V2_SPLIT, toAuctionV2, type AuctionV2, type BatchVersion } from "@/lib/launchV2";

/** Newest launches read per page load; older ones stay reachable by id. */
const MAX_LAUNCHES = 60;

export type LaunchSummary = {
  id: number;
  auction: AuctionState;
  /** Tokens on sale (80% of supply), 18 decimals. */
  saleSupply: bigint | null;
  name: string | null;
  symbol: string | null;
  version: 1 | BatchVersion;
  /** Where the auction page lives: /launch/[id] (V1), /launch/v2/[id] or /launch/v3/[id]. */
  href: string;
  /** The V2/V3 auction as the contract returns it (same struct on both); null on V1. */
  v2: AuctionV2 | null;
};

/** Every auction on the deployed CruxFactory (Base Sepolia), newest first. */
export function useLaunches(factory: Address | null) {
  const fac = { address: factory ?? zeroAddress, abi: cruxFactoryAbi, chainId: TESTNET.id } as const;

  const count = useReadContract({
    ...fac,
    functionName: "auctionCount",
    query: { enabled: factory !== null, refetchInterval: 15_000 },
  });
  const total = Number(count.data ?? BigInt(0));
  // Auction ids are array indexes on the factory: 0 … count-1.
  const ids = Array.from({ length: Math.min(total, MAX_LAUNCHES) }, (_, i) => total - 1 - i);

  const auctions = useReadContracts({
    contracts: ids.map((id) => ({ ...fac, functionName: "getAuction" as const, args: [BigInt(id)] as const })),
    query: { enabled: ids.length > 0, refetchInterval: 8_000 },
  });
  const supplies = useReadContracts({
    contracts: ids.map((id) => ({ ...fac, functionName: "saleSupply" as const, args: [BigInt(id)] as const })),
    query: { enabled: ids.length > 0, staleTime: Infinity },
  });

  const tokens = ids.map((_, i) => auctions.data?.[i]?.result?.token ?? zeroAddress);
  const meta = useReadContracts({
    contracts: tokens.flatMap((address) => [
      { address, abi: erc20Abi, chainId: TESTNET.id, functionName: "name" as const },
      { address, abi: erc20Abi, chainId: TESTNET.id, functionName: "symbol" as const },
    ]),
    query: { enabled: tokens.length > 0 && tokens.every((t) => t !== zeroAddress), staleTime: Infinity },
  });

  const launches: LaunchSummary[] = [];
  ids.forEach((id, i) => {
    const raw = auctions.data?.[i]?.result;
    if (!raw) return;
    const name = meta.data?.[i * 2]?.result;
    const symbol = meta.data?.[i * 2 + 1]?.result;
    launches.push({
      id,
      auction: {
        token: raw.token,
        creator: raw.creator,
        startTime: Number(raw.startTime),
        batchWindow: raw.batchWindow,
        graduationTarget: raw.graduationTarget,
        totalDeposits: raw.totalDeposits,
        clearingPrice: raw.clearingPrice,
        status: raw.status,
      },
      saleSupply: supplies.data?.[i]?.result ?? null,
      name: typeof name === "string" ? name : null,
      symbol: typeof symbol === "string" ? symbol : null,
      version: 1,
      href: `/launch/${id}`,
      v2: null,
    });
  });

  return {
    total,
    launches,
    loading: count.isPending || (ids.length > 0 && auctions.isPending),
    error: count.error ?? auctions.error,
  };
}

/** Every auction on a batch factory (V2 or V3), newest first, in the same summary shape as V1. */
export function useLaunchesV2(factory: Address | null, version: BatchVersion = 2) {
  const fac = { address: factory ?? zeroAddress, abi: cruxBatchFactoryAbi, chainId: TESTNET.id } as const;
  const count = useReadContract({ ...fac, functionName: "auctionCount", query: { enabled: factory !== null, refetchInterval: 15_000 } });
  const total = Number(count.data ?? BigInt(0));
  const ids = Array.from({ length: Math.min(total, MAX_LAUNCHES) }, (_, i) => total - 1 - i);

  const auctions = useReadContracts({
    contracts: ids.map((id) => ({ ...fac, functionName: "getAuction" as const, args: [BigInt(id)] as const })),
    query: { enabled: ids.length > 0, refetchInterval: 8_000 },
  });
  const tokens = ids.map((_, i) => auctions.data?.[i]?.result?.token ?? zeroAddress);
  const meta = useReadContracts({
    contracts: tokens.flatMap((address) => [
      { address, abi: erc20Abi, chainId: TESTNET.id, functionName: "name" as const },
      { address, abi: erc20Abi, chainId: TESTNET.id, functionName: "symbol" as const },
    ]),
    query: { enabled: tokens.length > 0 && tokens.every((t) => t !== zeroAddress), staleTime: Infinity },
  });

  const launches: LaunchSummary[] = [];
  ids.forEach((id, i) => {
    const raw = auctions.data?.[i]?.result;
    if (!raw) return;
    const v2 = toAuctionV2(raw);
    const name = meta.data?.[i * 2]?.result;
    const symbol = meta.data?.[i * 2 + 1]?.result;
    launches.push({
      id,
      // V1-shaped view for shared UI; V2 status 1/2 map onto V1's Graduated (2) / Cancelled (3).
      auction: {
        token: v2.token,
        creator: v2.creator,
        startTime: v2.startTime,
        batchWindow: v2.batchWindow,
        graduationTarget: v2.graduationTarget,
        totalDeposits: v2.totalDeposits,
        clearingPrice: v2.clearingPrice,
        status: v2.status === 1 ? 2 : v2.status === 2 ? 3 : 0,
      },
      saleSupply: (v2.totalSupply * BigInt(V2_SPLIT.saleBps)) / BigInt(10_000),
      name: typeof name === "string" ? name : null,
      symbol: typeof symbol === "string" ? symbol : null,
      version,
      href: `/launch/v${version}/${id}`,
      v2,
    });
  });

  return { total, launches, loading: count.isPending || (ids.length > 0 && auctions.isPending), error: count.error ?? auctions.error };
}

/** Newest factory first: V3, then V2, then V1. */
export function useAllLaunches(v1: Address | null, v2: Address | null, v3: Address | null = null) {
  const c = useLaunchesV2(v3, 3);
  const a = useLaunchesV2(v2, 2);
  const b = useLaunches(v1);
  const launches = [...c.launches, ...a.launches, ...b.launches];
  return {
    total: c.total + a.total + b.total,
    launches,
    // Show whatever has loaded; only wait while there is nothing to show yet.
    loading: launches.length === 0 && ((v3 !== null && c.loading) || (v2 !== null && a.loading) || (v1 !== null && b.loading)),
    // One factory being unreachable must not hide the others' launches.
    error: launches.length > 0 ? null : (c.error ?? a.error ?? b.error),
  };
}
