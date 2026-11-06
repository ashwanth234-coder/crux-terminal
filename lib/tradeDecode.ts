import { getAddress, type Address, type Hex } from "viem";

/**
 * A graduated launch's trades as the terminal and the public API show them, decoded from raw event values. Pure
 * (no chain reads, no path aliases), so the terminal, the API and the unit tests share it; lib/poolTrades reads the
 * logs and calls these.
 */

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
  /**
   * Where it traded: the Uniswap V2 pair, or (V5 / V6, during the anti-sniper window) the batch pool, or (V9, before
   * graduation) the launch's CruxCurveV9; a token that isn't a Crux launch can also trade on a Uniswap V3 pool
   * (lib/externalPools).
   */
  venue: "uniswap-v2" | "uniswap-v3" | "batch-pool" | "curve";
  /** Batch-pool fills only: the batch it cleared in. */
  batch?: number;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  time: number;
  /** The block's time in milliseconds (Base Denim's blockTimestampMs), when the node sent it. */
  timeMs?: number;
};

export type Positioned = { txHash: Hex; blockNumber: bigint; logIndex: number };

/** Test USDC (6 decimals) per whole token. */
export const priceOf = (usdc: bigint, tokens: bigint, tokenDecimals: number) =>
  tokens > BigInt(0) ? Number(usdc) / 1e6 / (Number(tokens) / 10 ** tokenDecimals) : 0;

/** The Crux solver's wallet, or its wallets: the current one and any it replaced (a rotated key). */
export type Solvers = Address | readonly Address[];
const isSolver = (a: Address, solver: Solvers) => (typeof solver === "string" ? [solver] : solver).some((s) => getAddress(s) === getAddress(a));

/** A Uniswap V2 Swap on a token / USDC pair, as a trade. `solver` marks the Crux solver's intent fills. */
export function swapToTrade(
  args: { amount0In: bigint; amount1In: bigint; amount0Out: bigint; amount1Out: bigint; to: Address },
  usdcIs0: boolean,
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
): Omit<PoolTrade, "time"> {
  const usdcIn = usdcIs0 ? args.amount0In : args.amount1In;
  const usdcOut = usdcIs0 ? args.amount0Out : args.amount1Out;
  const tokIn = usdcIs0 ? args.amount1In : args.amount0In;
  const tokOut = usdcIs0 ? args.amount1Out : args.amount0Out;
  const side = usdcIn > BigInt(0) ? "buy" : "sell";
  const usdc = side === "buy" ? usdcIn : usdcOut;
  const tokens = side === "buy" ? tokOut : tokIn;
  return {
    side,
    usdc,
    tokens,
    price: priceOf(usdc, tokens, tokenDecimals),
    to: args.to,
    viaIntent: isSolver(args.to, solver),
    venue: "uniswap-v2",
    ...at,
  };
}

/** A batch pool OrderFilled, as a trade at its batch's uniform price. */
export function fillToTrade(
  args: { batch: bigint; owner: Address; isBuy: boolean; amountIn: bigint; amountOut: bigint },
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
): Omit<PoolTrade, "time"> {
  const usdc = args.isBuy ? args.amountIn : args.amountOut;
  const tokens = args.isBuy ? args.amountOut : args.amountIn;
  return {
    side: args.isBuy ? "buy" : "sell",
    usdc,
    tokens,
    price: priceOf(usdc, tokens, tokenDecimals),
    to: args.owner,
    viaIntent: isSolver(args.owner, solver),
    venue: "batch-pool",
    batch: Number(args.batch),
    ...at,
  };
}

/**
 * A V9 curve Buy or Sell, as a trade. `usdc` is what the trader paid (a buy, fee included) or received (a sell, after
 * the fee). `to` is the event's recipient, the trader (or the Crux solver filling an order for one), never
 * CruxRouterV9, which only passes trades through.
 */
export function curveToTrade(
  args: { isBuy: boolean; usdc: bigint; tokens: bigint; recipient: Address },
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
): Omit<PoolTrade, "time"> {
  return {
    side: args.isBuy ? "buy" : "sell",
    usdc: args.usdc,
    tokens: args.tokens,
    price: priceOf(args.usdc, args.tokens, tokenDecimals),
    to: args.recipient,
    viaIntent: isSolver(args.recipient, solver),
    venue: "curve",
    ...at,
  };
}
