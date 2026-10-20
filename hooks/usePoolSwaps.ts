"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { CRUX_SOLVER, TESTNET_USDC } from "@/lib/intents";
import { logClient, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";

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
  blockNumber: bigint;
  logIndex: number;
  time: number;
};

// A pair's token order never changes: read it once per pair.
const usdcIsToken0 = new Map<Address, Promise<boolean>>();
function readUsdcIs0(pair: Address) {
  let known = usdcIsToken0.get(pair);
  if (!known) {
    known = logClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }).then((t) => getAddress(t) === getAddress(TESTNET_USDC));
    known.catch(() => usdcIsToken0.delete(pair));
    usdcIsToken0.set(pair, known);
  }
  return known;
}

const newestFirst = (scan: LogScan<PoolTrade>) => ({ trades: [...scan.items].reverse(), truncated: scan.truncated });

/** Every swap on a graduated launch's locked Uniswap V2 pool since graduation, newest first. */
export function usePoolSwaps(pair: Address, settledAt: number, enabled: boolean, tokenDecimals = 18) {
  const queryKey = ["pool-swaps", pair];
  const pollId = queryKey.join(":");
  return useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<PoolTrade>>(queryKey), settledAt, async (fromBlock, toBlock, timeOf) => {
          const [usdcIs0, logs] = await Promise.all([readUsdcIs0(pair), logClient.getLogs({ address: pair, event: SWAP, fromBlock, toBlock })]);
          return logs.map((l) => {
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
              blockNumber: l.blockNumber,
              logIndex: l.logIndex,
              time: timeOf(l.blockNumber),
            } satisfies PoolTrade;
          });
        }),
      ),
    select: newestFirst,
    enabled: enabled && pair !== zeroAddress,
    refetchInterval: () => pollInterval(pollId, 10_000),
    retry: false,
  });
}
