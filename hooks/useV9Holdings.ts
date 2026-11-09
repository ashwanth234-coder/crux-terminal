"use client";

import { erc20Abi, zeroAddress, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { TESTNET } from "@/lib/chains";
import { FACTORY_V9, ROUTER_V9, V9_ON, factoryV9Abi, routerV9Abi } from "@/lib/v9";

export type V9Holding = { id: bigint; token: Address; symbol: string; balance: bigint; /** What it sells for now (USDC units), when quoted. */ value: bigint | null };

/**
 * The V9 tokens `holder` holds (a CRUX Account or a wallet), with what each sells for now: for the Portfolio page and
 * the account's emergency sweep (which must take V9 tokens out too). Empty while V9 is off or nothing is held.
 */
export function useV9Holdings(holder: Address | null | undefined): { holdings: V9Holding[]; loading: boolean } {
  const on = V9_ON && Boolean(holder);
  const count = useReadContracts({
    query: { enabled: on, refetchInterval: 30_000 },
    contracts: [{ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount", chainId: TESTNET.id }],
  });
  const n = Number((count.data?.[0]?.result as bigint | undefined) ?? BigInt(0));
  const ids = Array.from({ length: n }, (_, i) => BigInt(i));
  const launches = useReadContracts({
    query: { enabled: on && n > 0, staleTime: Infinity },
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id], chainId: TESTNET.id }) as const),
  });
  const tokens = (launches.data ?? []).map((r) => (r.result as { token: Address } | undefined)?.token ?? zeroAddress);
  const reads = useReadContracts({
    query: { enabled: on && tokens.length > 0, refetchInterval: 10_000 },
    contracts: tokens.flatMap((token) => [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder ?? zeroAddress], chainId: TESTNET.id } as const,
      { address: token, abi: erc20Abi, functionName: "symbol", chainId: TESTNET.id } as const,
    ]),
  });
  const held = tokens
    .map((token, i) => ({
      id: ids[i],
      token,
      balance: (reads.data?.[i * 2]?.result as bigint | undefined) ?? BigInt(0),
      symbol: (reads.data?.[i * 2 + 1]?.result as string | undefined) ?? "TOKEN",
    }))
    .filter((h) => h.token !== zeroAddress && h.balance > BigInt(0));
  const values = useReadContracts({
    query: { enabled: held.length > 0, refetchInterval: 15_000 },
    contracts: held.map((h) => ({ address: ROUTER_V9, abi: routerV9Abi, functionName: "quoteSell", args: [h.token, h.balance], chainId: TESTNET.id }) as const),
  });
  return {
    holdings: held.map((h, i) => ({ ...h, value: (values.data?.[i]?.result as readonly bigint[] | undefined)?.[0] ?? null })),
    loading: on && (count.isPending || (n > 0 && (launches.isPending || reads.isPending))),
  };
}
