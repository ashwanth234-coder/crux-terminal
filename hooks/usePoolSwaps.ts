"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address, type Hex } from "viem";
import { batchPoolAbi, guardianAbi } from "@/lib/batchPool";
import { CRUX_SOLVER, TESTNET_USDC } from "@/lib/intents";
import { logClient, pollInterval, scanLogs, tracked, type LogScan } from "@/lib/logs";

const SWAP = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const pairAbi = parseAbi(["function token0() view returns (address)", "function token1() view returns (address)"]);
const ORDER_FILLED = batchPoolAbi.find((x) => x.type === "event" && x.name === "OrderFilled")!;

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

/**
 * A V5 launch's batch pool and token, found from the pair: its token (the non-USDC side) names the pool as
 * guardian(); older tokens don't have one. Read once per pair.
 */
const batchPools = new Map<Address, Promise<{ pool: Address; token: Address } | null>>();
function readBatchPool(pair: Address) {
  let known = batchPools.get(pair);
  if (!known) {
    known = (async () => {
      const [t0, t1] = await Promise.all([
        logClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
        logClient.readContract({ address: pair, abi: pairAbi, functionName: "token1" }),
      ]);
      const token = getAddress(t0) === getAddress(TESTNET_USDC) ? getAddress(t1) : getAddress(t0);
      const pool = await logClient.readContract({ address: token, abi: guardianAbi, functionName: "guardian" }).catch(() => null);
      return pool && pool !== zeroAddress ? { pool: getAddress(pool), token } : null;
    })();
    known.catch(() => batchPools.delete(pair));
    batchPools.set(pair, known);
  }
  return known;
}

const newestFirst = (scan: LogScan<PoolTrade>) => ({ trades: [...scan.items].reverse(), truncated: scan.truncated });

/**
 * Every trade on a graduated launch since graduation, newest first: swaps on its locked Uniswap V2 pool, and for a
 * V5 launch also each order filled in its batch pool's 24-hour batches (at its batch's uniform price).
 */
export function usePoolSwaps(pair: Address, settledAt: number, enabled: boolean, tokenDecimals = 18) {
  const queryKey = ["pool-swaps", pair];
  const pollId = queryKey.join(":");
  return useQuery({
    queryKey,
    queryFn: ({ client }) =>
      tracked(pollId, () =>
        scanLogs(client.getQueryData<LogScan<PoolTrade>>(queryKey), settledAt, async (fromBlock, toBlock) => {
          const [usdcIs0, logs, batch] = await Promise.all([
            readUsdcIs0(pair),
            logClient.getLogs({ address: pair, event: SWAP, fromBlock, toBlock }),
            readBatchPool(pair),
          ]);
          const batchFills = batch
            ? (await logClient.getLogs({ address: batch.pool, event: ORDER_FILLED, args: { token: batch.token }, fromBlock, toBlock })).map((l) => {
                const { isBuy, amountIn, amountOut, owner } = l.args;
                const usdc = isBuy ? amountIn! : amountOut!;
                const tokens = isBuy ? amountOut! : amountIn!;
                return {
                  side: isBuy ? "buy" : "sell",
                  usdc,
                  tokens,
                  price: tokens > BigInt(0) ? Number(usdc) / 1e6 / (Number(tokens) / 10 ** tokenDecimals) : 0,
                  to: owner!,
                  viaIntent: getAddress(owner!) === getAddress(CRUX_SOLVER),
                  txHash: l.transactionHash,
                  blockNumber: l.blockNumber,
                  logIndex: l.logIndex,
                } satisfies Omit<PoolTrade, "time">;
              })
            : [];
          const swaps = logs.map((l) => {
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
            } satisfies Omit<PoolTrade, "time">;
          });
          return [...swaps, ...batchFills].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
        }),
      ),
    select: newestFirst,
    enabled: enabled && pair !== zeroAddress,
    refetchInterval: () => pollInterval(pollId, 10_000),
    retry: false,
  });
}
