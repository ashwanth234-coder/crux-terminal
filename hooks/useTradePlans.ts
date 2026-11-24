"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";
import { RELAY_URL } from "@/lib/session";
import type { PlanChain, TradePlan } from "@/lib/tradePlan";

export type DeskLine = { level: "green" | "amber" | "red"; text: string };
export type DeskCheck = { level: "green" | "amber" | "red"; lines: DeskLine[]; blockers: string[]; suggestedUsd?: number; route: string; roundTripPct?: number };

/**
 * Whether Ask Crux trade plans are on: the server says so in its health (ASK_CRUX_PLANS=on there), so the one switch
 * lives on the server. Off (or unreachable): the card behaves exactly as before.
 */
export function useAskCruxPlans(): boolean {
  const q = useQuery({
    queryKey: ["ask-crux-plans"],
    staleTime: 60_000,
    queryFn: async () => ((await (await fetch(`${RELAY_URL}/v1/health`)).json()) as { askCruxPlans?: boolean }).askCruxPlans === true,
  });
  return q.data === true;
}

/**
 * The Desk Check for one buy (crux-solver deskcheck.ts): read by the server, all at once, while the card is open. It
 * never holds up the buy itself, which stays prepared on the usual fast path.
 */
export function useDeskCheck(chain: PlanChain | null, coin: string | null, usd: number, enabled: boolean) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  return useQuery({
    queryKey: ["desk-check", chain, coin, usd],
    enabled: enabled && crux.loggedIn && chain !== null && coin !== null && usd > 0,
    staleTime: 15_000,
    retry: 1,
    queryFn: async (): Promise<DeskCheck> => {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      return relay<DeskCheck>("/v1/desk-check", { token, chain, coin, usd });
    },
  });
}

/** Hands a confirmed buy and its plan to the server, which arms the exits from the real fill. */
export function usePlacePlan() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (plan: TradePlan, entry: { tx: string; units: bigint }, symbol: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      return relay<{ group: { id: string } }>("/v1/order-groups/place", { token, plan, entryTx: entry.tx, entryUnits: entry.units.toString(), symbol, owner: crux.owner ?? undefined });
    },
    [getAccessToken, crux.owner],
  );
}
