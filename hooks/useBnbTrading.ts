"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy, useSigners } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { refreshBalances, relay } from "@/hooks/useSolanaTrading";
import { RELAY_URL } from "@/lib/session";

/** `usdt`/`bnb` are BNB Chain's names; `cash`/`gas` are the same numbers on any chain (Base: USDC, 6 decimals). */
export type BnbHoldings = { wallet: string; bnb: bigint; usdt: bigint; cash: bigint; cashDecimals: number; coin: { amount: bigint; decimals: number } | null };

/** A chain the login's own wallet trades on through the relay (Option A: Base joins BNB Chain). */
export type WalletChain = "bnb" | "base";
const CHAINS: Record<WalletChain, { path: string; name: string; health: "bnbTrading" | "baseTrading"; decimals: number; explorer: string }> = {
  bnb: { path: "/v1/bnb", name: "BNB Chain", health: "bnbTrading", decimals: 18, explorer: "https://bscscan.com/tx/" },
  base: { path: "/v1/base", name: "Base", health: "baseTrading", decimals: 6, explorer: "https://basescan.org/tx/" },
};
export const walletChainInfo = (c: WalletChain) => CHAINS[c];
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
  return useWalletTrading("bnb", coin);
}

/** Coins on `chain` from the login's own wallet there (see useBnbTrading); its cash counts `walletChainInfo(chain).decimals`. */
export function useWalletTrading(chain: WalletChain, coin: string | null) {
  const c = CHAINS[chain];
  const qc = useQueryClient();
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const { addSigners } = useSigners();
  const [result, setResult] = useState<BnbTradeResult>({ kind: "idle" });
  const preparedAt = useRef(new Map<string, number>());
  /** The trade last pointed at (kept ready for 30 s while the user decides) and a pending "landed here" prepare. */
  const wanted = useRef<{ side: "buy" | "sell"; amount: bigint | "all"; slippageBps: number; at: number } | null>(null);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) throw new Error("Log in first.");
    return t;
  }, [getAccessToken]);

  const holdings = useQuery({
    queryKey: [`crux-${chain}-holdings`, crux.owner, coin],
    enabled: crux.loggedIn && crux.owner !== null,
    refetchInterval: 15_000,
    queryFn: async (): Promise<BnbHoldings> => {
      const h = await relay<{ wallet: string; bnb: string; usdt: string; cash?: string; cashDecimals?: number; coin: { amount: string; decimals: number } | null }>(`${c.path}/holdings`, {
        token: await token(),
        ...(coin ? { coin } : {}),
      });
      return { wallet: h.wallet, bnb: BigInt(h.bnb), usdt: BigInt(h.usdt), cash: BigInt(h.cash ?? h.usdt), cashDecimals: h.cashDecimals ?? c.decimals, coin: h.coin ? { amount: BigInt(h.coin.amount), decimals: h.coin.decimals } : null };
    },
  });

  /** Adds Crux's server signer to the login's EVM wallet under the "BNB trades only" policy (the relay names both). */
  const enable = useCallback(async () => {
    if (!crux.owner) throw new Error("Your account is still loading.");
    const health = (await (await fetch(`${RELAY_URL}/v1/health`)).json()) as Partial<Record<"bnbTrading" | "baseTrading", { signerId: string; policyId: string }>>;
    const s = health[c.health];
    if (!s) throw new Error(`${c.name} trading isn't switched on yet.`);
    await addSigners({ address: crux.owner, signers: [{ signerId: s.signerId, policyIds: [s.policyId] }] });
  }, [crux.owner, addSigners, c]);

  /** Asks the relay to ready this trade (its route, balance, spending permission and gas): the click then only sends. */
  const fire = useCallback(
    (side: "buy" | "sell", amount: bigint | "all", slippageBps: number) => {
      if (!coin) return;
      const key = `${side}|${amount}|${slippageBps}`;
      const now = Date.now();
      preparedAt.current.set(key, now);
      preparedAt.current.set("*", now);
      void token()
        .then((t) => relay(`${c.path}/prepare`, { token: t, side, coin, amount: amount.toString(), slippageBps }))
        .catch(() => preparedAt.current.delete(key));
    },
    [coin, token, c],
  );

  const prepare = useCallback(
    (side: "buy" | "sell", amount: bigint | "all", slippageBps = 300) => {
      if (!coin) return;
      const h = holdings.data;
      if (side === "buy" && (!h || typeof amount !== "bigint" || h.cash < amount)) return;
      wanted.current = { side, amount, slippageBps, at: Date.now() };
      const key = `${side}|${amount}|${slippageBps}`;
      const now = Date.now();
      if (now - (preparedAt.current.get(key) ?? 0) < 6_000) return;
      const since = now - (preparedAt.current.get("*") ?? 0);
      if (since < 700) {
        // Sweeping across buttons: the one the pointer settles on is readied once the sweep stops.
        if (trailing.current) clearTimeout(trailing.current);
        trailing.current = setTimeout(() => {
          trailing.current = null;
          const w = wanted.current;
          if (w && Date.now() - (preparedAt.current.get(`${w.side}|${w.amount}|${w.slippageBps}`) ?? 0) >= 6_000) fire(w.side, w.amount, w.slippageBps);
        }, 700 - since);
        return;
      }
      fire(side, amount, slippageBps);
    },
    [coin, holdings.data, fire],
  );

  // A readied trade lasts 8 s on the relay: while the user is still deciding (up to 30 s after pointing at it), it's
  // readied again so the click finds it fresh.
  useEffect(() => {
    const id = setInterval(() => {
      const w = wanted.current;
      if (w && Date.now() - w.at < 30_000) fire(w.side, w.amount, w.slippageBps);
    }, 6_500);
    return () => {
      clearInterval(id);
      if (trailing.current) clearTimeout(trailing.current);
    };
  }, [fire]);

  const trade = useCallback(
    async (side: "buy" | "sell", amount: bigint | "all", slippageBps = 300, deskUsd?: number, acceptEarlyBps?: number) => {
      if (!coin) return;
      const t0 = performance.now();
      wanted.current = null;
      setResult({ kind: "busy", label: side === "buy" ? "Buying…" : "Selling…" });
      const send = async () => relay<{ hash: string; pending?: boolean }>(`${c.path}/trade`, { token: await token(), side, coin, amount: amount.toString(), slippageBps, ...(deskUsd ? { deskCheck: deskUsd } : {}), ...(acceptEarlyBps !== undefined ? { acceptEarlyBps } : {}) });
      try {
        let r: { hash: string; pending?: boolean };
        try {
          r = await send();
        } catch (e) {
          // The first BNB trade: add Crux's signer to the wallet (silent), then send it again.
          if (!/Turn on .* trading/i.test((e as Error).message)) throw e;
          setResult({ kind: "busy", label: `Turning on ${c.name} trading (once)…` });
          await enable().catch((err: Error) => {
            console.warn("bnb: adding Crux's signer failed", err);
            throw new Error(`Couldn't turn on ${c.name} trading. Reload the page and try again.`);
          });
          // Privy takes a few seconds to honour the newly added signer (live 2026-11-18: refused 14 s after adding,
          // accepted 6 s later), so the trade is sent again by itself until it is, one click for the user.
          for (let attempt = 1; ; attempt++) {
            await new Promise((ok) => setTimeout(ok, attempt === 1 ? 1_500 : 2_500));
            try {
              r = await send();
              break;
            } catch (err) {
              if (!/Turn on .* trading/i.test((err as Error).message)) throw err;
              if (attempt >= 8) throw new Error(`${c.name} trading is still turning on. Wait a few seconds and press again.`);
            }
          }
        }
        const sent = { kind: "done" as const, side, hash: r.hash, ms: Math.round(performance.now() - t0) };
        setResult({ ...sent, confirmed: false });
        const s = await relay<{ status: string }>(`${c.path}/status`, { hash: r.hash });
        if (s.status === "failed") throw new Error(`The trade didn't go through on ${c.name}. Nothing was spent but gas, which Crux paid.`);
        const done = { ...sent, confirmed: s.status === "confirmed" };
        setResult(done);
        refreshBalances(qc);
        return done as BnbTradeResult;
      } catch (e) {
        const err = { kind: "error" as const, message: (e as Error).message };
        setResult(err);
        return err as BnbTradeResult;
      }
    },
    [coin, token, enable, qc, c],
  );

  return { holdings: holdings.data ?? null, refetch: holdings.refetch, prepare, buy: (usdt: bigint, slippageBps?: number, deskUsd?: number, acceptEarlyBps?: number) => trade("buy", usdt, slippageBps, deskUsd, acceptEarlyBps), sell: (amount: bigint | "all", slippageBps?: number) => trade("sell", amount, slippageBps), result };
}
