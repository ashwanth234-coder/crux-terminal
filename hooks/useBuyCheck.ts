"use client";

import { useQuery } from "@tanstack/react-query";
import { classify, type BuyCheck } from "@/lib/buySafety";
import { bundleWarning, findBundle, type MapHolder } from "@/lib/holderMap";
import { relay } from "@/hooks/useSolanaTrading";
import { solanaFacts, solanaWarnings } from "@/lib/coinScan";
import { evmSafety } from "@/lib/tokenSafety";

export type CheckChain = "solana" | "base" | "bnb";

/**
 * A coin's biggest holders (lib/holderMap): Solana from Crux's server, BNB Chain and Base from GoPlus. Null when they
 * couldn't be read.
 */
export async function holdersOf(chain: CheckChain, coin: string): Promise<MapHolder[] | null> {
  try {
    if (chain === "solana") return (await relay<{ holders: MapHolder[] }>("/v1/solana/holders", { mint: coin })).holders;
    const s = (await evmSafety(chain === "bnb" ? "bsc" : "base", [coin]))[coin.toLowerCase()];
    return s?.top ?? null;
  } catch {
    return null;
  }
}

export function useHolders(chain: CheckChain, coin: string | null) {
  return useQuery({ queryKey: ["holders", chain, coin], enabled: !!coin, staleTime: 60_000, queryFn: () => holdersOf(chain, coin!) });
}

/** One buyer split across many wallets, as a warning sign (or none). */
async function bundleSign(chain: CheckChain, coin: string): Promise<string[]> {
  const h = await holdersOf(chain, coin);
  const b = h ? findBundle(h) : null;
  return b ? [bundleWarning(b)] : [];
}

/**
 * A coin's buy check (lib/buySafety), read as soon as its page opens so it's ready by the click; kept 5 minutes.
 * `null` while it's still being read.
 */
export async function buyCheckOf(chain: CheckChain, coin: string): Promise<BuyCheck> {
  if (chain === "solana") {
    const [f, bundle] = await Promise.all([solanaFacts(coin), bundleSign(chain, coin)]);
    return classify(f ? [...solanaWarnings(f), ...bundle] : null, f?.liquidity);
  }
  const s = (await evmSafety(chain === "bnb" ? "bsc" : "base", [coin]).catch(() => ({}) as Record<string, null>))[coin.toLowerCase()];
  const b = s?.top ? findBundle(s.top) : null;
  return classify(s ? [...s.warnings, ...(b ? [bundleWarning(b)] : [])] : null);
}

export function useBuyCheck(chain: CheckChain, coin: string | null): BuyCheck | null {
  const q = useQuery({
    queryKey: ["buy-check", chain, coin],
    enabled: !!coin,
    staleTime: 5 * 60_000,
    queryFn: () => buyCheckOf(chain, coin!),
  });
  return q.data ?? null;
}
