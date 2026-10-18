"use client";

import { useMemo } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { base, bsc } from "viem/chains";
import { useBalance, useConnection, useReadContract, useReadContracts } from "wagmi";
import { PRICE_FEEDS, USDC, robinhoodChain, type ChainKey } from "@/lib/chains";
import { DEMO_BALANCES, DEMO_CHANGE_24H, usd, type PaySourceId } from "@/lib/tokens";
import { useSolanaBalance } from "./useSolanaBalance";

const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export type BalanceStatus = "demo" | "loading" | "live" | "unavailable" | "unlinked" | "soon" | "evm-off";

// Robinhood Chain has no public RPC yet; only query it once one is configured.
const ROBINHOOD_LIVE = Boolean(process.env.NEXT_PUBLIC_ROBINHOOD_RPC);

export type ChainBalanceView = {
  chain: ChainKey;
  label: string;
  /** Total USD value on this chain (native gas token + USDC). */
  usd: number;
  usdc: number;
  native: { amount: number; symbol: string; usd: number } | null;
  status: BalanceStatus;
  /** Share of total buying power, 0–100. */
  share: number;
};

export type UnifiedBalance = {
  mode: "demo" | "live";
  address: Address | undefined;
  isLoading: boolean;
  chains: ChainBalanceView[];
  totalBuyingPower: number;
  totalFormatted: string;
  /** 24h change in percent; null for live wallets until a history source exists. */
  change24h: number | null;
  changeFormatted: string;
  /** Spendable USD for a given "Pay with" source. */
  availableFor: (source: PaySourceId) => number;
  /** The linked Solana wallet, if any (base58 public key). */
  solana: { connected: boolean; publicKey: string | null };
};

const POLL = 30_000;

function withShares(rows: Omit<ChainBalanceView, "share">[]): { rows: ChainBalanceView[]; total: number } {
  const total = rows.reduce((s, r) => s + r.usd, 0);
  return { rows: rows.map((r) => ({ ...r, share: total > 0 ? (r.usd / total) * 100 : 0 })), total };
}

function feedPrice(data: unknown): number | null {
  if (!Array.isArray(data)) return null;
  const answer = data[1];
  return typeof answer === "bigint" && answer > BigInt(0) ? Number(formatUnits(answer, 8)) : null;
}

/**
 * Aggregates native + USDC holdings on Base, BSC and Robinhood Chain (EVM
 * wallet) and SOL + SPL-USDC (Solana wallet) into one buying-power figure.
 * Either wallet alone is enough to go live. Falls back to demo figures when
 * neither is connected, and degrades per chain if an RPC is down.
 */
