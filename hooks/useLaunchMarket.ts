"use client";

import { erc20Abi, getAddress, keccak256, parseAbi, toHex, zeroAddress, type Address } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { TESTNET } from "@/lib/chains";
import { SETTLER, SETTLER_DEPLOYED, TESTNET_USDC } from "@/lib/intents";
import { launchCaip19, midPrice, type PoolReserves } from "@/lib/launchTrade";

/** CruxDestinationSettler on Base Sepolia: delivers what a buy intent asks for. */
const DESTINATION_SETTLER = "0x300a835939D2beBed59C543470DCD9a9c8065822";

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
