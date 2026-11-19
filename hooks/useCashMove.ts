"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { relay, useOneBalance } from "@/hooks/useSolanaTrading";
import { IS_TESTNET } from "@/lib/network";
import { RELAY_URL } from "@/lib/session";

export type CashChain = "base" | "bnb" | "solana";
const NAMES: Record<CashChain, string> = { base: "Base", bnb: "BNB Chain", solana: "Solana" };
/** Relay keeps up to ~0.7% plus a few cents on these sizes: a move carries this much extra so the buy fits. */
const headroom = (usd6: bigint) => (usd6 * BigInt(150)) / BigInt(10_000) + BigInt(100_000);
const MIN_MOVE = BigInt(1_000_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One balance, trading at each chain's own speed (Option A, Base mainnet): cash sits in the login's own wallets on
 * Base, BNB Chain and Solana, and moves between them through Relay (~1 s once the deposit lands, $0.02–0.08).
 *   - ensure(chain, usd6): before a buy, tops that chain's cash up from the chain holding the most, and waits for it.
 *   - premove(chain, usd6): the same, quietly, as soon as a coin page opens, so the buy itself is instant.
 * Off on Base Sepolia and until the relay says moves are on.
 */
export function useCashMove() {
  const one = useOneBalance();
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState<{ to: CashChain; usd6: bigint } | null>(null);
  const lastPremove = useRef(new Map<CashChain, number>());
  const health = useQuery({
    queryKey: ["crux-relay-health-moves"],
    staleTime: 60_000,
    enabled: !IS_TESTNET,
    queryFn: async () => ((await (await fetch(`${RELAY_URL}/v1/health`)).json()) as { cashMoves?: boolean }).cashMoves === true,
  });
  const on = !IS_TESTNET && health.data === true;

  const ensure = useCallback(
    async (to: CashChain, usd6: bigint): Promise<"ready" | "moved"> => {
      const have = one.perChain[to] ?? BigInt(0);
      if (have >= usd6) return "ready";
      if (!on) throw new Error(`Add ${NAMES[to]} cash to buy this instantly.`);
      if (Object.values(one.perChain).some((v) => v === null)) throw new Error("Still reading your balance. Try again in a moment.");
      let amount = usd6 - have + headroom(usd6 - have);
      if (amount < MIN_MOVE) amount = MIN_MOVE;
      // From the chain holding the most (other than this one).
      const from = (Object.keys(one.perChain) as CashChain[])
        .filter((c) => c !== to)
        .map((c) => ({ c, cash: one.perChain[c] ?? BigInt(0) }))
        .sort((a, b) => (a.cash > b.cash ? -1 : 1))[0];
      if (!from || from.cash < amount) throw new Error(`Not enough in your balance. Add ${NAMES[to]} cash to buy this.`);
      const token = await getAccessToken();
      if (!token) throw new Error("Log in first.");
      setMoving({ to, usd6: amount });
      try {
        const r = await relay<{ requestId: string }>("/v1/move", { token, from: from.c, to, amount: amount.toString() });
        // Relay pays out about a second after the deposit lands; give it up to 40 s.
        for (let i = 0; i < 80; i++) {
          const s = await relay<{ status: string }>("/v1/move/status", { requestId: r.requestId });
          if (s.status === "done") break;
          if (s.status === "failed") throw new Error("Moving your cash didn't go through. It's refunded to where it was.");
          if (i === 79) throw new Error("Your cash is still on its way. Try the buy again in a few seconds.");
          await sleep(500);
        }
        await queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && /^crux-(solana|bnb|base)-holdings$/.test(q.queryKey[0] as string) });
        return "moved";
      } finally {
        setMoving(null);
      }
    },
    [one.perChain, on, getAccessToken, queryClient],
  );

  /** Moves the quick-buy size ahead of the click (once a minute per chain at most); quiet on failure. */
  const premove = useCallback(
    (to: CashChain, usd6: bigint) => {
      // Only once every chain's cash has been read (a balance still loading isn't an empty one).
      if (!on || usd6 <= BigInt(0) || Object.values(one.perChain).some((v) => v === null) || (one.perChain[to] ?? BigInt(0)) >= usd6) return;
      const last = lastPremove.current.get(to) ?? 0;
      if (Date.now() - last < 60_000) return;
      lastPremove.current.set(to, Date.now());
      void ensure(to, usd6).catch(() => {});
    },
    [on, one.perChain, ensure],
  );

  return { on, ensure, premove, moving, total: one.total, perChain: one.perChain, name: (c: CashChain) => NAMES[c] };
}
