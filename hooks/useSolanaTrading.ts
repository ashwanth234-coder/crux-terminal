"use client";

import { useCallback, useRef, useState } from "react";
import { useIdentityToken, usePrivy, usePrivyClient_experimental } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { TESTNET } from "@/lib/chains";
import { TESTNET_USDC } from "@/lib/intents";
import { RELAY_URL } from "@/lib/session";
import { buySolanaFromAccount, cruxAccountSolanaAbi, linkSolanaWallet, quoteMinOut, walletBytes32 } from "@/lib/solanaAccount";

export type SolanaHoldings = {
  wallet: string;
  sol: bigint;
  /** Solana USDC (6 decimals): real money, part of the one balance. */
  usdc: bigint;
  coin: { amount: bigint; decimals: number | null } | null;
  token: { name?: string; symbol?: string; icon?: string; usdPrice?: number; decimals?: number } | null;
};

export type SolanaTradeResult =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  /** `confirmed` turns true once Solana confirms it; "Bought" shows the moment it's sent, as fast terminals do. */
  | { kind: "done"; side: "buy" | "sell"; how: "direct" | "account"; signature?: string; orderId?: string | null; fee?: bigint; ms: number; confirmed: boolean }
  | { kind: "error"; message: string };

async function relay<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RELAY_URL}${path}`, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(json.error ?? `The relay said ${res.status}`);
  return json;
}

/**
 * Solana coins from the one Crux account, for every screen that trades them. A buy picks its route by itself:
 *   - Solana USDC already covers it (after a sell, or a Solana deposit): a direct Solana trade, ~2 s, real money;
 *   - otherwise: paid from the Crux account's USDC (CruxAccountV3.tradeSolana), linking the Solana wallet silently the
 *     first time. On Base Sepolia that path is a dry run on Crux's side: checked, then refunded.
 * A sell is always direct; its USDC stays on Solana as part of the balance (Rule B).
 *
 * Speed: pointing at Buy or Sell prepares that exact trade on the server (routed and signed, not sent); the click then
 * only sends it, and "Bought" shows the moment it's sent, confirmed a moment later.
 */
export function useSolanaTrading(mint: string | null) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const privyClient = usePrivyClient_experimental();
  const { identityToken } = useIdentityToken();
  const [result, setResult] = useState<SolanaTradeResult>({ kind: "idle" });
  /** When each trade was last prepared, so pointing at a button again doesn't prepare it twice (the server keeps it 8 s). */
  const preparedAt = useRef(new Map<string, number>());

  const tokens = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error("Log in first.");
    return { token, privyToken: (await privyClient.getAccessToken()) ?? undefined, identityToken: identityToken ?? undefined };
  }, [getAccessToken, privyClient, identityToken]);

  const holdings = useQuery({
    queryKey: ["crux-solana-holdings", crux.owner, mint],
    enabled: crux.loggedIn && crux.owner !== null,
    refetchInterval: 15_000,
    queryFn: async (): Promise<SolanaHoldings> => {
      const h = await relay<{ wallet: string; sol: string; usdc: string; coin: { amount: string; decimals: number | null } | null; token: SolanaHoldings["token"] }>(
        "/v1/solana/holdings",
        { token: (await tokens()).token, ...(mint ? { mint } : {}) },
      );
      return { wallet: h.wallet, sol: BigInt(h.sol), usdc: BigInt(h.usdc), coin: h.coin ? { amount: BigInt(h.coin.amount), decimals: h.coin.decimals } : null, token: h.token };
    },
  });

  // The account's bound Solana wallet (zero until linked). A new account (FactoryV4) has the function; an older one
  // doesn't, and simply reads as not linked.
  const linked = useReadContract({
    chainId: TESTNET.id,
    address: crux.account ?? zeroAddress,
    abi: cruxAccountSolanaAbi,
    functionName: "solanaWallet",
    query: { enabled: crux.account !== null && crux.deployed, staleTime: 60_000 },
  });

  /** Prepares a direct trade ahead of the click (the trader is pointing at its button). Quiet: errors show on the click. */
  const prepare = useCallback(
    (side: "buy" | "sell", amount: bigint | "all", opts: { turbo?: boolean } = {}) => {
      if (!mint) return;
      const h = holdings.data;
      if (side === "buy" && (!h || typeof amount !== "bigint" || h.usdc < amount)) return; // paid from the account: nothing to prepare
      const key = `${side}|${amount}|${opts.turbo === true}`;
      const last = preparedAt.current.get(key) ?? 0;
      if (Date.now() - last < 6_000) return;
      preparedAt.current.set(key, Date.now());
      void tokens()
        .then((t) => relay("/v1/solana/prepare", { ...t, side, mint, amount: amount.toString(), turbo: opts.turbo === true, slippageBps: 300 }))
        .catch(() => preparedAt.current.delete(key));
    },
    [mint, holdings.data, tokens],
  );

  /** Sends a direct trade; shows it as done the moment it's sent, then waits for Solana's confirmation. */
  const direct = useCallback(
    async (side: "buy" | "sell", amount: bigint | "all", opts: { turbo?: boolean }, t0: number) => {
      preparedAt.current.delete(`${side}|${amount}|${opts.turbo === true}`);
      const r = await relay<{ signature: string; fee: string; pending?: boolean }>("/v1/solana/trade", {
        ...(await tokens()),
        side,
        mint,
        amount: amount.toString(),
        turbo: opts.turbo === true,
        slippageBps: 300,
      });
      const sent = { kind: "done" as const, side, how: "direct" as const, signature: r.signature, fee: BigInt(r.fee), ms: Math.round(performance.now() - t0) };
      setResult({ ...sent, confirmed: !r.pending });
      if (r.pending) {
        const s = await relay<{ status: string; error?: string }>("/v1/solana/status", { signature: r.signature });
        if (s.status === "failed") throw new Error(s.error ?? "The trade didn't go through. Nothing was spent but the network fee.");
        setResult({ ...sent, confirmed: s.status === "confirmed" });
      }
      void holdings.refetch();
    },
    [mint, tokens, holdings],
  );

  const buy = useCallback(
    async (usdc6: bigint, opts: { turbo?: boolean } = {}) => {
      if (!mint) return;
      const t0 = performance.now();
      const h = holdings.data;
      try {
        if (h && h.usdc >= usdc6) {
          setResult({ kind: "busy", label: "Buying…" });
          await direct("buy", usdc6, opts, t0);
        } else {
          if (!crux.sign || !crux.owner || !crux.account) throw new Error("Your account is still loading. Try again in a moment.");
          if ((crux.usdc ?? BigInt(0)) < usdc6) throw new Error("Not enough in your balance. Add money first.");
          if (!h) throw new Error("Still reading your balance. Try again in a moment.");
          setResult({ kind: "busy", label: "Buying from your balance…" });
          if (!linked.data || BigInt(linked.data) === BigInt(0) || linked.data.toLowerCase() !== walletBytes32(h.wallet).toLowerCase()) {
            await linkSolanaWallet(crux.sign, crux.owner, crux.account, h.wallet);
            void linked.refetch();
          }
          const minOut = await quoteMinOut(mint, usdc6 - (usdc6 * BigInt(50)) / BigInt(10_000));
          const r = await buySolanaFromAccount(crux.sign, crux.owner, crux.account, { usdc: TESTNET_USDC, amountIn: usdc6, mint, minAmountOut: minOut });
          setResult({ kind: "done", side: "buy", how: "account", orderId: r.orderId, ms: Math.round(performance.now() - t0), confirmed: true });
          crux.refresh();
        }
        void holdings.refetch();
      } catch (e) {
        setResult({ kind: "error", message: (e as Error).message });
      }
    },
    [mint, holdings, crux, linked, direct],
  );

  /** Sells `amount` of the coin's base units, or "all" (the coin's account is then closed: Rule A). */
  const sell = useCallback(
    async (amount: bigint | "all", opts: { turbo?: boolean } = {}) => {
      if (!mint) return;
      const t0 = performance.now();
      setResult({ kind: "busy", label: "Selling…" });
      try {
        await direct("sell", amount, opts, t0);
      } catch (e) {
        setResult({ kind: "error", message: (e as Error).message });
      }
    },
    [mint, direct],
  );

  return { holdings: holdings.data ?? null, loading: holdings.isLoading, prepare, buy, sell, result, clear: () => setResult({ kind: "idle" }) };
}

/**
 * The one balance: the Crux account's USDC plus the USDC in the login's Solana wallet. Until Base mainnet the account
 * holds test USDC and Solana holds real USDC, so they're reported apart and never added together.
 */
export function useOneBalance(): { account: bigint | null; solana: bigint | null; testnet: boolean } {
  const crux = useCruxAccount();
  const { holdings } = useSolanaTrading(null);
  return { account: crux.usdc, solana: holdings?.usdc ?? null, testnet: TESTNET.testnet === true };
}
