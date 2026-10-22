"use client";

import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { factoryV4Abi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import { V2_VESTING_DAYS, type BatchVersion } from "@/lib/launchV2";

/**
 * Days over which a launch's creator share vests: 30 on V2/V3 (fixed), and on V4 the creator's choice read from
 * the factory (30, or 0 for an instant unlock). Null while a V4 launch's setting is still loading.
 */
export function useCreatorVestingDays(factory: Address | null, id: bigint | number | null, version: BatchVersion | 1): number | null {
  const v4 = version === 4 && factory !== null && id !== null;
  const { data } = useReadContract({
    address: factory ?? zeroAddress,
    abi: factoryV4Abi,
    functionName: "creatorVestingDuration",
    args: [BigInt(id ?? 0)],
    chainId: TESTNET.id,
    query: { enabled: v4, staleTime: Infinity },
  });
  if (version !== 4) return V2_VESTING_DAYS;
  return data === undefined ? null : Number(data) / 86_400;
}
