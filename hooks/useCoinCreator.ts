"use client";

import { useQuery } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import type { ChartNetwork } from "@/lib/solanaCoins";

/**
 * Who made a coin on another chain (Crux's free /v1/creator look-up: Jupiter on Solana, GoPlus on BNB Chain and Base,
 * Crux's own records for its V4 launches), for the chart's DB / DS badges. Null when it isn't known; kept 10 minutes.
 */
export function useCoinCreator(network: ChartNetwork | null, coin: string | null): string | null {
  const q = useQuery({
    queryKey: ["coin-creator", network, coin],
    enabled: !!network && !!coin,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => (await relay<{ creator: string | null }>("/v1/creator", { chain: network === "bsc" ? "bnb" : network, address: coin })).creator,
  });
  return q.data ?? null;
}
