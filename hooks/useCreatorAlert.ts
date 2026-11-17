"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";
import { enablePush, pushOn } from "@/lib/alertSync";

type Watching = { mint: string; creator: string; since: number };
export type CreatorEvent = { mint: string; symbol: string; at: number; soldPct: number; all: boolean };

/**
 * "Notify me when the creator sells" for one Solana coin (crux-solver solcreatoralert.ts): Crux watches the coin's
 * creator and tells the trader (a push notification, and on this page) each time they sell 20% or more. Crux never
 * trades on it: the decision stays the trader's.
 */
export function useCreatorAlert(mint: string) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["crux-creator-alerts", crux.owner],
    enabled: crux.loggedIn && crux.owner !== null,
    refetchInterval: 15_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { watching: [] as Watching[], events: [] as CreatorEvent[] };
      return relay<{ watching: Watching[]; events: CreatorEvent[] }>("/v1/solana/creator-alerts", { token });
    },
  });
  const on = list.data?.watching.some((w) => w.mint === mint) ?? false;
  const events = (list.data?.events ?? []).filter((e) => e.mint === mint).reverse();

  const set = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const token = await getAccessToken();
      if (!token || !crux.owner) throw new Error("Log in first.");
      await relay("/v1/solana/creator-alert", { token, mint, owner: crux.owner, on: next });
      await list.refetch();
      // Alerts reach a closed page by push: switch it on for this device, once (the browser asks first).
      if (next && !pushOn() && crux.sign) {
        await enablePush(crux.sign, crux.owner).catch((e: Error) => setNote(`You'll see it here while this page is open. ${e.message}`));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { on, busy, error, note, events, set };
}
