"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { CRUX_SOLVER, TESTNET_USDC } from "@/lib/intents";
import { BLOCK_SECONDS, LOG_CHUNK, MAX_LOG_CHUNKS, logClient, logRanges } from "@/lib/logs";

const SWAP = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const pairAbi = parseAbi(["function token0() view returns (address)"]);

export type PoolTrade = {
  /** From the token's side: buy = USDC in, tokens out of the pool. */
  side: "buy" | "sell";
  usdc: bigint;
  tokens: bigint;
  /** USDC per whole token at this fill (incl. Uniswap's fee). */
  price: number;
  /** Who received the output: the trader for a direct swap, the Crux solver for an intent fill. */
  to: Address;
  viaIntent: boolean;
  txHash: Hex;
  time: number;
};

async function fetchSwaps(pair: Address, since: number, tokenDecimals: number) {
  const [head, token0] = await Promise.all([logClient.getBlock(), logClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" })]);
  const usdcIs0 = getAddress(token0) === getAddress(TESTNET_USDC);
  const elapsed = Math.max(0, Number(head.timestamp) - since);
  const wanted = head.number - BigInt(Math.ceil(elapsed / BLOCK_SECONDS) + 300);
  const floorBlock = head.number - LOG_CHUNK * BigInt(MAX_LOG_CHUNKS);
  const from = wanted > floorBlock ? wanted : floorBlock;

  const chunks = await Promise.all(logRanges(from, head.number).map(([fromBlock, toBlock]) => logClient.getLogs({ address: pair, event: SWAP, fromBlock, toBlock })));
  const trades: PoolTrade[] = chunks
    .flat()
    .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1)) // newest first
    .map((l) => {
      const { amount0In, amount1In, amount0Out, amount1Out, to } = l.args;
      const usdcIn = usdcIs0 ? amount0In! : amount1In!;
      const usdcOut = usdcIs0 ? amount0Out! : amount1Out!;
      const tokIn = usdcIs0 ? amount1In! : amount0In!;
      const tokOut = usdcIs0 ? amount1Out! : amount0Out!;
      const side = usdcIn > BigInt(0) ? "buy" : "sell";
      const usdc = side === "buy" ? usdcIn : usdcOut;
      const tokens = side === "buy" ? tokOut : tokIn;
      const recipient = (to ?? zeroAddress) as Address;
      return {
        side,
        usdc,
        tokens,
        price: tokens > BigInt(0) ? Number(usdc) / 1e6 / (Number(tokens) / 10 ** tokenDecimals) : 0,
        to: recipient,
        viaIntent: getAddress(recipient) === getAddress(CRUX_SOLVER),
        txHash: l.transactionHash,
        time: Number(head.timestamp) - Number(head.number - l.blockNumber) * BLOCK_SECONDS,
      } satisfies PoolTrade;
    });
  return { trades, truncated: wanted < floorBlock };
}

/** Every swap on a graduated launch's locked Uniswap V2 pool since graduation, newest first. */
export function usePoolSwaps(pair: Address, settledAt: number, enabled: boolean, tokenDecimals = 18) {
  return useQuery({
    queryKey: ["pool-swaps", pair],
    queryFn: () => fetchSwaps(pair, settledAt, tokenDecimals),
    enabled: enabled && pair !== zeroAddress,
    refetchInterval: 10_000,
  });
}
