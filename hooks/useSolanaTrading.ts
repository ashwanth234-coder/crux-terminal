"use client";

import { useCallback, useState } from "react";
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
  | { kind: "done"; side: "buy" | "sell"; how: "direct" | "account"; signature?: string; orderId?: string | null; fee?: bigint; ms: number }
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
 */
export function useSolanaTrading(mint: string | null) {
  const crux = useCruxAccount();
  const { getAccessToken } = usePrivy();
  const privyClient = usePrivyClient_experimental();
  const { identityToken } = useIdentityToken();
  const [result, setResult] = useState<SolanaTradeResult>({ kind: "idle" });

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

  const buy = useCallback(
    async (usdc6: bigint, opts: { turbo?: boolean } = {}) => {
      if (!mint) return;
      const t0 = performance.now();
      const h = holdings.data;
      try {
        if (h && h.usdc >= usdc6) {
          setResult({ kind: "busy", label: "Buying…" });
          const r = await relay<{ signature: string; fee: string }>("/v1/solana/trade", { ...(await tokens()), side: "buy", mint, amount: usdc6.toString(), turbo: opts.turbo === true, slippageBps: 300 });
          setResult({ kind: "done", side: "buy", how: "direct", signature: r.signature, fee: BigInt(r.fee), ms: Math.round(performance.now() - t0) });
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
          setResult({ kind: "done", side: "buy", how: "account", orderId: r.orderId, ms: Math.round(performance.now() - t0) });
          crux.refresh();
        }
        void holdings.refetch();
      } catch (e) {
        setResult({ kind: "error", message: (e as Error).message });
      }
    },
    [mint, holdings, tokens, crux, linked],
  );

  /** Sells `amount` of the coin's base units, or "all" (the coin's account is then closed: Rule A). */
  const sell = useCallback(
    async (amount: bigint | "all", opts: { turbo?: boolean } = {}) => {
      if (!mint) return;
      const t0 = performance.now();
      setResult({ kind: "busy", label: "Selling…" });
      try {
        const r = await relay<{ signature: string; fee: string }>("/v1/solana/trade", {
          ...(await tokens()),
          side: "sell",
          mint,
          amount: amount === "all" ? "all" : amount.toString(),
          turbo: opts.turbo === true,
          slippageBps: 300,
        });
        setResult({ kind: "done", side: "sell", how: "direct", signature: r.signature, fee: BigInt(r.fee), ms: Math.round(performance.now() - t0) });
        void holdings.refetch();
      } catch (e) {
        setResult({ kind: "error", message: (e as Error).message });
      }
    },
    [mint, tokens, holdings],
  );

  return { holdings: holdings.data ?? null, loading: holdings.isLoading, buy, sell, result, clear: () => setResult({ kind: "idle" }) };
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
