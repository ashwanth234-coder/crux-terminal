import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address } from "viem";
import { batchPoolAbi, guardianAbi } from "@/lib/batchPool";
import { CRUX_SOLVER, TESTNET_USDC } from "@/lib/intents";
import { logClient, type ReadLogs } from "@/lib/logs";
import { fillToTrade, swapToTrade, type PoolTrade } from "@/lib/tradeDecode";

export type { PoolTrade };

/**
 * A graduated launch's trades, read from its logs: swaps on its Uniswap V2 pair, and for a V5 / V6 launch each order
 * filled in its batch pool's batches (at the batch's uniform price). Shared by the terminal's tape and chart
 * (usePoolSwaps) and the public market data API (/api/trades, /api/candles), so both always agree. Decoding is in
 * lib/tradeDecode.
 */

export const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const pairAbi = parseAbi(["function token0() view returns (address)", "function token1() view returns (address)"]);
const ORDER_FILLED = batchPoolAbi.find((x) => x.type === "event" && x.name === "OrderFilled")!;

// A pair's token order never changes: read it once per pair.
const usdcIsToken0 = new Map<Address, Promise<boolean>>();
export function readUsdcIs0(pair: Address) {
  let known = usdcIsToken0.get(pair);
  if (!known) {
    known = logClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }).then((t) => getAddress(t) === getAddress(TESTNET_USDC));
    known.catch(() => usdcIsToken0.delete(pair));
    usdcIsToken0.set(pair, known);
  }
  return known;
}

/**
 * A V5 / V6 launch's batch pool and token, found from the pair: its token (the non-USDC side) names the pool as
 * guardian(); older tokens don't have one. Read once per pair.
 */
const batchPools = new Map<Address, Promise<{ pool: Address; token: Address } | null>>();
export function readBatchPool(pair: Address) {
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

/** Reads one block range of a pair's trades (for lib/logs scanLogs), oldest first. */
export function poolTradeReader(pair: Address, tokenDecimals = 18): ReadLogs<PoolTrade> {
  return async (fromBlock, toBlock) => {
    const [usdcIs0, logs, batch] = await Promise.all([
      readUsdcIs0(pair),
      logClient.getLogs({ address: pair, event: SWAP_EVENT, fromBlock, toBlock }),
      readBatchPool(pair),
    ]);
    const fills = batch
      ? (await logClient.getLogs({ address: batch.pool, event: ORDER_FILLED, args: { token: batch.token }, fromBlock, toBlock })).map((l) =>
          fillToTrade(
            { batch: l.args.batch!, owner: l.args.owner!, isBuy: l.args.isBuy!, amountIn: l.args.amountIn!, amountOut: l.args.amountOut! },
            tokenDecimals,
            CRUX_SOLVER,
            { txHash: l.transactionHash, blockNumber: l.blockNumber, logIndex: l.logIndex },
          ),
        )
      : [];
    const swaps = logs.map((l) =>
      swapToTrade(
        {
          amount0In: l.args.amount0In!,
          amount1In: l.args.amount1In!,
          amount0Out: l.args.amount0Out!,
          amount1Out: l.args.amount1Out!,
          to: (l.args.to ?? zeroAddress) as Address,
        },
        usdcIs0,
        tokenDecimals,
        CRUX_SOLVER,
        { txHash: l.transactionHash, blockNumber: l.blockNumber, logIndex: l.logIndex },
      ),
    );
    return [...swaps, ...fills].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  };
}
