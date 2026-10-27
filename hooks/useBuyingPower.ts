"use client";

import { erc20Abi, zeroAddress } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { TESTNET } from "@/lib/chains";
import { LIVE_ORIGINS, toUsdc6, type PayFrom } from "@/lib/crosschain";
import { TESTNET_USDC } from "@/lib/intents";

export type PowerSource = { key: PayFrom | "account"; name: string; usdc6: bigint | null };

/**
 * Everything the trader can buy with right now, in test USDC (6 decimals): the connected wallet on Base Sepolia and
 * on every live cross-chain origin (filled on Base through the solver), plus the Crux account on Base. A source that
 * can't be read is null and left out of the total.
 */
export function useBuyingPower(): { sources: PowerSource[]; total: bigint | null } {
  const { address } = useConnection();
  const crux = useCruxAccount();
  const query = { enabled: Boolean(address), refetchInterval: 30_000 };
  const base = useReadContract({ chainId: TESTNET.id, address: TESTNET_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], query });
  const origins = useReadContracts({
    contracts: LIVE_ORIGINS.map((o) => ({ chainId: o.chain.id, address: o.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress] }) as const),
    query,
  });
  const wallet: PowerSource[] = address
    ? [
        { key: "base", name: "Base", usdc6: base.data ?? null },
        ...LIVE_ORIGINS.map((o, i) => {
          const raw = origins.data?.[i]?.result as bigint | undefined;
          return { key: o.key as PayFrom, name: o.name.replace(/ (Sepolia|testnet)$/, ""), usdc6: raw === undefined ? null : toUsdc6(raw, o.decimals) };
        }),
      ]
    : [];
  const account: PowerSource[] = crux.loggedIn && crux.account ? [{ key: "account", name: "Crux account", usdc6: crux.usdc }] : [];
  const sources = [...account, ...wallet];
  const known = sources.filter((s) => s.usdc6 !== null);
  return { sources, total: known.length ? known.reduce((s, x) => s + (x.usdc6 as bigint), BigInt(0)) : null };
}
