"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { entryPrice, type Position, type PositionChain } from "@/lib/pnl";

/**
 * What the login paid for the coins it holds (crux-solver positions.ts: every confirmed trade from the one balance), for
 * entry prices and profit / loss. Refreshed every 15 s and right after a trade (refreshBalances).
 */
export function usePositions() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const q = useQuery({
    queryKey: ["crux-positions", crux.owner],
    enabled: crux.loggedIn,
    refetchInterval: 15_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return [];
      return (await relay<{ positions: Position[] }>("/v1/positions", { token })).positions;
    },
  });
  const list = q.data ?? [];
  return {
    positions: list,
    /** A coin's average entry price in dollars per whole coin, or undefined when Crux has no record of buying it. */
    entryOf(chain: PositionChain, coin: string, decimals: number): number | undefined {
      const p = list.find((x) => x.chain === chain && (chain === "solana" ? x.coin === coin : x.coin.toLowerCase() === coin.toLowerCase()));
      return p ? entryPrice(p, decimals) : undefined;
    },
  };
}
