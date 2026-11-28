"use client";

import { useQuery } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import type { ChartNetwork } from "@/lib/solanaCoins";
import type { KolTrade } from "@/lib/kols";

/**
 * KOLs' buys and sells of one coin (well-known traders and influencers, from GMGN's KOL list, read by Crux's server:
 * crux-solver kols.ts), every 10 s. `on` is false while the server has no KOL source.
 */
export function useKolTrades(network: ChartNetwork | null, token: string | null) {
  const q = useQuery({
    queryKey: ["kol-trades", network, token],
    enabled: network !== null && token !== null,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: () => relay<{ on: boolean; trades: KolTrade[] }>("/v1/kols", { chain: network, coin: token }),
  });
  return { on: q.data?.on === true, trades: q.data?.trades ?? [] };
}