export function useUnifiedBalance(): UnifiedBalance {
  const { address } = useConnection();
  const sol = useSolanaBalance();
  const enabled = Boolean(address);
  const anyLive = enabled || sol.connected;
  const query = { enabled, refetchInterval: POLL } as const;

  const baseNative = useBalance({ address, chainId: base.id, query });
  const bscNative = useBalance({ address, chainId: bsc.id, query });
  const rhNative = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { ...query, enabled: enabled && ROBINHOOD_LIVE, retry: 1 },
  });

  const baseUsdc = useReadContract({
    address: USDC.base?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query,
  });
  const bscUsdc = useReadContract({
    address: USDC.bsc?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query,
  });
  const rhUsdc = useReadContract({
    address: USDC.robinhood?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: robinhoodChain.id,
    query: { ...query, enabled: enabled && Boolean(USDC.robinhood), retry: 1 },
  });

  const prices = useReadContracts({
    contracts: [
      { address: PRICE_FEEDS.ethUsd.address, abi: aggregatorAbi, functionName: "latestRoundData", chainId: PRICE_FEEDS.ethUsd.chainId },
      { address: PRICE_FEEDS.bnbUsd.address, abi: aggregatorAbi, functionName: "latestRoundData", chainId: PRICE_FEEDS.bnbUsd.chainId },
      { address: PRICE_FEEDS.solUsd.address, abi: aggregatorAbi, functionName: "latestRoundData", chainId: PRICE_FEEDS.solUsd.chainId },
    ],
    allowFailure: true,
    query: { enabled: anyLive, refetchInterval: 60_000 },
  });

  return useMemo<UnifiedBalance>(() => {
    const solana = { connected: sol.connected, publicKey: sol.publicKey };
    if (!anyLive) {
      const { rows, total } = withShares(
        DEMO_BALANCES.map((b) => ({ ...b, usdc: b.usd, native: null, status: "demo" as const })),
      );
      return build("demo", undefined, false, rows, total, DEMO_CHANGE_24H, solana);
    }

    const ethUsd = feedPrice(prices.data?.[0]?.result);
    const bnbUsd = feedPrice(prices.data?.[1]?.result);
    const solUsd = feedPrice(prices.data?.[2]?.result);

    type Native = typeof baseNative;
    type Usdc = typeof baseUsdc;
    const evmRow = (
      chain: Exclude<ChainKey, "solana">,
      label: string,
      native: Native,
      usdcRead: Usdc,
      price: number | null,
    ): Omit<ChainBalanceView, "share"> => {
      // Solana-only session: EVM rows are simply not linked yet.
      if (!address) return { chain, label, usd: 0, usdc: 0, native: null, status: "evm-off" };
      const spec = USDC[chain];
      const nativeAmount = native.data ? Number(formatUnits(native.data.value, native.data.decimals)) : 0;
      const nativeUsd = price ? nativeAmount * price : 0;
      const usdcAmount = spec && typeof usdcRead.data === "bigint" ? Number(formatUnits(usdcRead.data, spec.decimals)) : 0;
      const failed = native.isError && (!spec || usdcRead.isError);
      const loading = native.isLoading || (Boolean(spec) && usdcRead.isLoading);
      return {
        chain,
        label,
        usd: nativeUsd + usdcAmount,
        usdc: usdcAmount,
        native: native.data ? { amount: nativeAmount, symbol: native.data.symbol, usd: nativeUsd } : null,
        status: failed ? "unavailable" : loading ? "loading" : "live",
      };
    };

    const { rows, total } = withShares([
      evmRow("base", "Base", baseNative, baseUsdc, ethUsd),
      solanaRow(sol, solUsd),
      evmRow("bsc", "BSC", bscNative, bscUsdc, bnbUsd),
      ROBINHOOD_LIVE
        ? evmRow("robinhood", "Robinhood", rhNative, rhUsdc, ethUsd)
        : { chain: "robinhood", label: "Robinhood", usd: 0, usdc: 0, native: null, status: "soon" },
    ]);
    const isLoading = rows.some((r) => r.status === "loading") || prices.isLoading;
    return build("live", address, isLoading, rows, total, null, solana);
  }, [anyLive, address, sol, baseNative, bscNative, rhNative, baseUsdc, bscUsdc, rhUsdc, prices.data, prices.isLoading]);
}

function solanaRow(sol: ReturnType<typeof useSolanaBalance>, price: number | null): Omit<ChainBalanceView, "share"> {
  // Solana balances need an SVM wallet; EVM connectors can't read them.
  if (!sol.connected) return { chain: "solana", label: "Solana", usd: 0, usdc: 0, native: null, status: "unlinked" };
  const nativeUsd = price ? sol.sol * price : 0;
  return {
    chain: "solana",
    label: "Solana",
    usd: nativeUsd + sol.usdc,
    usdc: sol.usdc,
    native: { amount: sol.sol, symbol: "SOL", usd: nativeUsd },
    status: sol.isError ? "unavailable" : sol.isLoading ? "loading" : "live",
  };
}

function build(
  mode: UnifiedBalance["mode"],
  address: Address | undefined,
  isLoading: boolean,
  chains: ChainBalanceView[],
  total: number,
  change24h: number | null,
  solana: UnifiedBalance["solana"],
): UnifiedBalance {
  const byChain = (c: ChainKey) => chains.find((r) => r.chain === c);
  return {
    mode,
    address,
    isLoading,
    chains,
    totalBuyingPower: total,
    totalFormatted: usd.format(total),
    change24h,
    changeFormatted: change24h === null ? "Live" : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}%`,
    solana,
    availableFor: (source) => {
      if (source === "unified") return total;
      const chain = source === "base-usdc" ? "base" : source === "solana-usdc" ? "solana" : "robinhood";
      return byChain(chain)?.usdc ?? 0;
    },
  };
}
