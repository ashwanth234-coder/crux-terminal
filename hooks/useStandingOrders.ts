"use client";

import { useQuery } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { listStanding, type StandingView } from "@/lib/standing";

/**
 * The logged-in trader's standing orders (take profit, stop loss, trailing stop, dip buys), read from the keeper with a
 * silent signed request every 30 seconds. Shared by the order ticket and the chart's order lines.
 */
export function useStandingOrders(): { orders: StandingView[] | null; refresh: () => void; ready: boolean } {
  const crux = useCruxAccount();
  const ready = crux.loggedIn && crux.v2 && crux.sign !== null && crux.owner !== null && crux.account !== null;
  const q = useQuery({
    queryKey: ["standing-orders", crux.owner, crux.account],
    queryFn: () => listStanding(crux.sign!, crux.owner!, crux.account!),
    enabled: ready,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
  return { orders: q.data ?? null, refresh: () => void q.refetch(), ready };
}
