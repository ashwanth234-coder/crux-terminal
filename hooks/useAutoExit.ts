"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";

type Watching = { mint: string; creator: string; since: number };
type Exit = { mint: string; at: number; signature: string | null; reason: string };

/**
 * Auto-exit on dev sell for one Solana coin (crux-solver solautoexit.ts): when on, Crux watches the coin's creator and
 * sells the trader's whole position the moment the creator sells, with no page open.
 */
export function useAutoExit(mint: string) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["crux-autoexits", crux.owner],
    enabled: crux.loggedIn && crux.owner !== null,
    refetchInterval: 20_000,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { watching: [] as Watching[], exits: [] as Exit[] };
      return relay<{ watching: Watching[]; exits: Exit[] }>("/v1/solana/autoexits", { token });
    },
  });
  const on = list.data?.watching.some((w) => w.mint === mint) ?? false;
  const lastExit = [...(list.data?.exits ?? [])].reverse().find((x) => x.mint === mint) ?? null;

  const set = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      await relay("/v1/solana/autoexit", { token, mint, on: next });
      await list.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { on, busy, error, lastExit, set };
}
