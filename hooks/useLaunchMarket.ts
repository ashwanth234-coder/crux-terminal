"use client";

import { erc20Abi, getAddress, keccak256, parseAbi, toHex, zeroAddress, type Address } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { TESTNET } from "@/lib/chains";
import { useLaunchesV2 } from "@/hooks/useLaunches";
import { DESTINATION_SETTLER, FACTORY_V2, FACTORY_V3, SETTLER, SETTLER_DEPLOYED, TESTNET_USDC } from "@/lib/intents";
import { launchCaip19, midPrice, type PoolReserves } from "@/lib/launchTrade";
import type { BatchVersion } from "@/lib/launchV2";

/** The destination settler that delivers what a buy intent asks for (follows the active settler). */
export { DESTINATION_SETTLER };

const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);
const registryAbi = parseAbi(["function assetToken(bytes32 assetId) view returns (address)"]);

export type LaunchMarket = {
  token: Address;
  pair: Address;
  caip19: string;
  decimals: number;
  reserves: PoolReserves | null;
  /** Mid price, USDC per token. */
  price: number | null;
  /** The settlers list the token: buys need the destination settler, sells the origin settler. */
  listedForBuys: boolean;
  listedForSells: boolean;
  /** Connected wallet's token balance (base units), null without a wallet. */
  tokenBalance: bigint | null;
  loading: boolean;
};

/** A graduated launch's locked Uniswap V2 pool and whether intents can trade it yet (Base Sepolia). */
export function useLaunchMarket(token: Address, pair: Address): LaunchMarket {
  const { address } = useConnection();
  const caip19 = launchCaip19(token);
  const id = keccak256(toHex(caip19));
  const on = { chainId: TESTNET.id } as const;

  const reads = useReadContracts({
    contracts: [
      { ...on, address: pair, abi: pairAbi, functionName: "token0" },
      { ...on, address: pair, abi: pairAbi, functionName: "getReserves" },
      { ...on, address: DESTINATION_SETTLER, abi: registryAbi, functionName: "assetToken", args: [id] },
      { ...on, address: SETTLER, abi: registryAbi, functionName: "assetToken", args: [id] },
      { ...on, address: token, abi: erc20Abi, functionName: "decimals" },
      { ...on, address: token, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress] },
    ],
    query: { enabled: pair !== zeroAddress, refetchInterval: 15_000 },
  });

  const [t0, res, dest, origin, dec, bal] = reads.data ?? [];
  const decimals = dec?.result ?? 18;
  let reserves: PoolReserves | null = null;
  if (t0?.result && res?.result) {
    const [r0, r1] = res.result;
    reserves = getAddress(t0.result) === getAddress(TESTNET_USDC) ? { usdc: r0, token: r1 } : { usdc: r1, token: r0 };
  }
  const listed = (r: { result?: Address } | undefined) => SETTLER_DEPLOYED && Boolean(r?.result) && getAddress(r!.result!) === getAddress(token);

  return {
    token,
    pair,
    caip19,
    decimals,
    reserves,
    price: reserves ? midPrice(reserves, decimals) : null,
    listedForBuys: listed(dest),
    listedForSells: listed(origin),
    tokenBalance: address && bal?.result !== undefined ? bal.result : null,
    loading: reads.isLoading,
  };
}

export type GraduatedLaunch = {
  /** "v3#0" */
  key: string;
  version: BatchVersion;
  id: number;
  symbol: string;
  token: Address;
  pair: Address;
  /** Listed on the destination settler, so buy intents can open (the solver serves every listed launch). */
  listed: boolean;
  href: string;
};

/**
 * Every graduated V2/V3 launch (newest first per factory, listed ones first): the markets the trade widget
 * offers. Discovered from the factories like the solver does, so a new graduation shows up without a deploy.
 */
export function useGraduatedLaunches(): { launches: GraduatedLaunch[]; loading: boolean } {
  const v3 = useLaunchesV2(FACTORY_V3, 3);
  const v2 = useLaunchesV2(FACTORY_V2, 2);
  const graduated = [...v3.launches, ...v2.launches].filter((l) => l.v2?.status === 1 && l.v2.pair !== zeroAddress);

  const listing = useReadContracts({
    contracts: graduated.map((l) => ({
      chainId: TESTNET.id,
      address: DESTINATION_SETTLER,
      abi: registryAbi,
      functionName: "assetToken" as const,
      args: [keccak256(toHex(launchCaip19(l.v2!.token)))] as const,
    })),
    query: { enabled: graduated.length > 0, refetchInterval: 30_000 },
  });

  const launches = graduated.map((l, i) => {
    const listed = listing.data?.[i]?.result;
    return {
      key: `v${l.version}#${l.id}`,
      version: l.version as BatchVersion,
      id: l.id,
      symbol: l.symbol ?? "TOKEN",
      token: l.v2!.token,
      pair: l.v2!.pair,
      listed: SETTLER_DEPLOYED && Boolean(listed) && getAddress(listed as Address) === getAddress(l.v2!.token),
      href: l.href,
    };
  });
  launches.sort((a, b) => Number(b.listed) - Number(a.listed));
  // A factory that isn't configured never loads (its query is disabled), so it doesn't count as loading.
  const factoriesLoading = (FACTORY_V3 !== null && v3.loading) || (FACTORY_V2 !== null && v2.loading);
  return { launches, loading: factoriesLoading || (graduated.length > 0 && listing.isPending) };
}
