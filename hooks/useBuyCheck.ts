"use client";

import { useQuery } from "@tanstack/react-query";
import { classify, type BuyCheck } from "@/lib/buySafety";
import { bundleWarning, findBundle, type MapHolder } from "@/lib/holderMap";
import { relay } from "@/hooks/useSolanaTrading";
import { solanaFacts, solanaWarnings } from "@/lib/coinScan";
import { evmSafety } from "@/lib/tokenSafety";
import { createPublicClient, erc20Abi, fallback, http, isAddress, type Address } from "viem";
import { base } from "viem/chains";
import { BASE_RPCS } from "@/lib/network";
import { V4_HOOK, hookAbi } from "@/lib/v4launch";

const baseClient = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });

/**
 * Whether a Base coin is a Crux V4 launch (Crux's hook knows its launch time). Those are Crux's own contracts: fixed
 * supply, no tax, no owner, liquidity locked forever, so the outside scanners' check (which takes minutes to cover a
 * new coin) isn't needed. A read that fails counts as "not known to be Crux's": the ordinary check runs.
 */
export async function isCruxV4Coin(coin: string): Promise<boolean> {
  if (!isAddress(coin, { strict: false })) return false;
  try {
    const cfg = await baseClient.readContract({ address: V4_HOOK, abi: hookAbi, functionName: "configOf", args: [coin as Address] });
    return Number(cfg.launchedAt) > 0;
  } catch {
    return false;
  }
}

/**
 * A Crux V4 coin's name and ticker, read from the coin itself: for its first minutes, before the market sites list it
 * (it can already be traded on Crux, straight in its own pool). Null for any other coin.
 */
export async function cruxV4Facts(coin: string): Promise<{ address: string; name: string; symbol: string } | null> {
  if (!(await isCruxV4Coin(coin))) return null;
  try {
    const [name, symbol] = await Promise.all([
      baseClient.readContract({ address: coin as Address, abi: erc20Abi, functionName: "name" }),
      baseClient.readContract({ address: coin as Address, abi: erc20Abi, functionName: "symbol" }),
    ]);
    return { address: coin, name, symbol };
  } catch {
    return null;
  }
}

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
  // Crux's own V4 coins: nothing for an outside scanner to find (and it may not have looked yet: the first minutes).
  if (chain === "base" && (await isCruxV4Coin(coin))) return { blocks: [], warnings: [], checked: true };
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
