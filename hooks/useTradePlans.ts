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
 * Whether Ask Crux trade plans are on for this login. The server's health says the feature is running (ASK_CRUX_PLANS=on);
 * then the server says whether this account may use it (ASK_CRUX_PLANS_ALLOWLIST while plans are tested). Logged out,
 * off or unreachable: false, and the card behaves exactly as before.
 */
export function useAskCruxPlans(): boolean {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const running = useQuery({
    queryKey: ["ask-crux-plans"],
    staleTime: 60_000,
    queryFn: async () => ((await (await fetch(`${RELAY_URL}/v1/health`)).json()) as { askCruxPlans?: boolean }).askCruxPlans === true,
  });
  const mine = useQuery({
    queryKey: ["ask-crux-plans-mine", crux.owner],
    enabled: running.data === true && crux.loggedIn,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return false;
      return (await relay<{ on?: boolean }>("/v1/order-groups/enabled", { token })).on === true;
    },
  });
  return running.data === true && crux.loggedIn && mine.data === true;
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

/** Hands a confirmed buy's transaction and its plan to the server, which arms the exits from the real fill. */
export function usePlacePlan() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (plan: TradePlan, entryTx: string, symbol: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      // The server reads what the buy brought in from this transaction itself; the page sends no size.
      return relay<{ group: { id: string } }>("/v1/order-groups/place", { token, plan, entryTx, symbol, owner: crux.owner ?? undefined });
    },
    [getAccessToken, crux.owner],
  );
}
