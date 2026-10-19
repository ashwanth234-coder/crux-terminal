"use client";

import { erc20Abi, zeroAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { cruxFactoryAbi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import type { AuctionState } from "@/lib/launch";

/** Newest launches read per page load; older ones stay reachable by id. */
const MAX_LAUNCHES = 60;

export type LaunchSummary = {
  id: number;
  auction: AuctionState;
  /** Tokens on sale (80% of supply), 18 decimals. */
  saleSupply: bigint | null;
  name: string | null;
  symbol: string | null;
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
    });
  });

  return {
    total,
    launches,
    loading: count.isPending || (ids.length > 0 && auctions.isPending),
    error: count.error ?? auctions.error,
  };
}
