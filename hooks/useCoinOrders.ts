"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { relay } from "@/hooks/useSolanaTrading";
import { useCruxAccount } from "@/hooks/useCruxAccount";

export type CoinOrderKind = "dip" | "takeProfit" | "stopLoss" | "trailing";
export type CoinOrderView = {
  id: string;
  chain: "solana" | "bsc" | "base";
  coin: string;
  symbol: string;
  kind: CoinOrderKind;
  amount: string;
  trigger?: number;
  trailPct?: number;
  peak?: number;
  group?: string;
  createdAt: number;
  status: "open" | "firing" | "filled" | "failed" | "cancelled" | "expired";
  firedPrice?: number;
  tx?: string;
  error?: string;
};

export type PlaceCoinOrder = {
  chain: "solana" | "bsc" | "base";
  coin: string;
  symbol: string;
  kind: CoinOrderKind;
  /** Buy: cash in the chain's units; sell: coins in base units, or "all". */
  amount: string;
  trigger?: number;
  trailPct?: number;
  slippageBps: number;
  group?: string;
};

/**
 * Limit orders on Solana and BNB Chain coins (crux-solver coinorders.ts): Crux watches the price and trades from the
 * login's wallet when one triggers, with the page closed. The login's orders, refreshed every 5 s, plus place / cancel.
 */
export function useCoinOrders() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const qc = useQueryClient();
  const token = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Log in first.");
    return t;
  }, [getAccessToken]);

  const list = useQuery({
    queryKey: ["coin-orders", crux.owner],
    enabled: crux.loggedIn,
    refetchInterval: 5_000,
    queryFn: async () => (await relay<{ orders: CoinOrderView[] }>("/v1/coin-orders/list", { token: await token() })).orders,
  });

  const place = useCallback(
    async (orders: PlaceCoinOrder[]) => {
      const t = await token();
      for (const o of orders) await relay("/v1/coin-orders/place", { token: t, owner: crux.owner ?? undefined, ...o });
      await qc.invalidateQueries({ queryKey: ["coin-orders"] });
    },
    [token, crux.owner, qc],
  );

  const cancel = useCallback(
    async (ids: string[]) => {
      await relay("/v1/coin-orders/cancel", { token: await token(), ids });
      await qc.invalidateQueries({ queryKey: ["coin-orders"] });
    },
    [token, qc],
  );

  return { orders: list.data ?? null, place, cancel };
}
