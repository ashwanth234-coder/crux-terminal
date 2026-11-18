"use client";

import { useCallback, useRef, useState } from "react";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { relay } from "@/hooks/useSolanaTrading";
import { RELAY_URL } from "@/lib/session";

export type BnbHoldings = { wallet: string; bnb: bigint; usdt: bigint; coin: { amount: bigint; decimals: number } | null };
export type BnbTradeResult =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; side: "buy" | "sell"; hash: string; ms: number; confirmed: boolean }
  | { kind: "error"; message: string };

/**
 * BNB Chain coins from the one Crux account (crux-solver bnbtraderelay.ts): the login's own wallet on BNB Chain, its
 * cash in USDT, Crux paying the gas. The first trade adds Crux's signer to the wallet under the "BNB trades only"
 * rule (once, silently), as Solana does. Pointing at a button prepares the trade; "Bought" shows when it's sent.
 */
export function useBnbTrading(coin: string | null) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const { addSigners } = useSigners();
  const [result, setResult] = useState<BnbTradeResult>({ kind: "idle" });
  const preparedAt = useRef(new Map<string, number>());

  const token = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Log in first.");
    return t;
  }, [getAccessToken]);

  const holdings = useQuery({
    queryKey: ["crux-bnb-holdings", crux.owner, coin],
    enabled: crux.loggedIn && crux.owner !== null,
    refetchInterval: 15_000,
    queryFn: async (): Promise<BnbHoldings> => {
      const h = await relay<{ wallet: string; bnb: string; usdt: string; coin: { amount: string; decimals: number } | null }>("/v1/bnb/holdings", {
        token: await token(),
        ...(coin ? { coin } : {}),
      });
      return { wallet: h.wallet, bnb: BigInt(h.bnb), usdt: BigInt(h.usdt), coin: h.coin ? { amount: BigInt(h.coin.amount), decimals: h.coin.decimals } : null };
    },
  });

  /** Adds Crux's server signer to the login's EVM wallet under the "BNB trades only" policy (the relay names both). */
  const enable = useCallback(async () => {
    if (!crux.owner) throw new Error("Your account is still loading.");
    const health = (await (await fetch(`${RELAY_URL}/v1/health`)).json()) as { bnbTrading?: { signerId: string; policyId: string } };
    if (!health.bnbTrading) throw new Error("BNB Chain trading isn't switched on yet.");
    await addSigners({ address: crux.owner, signers: [{ signerId: health.bnbTrading.signerId, policyIds: [health.bnbTrading.policyId] }] });
  }, [crux.owner, addSigners]);

  const prepare = useCallback(
    (side: "buy" | "sell", amount: bigint | "all") => {
      if (!coin) return;
      const h = holdings.data;
      if (side === "buy" && (!h || typeof amount !== "bigint" || h.usdt < amount)) return;
      const key = `${side}|${amount}`;
      const now = Date.now();
      if (now - (preparedAt.current.get(key) ?? 0) < 6_000 || now - (preparedAt.current.get("*") ?? 0) < 700) return;
      preparedAt.current.set(key, now);
      preparedAt.current.set("*", now);
      void token()
        .then((t) => relay("/v1/bnb/prepare", { token: t, side, coin, amount: amount.toString() }))
        .catch(() => preparedAt.current.delete(key));
    },
    [coin, holdings.data, token],
  );

  const trade = useCallback(
    async (side: "buy" | "sell", amount: bigint | "all") => {
      if (!coin) return;
      const t0 = performance.now();
      setResult({ kind: "busy", label: side === "buy" ? "Buying…" : "Selling…" });
      const send = async () => relay<{ hash: string; pending?: boolean }>("/v1/bnb/trade", { token: await token(), side, coin, amount: amount.toString(), slippageBps: 300 });
      try {
        let r: { hash: string; pending?: boolean };
        try {
          r = await send();
        } catch (e) {
          // The first BNB trade: add Crux's signer to the wallet (silent), then send it again.
          if (!/Turn on BNB Chain trading/i.test((e as Error).message)) throw e;
          setResult({ kind: "busy", label: "Turning on BNB Chain trading (once)…" });
          await enable().catch((err: Error) => {
            console.warn("bnb: adding Crux's signer failed", err);
            throw new Error("Couldn't turn on BNB Chain trading. Reload the page and try again.");
          });
          r = await send().catch((err: Error) => {
            if (/Turn on BNB Chain trading/i.test(err.message)) throw new Error("BNB Chain trading didn't turn on yet. Wait a few seconds and press Buy again.");
            throw err;
          });
        }
        const sent = { kind: "done" as const, side, hash: r.hash, ms: Math.round(performance.now() - t0) };
        setResult({ ...sent, confirmed: false });
        const s = await relay<{ status: string }>("/v1/bnb/status", { hash: r.hash });
        if (s.status === "failed") throw new Error("The trade didn't go through on BNB Chain. Nothing was spent but gas, which Crux paid.");
        setResult({ ...sent, confirmed: s.status === "confirmed" });
        void holdings.refetch();
      } catch (e) {
        setResult({ kind: "error", message: (e as Error).message });
      }
    },
    [coin, token, enable, holdings],
  );

  return { holdings: holdings.data ?? null, prepare, buy: (usdt: bigint) => trade("buy", usdt), sell: (amount: bigint | "all") => trade("sell", amount), result };
}
