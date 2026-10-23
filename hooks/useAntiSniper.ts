"use client";

import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { factoryV6Abi } from "@/contracts/abis/batchAuction";
import { TESTNET } from "@/lib/chains";
import type { BatchVersion } from "@/lib/launchV2";

/** V5's fixed batch-only window after graduation. */
const V5_PROTECTION_SECONDS = 24 * 3600;

/**
 * Seconds of batch-only trading a launch gets after graduation: 0 for V2–V4 (they open on Uniswap at graduation),
 * 24 hours on V5, and on V6 the creator's choice read from the factory (one 60-second batch by default, 0 when they
 * turned anti-sniper off). Null while a V6 launch's setting is still loading.
 */
export function useAntiSniperSeconds(factory: Address | null, id: bigint | number | null, version: BatchVersion | 1): number | null {
  const v6 = version >= 6 && factory !== null && id !== null;
  const { data } = useReadContract({
    address: factory ?? zeroAddress,
    abi: factoryV6Abi,
    functionName: "batchProtection",
    args: [BigInt(id ?? 0)],
    chainId: TESTNET.id,
    query: { enabled: v6, staleTime: Infinity },
  });
  if (version === 5) return V5_PROTECTION_SECONDS;
  if (version < 5) return 0;
  return data === undefined ? null : Number(data);
}
