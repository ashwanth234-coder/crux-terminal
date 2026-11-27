"use client";

import { useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";
import { enablePush, pushOn } from "@/lib/alertSync";
import { savedIndex, type SavedWallet, type WalletChain, type WalletEvent } from "@/lib/savedWallets";

type Answer = { wallets: SavedWallet[]; events: WalletEvent[] };
const EMPTY: Answer = { wallets: [], events: [] };

/**
 * The trader's saved wallets, kept on their Crux login (crux-solver savedwallets.ts), on every page that shows traders.
 * Logged out, there are none and saving asks to log in.
 */
export function useSavedWallets() {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const qc = useQueryClient();
  const key = ["crux-saved-wallets", crux.owner];
  const q = useQuery({
    queryKey: key,
    enabled: crux.loggedIn && crux.owner !== null,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const token = await getAccessToken();
      return token ? relay<Answer>("/v1/wallets/list", { token }) : EMPTY;
    },
  });
  const wallets = useMemo(() => q.data?.wallets ?? [], [q.data]);
  const index = useMemo(() => savedIndex(wallets), [wallets]);

  async function call(path: string, body: Record<string, unknown>) {
    const token = await getAccessToken();
    if (!token) throw new Error("Log in to save wallets.");
    const r = await relay<Answer>(path, { token, ...body });
    qc.setQueryData(key, r);
    return r;
  }

  /** Saves (or updates) a wallet; turning "Notify me" on also switches this device's notifications on, once. Returns a note when the device can't get them. */
  async function save(w: { chain: WalletChain; address: string; name: string; chart: boolean; notify: boolean }): Promise<string | null> {
    if (!crux.loggedIn || !crux.owner) throw new Error("Log in to save wallets.");
    await call("/v1/wallets/save", { owner: crux.owner, wallet: w });
    if (w.notify && !pushOn() && crux.sign) {
      try {
        await enablePush(crux.sign, crux.owner);
      } catch (e) {
        return `Saved. Alerts couldn't be switched on for this device: ${(e as Error).message}`;
      }
    }
    return null;
  }
  const remove = (chain: WalletChain, address: string) => call("/v1/wallets/remove", { chain, address });

  return { loggedIn: crux.loggedIn, login: crux.login, wallets, events: q.data?.events ?? [], index, loading: q.isLoading, save, remove };
}
