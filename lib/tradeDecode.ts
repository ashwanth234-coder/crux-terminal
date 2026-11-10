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
  /** USDC per whole token at this fill (incl. Uniswap's fee): the trade's average price. */
  price: number;
  /**
   * USDC per whole token right after the trade (the pool's or curve's reserves once it landed), when the log said
   * them. Charts draw this: on a small pool a big trade's average sits far from where it leaves the price (a sell
   * from $69 to $13 averages $39), so a following buy drew a red candle though the price rose.
   */
  priceAfter?: number;
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

/** Reserves right after a trade: USDC and tokens, in base units. */
export type ReservesAfter = { usdc: bigint; tokens: bigint };

/**
 * A Uniswap V2 Swap on a token / USDC pair, as a trade. `solver` marks the Crux solver's intent fills. `after`: the
 * pair's reserves from the Sync it emits just before the Swap, for the price it leaves.
 */
export function swapToTrade(
  args: { amount0In: bigint; amount1In: bigint; amount0Out: bigint; amount1Out: bigint; to: Address },
  usdcIs0: boolean,
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
  after?: ReservesAfter,
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
    ...(after ? { priceAfter: priceOf(after.usdc, after.tokens, tokenDecimals) } : {}),
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
 * CruxRouterV9, which only passes trades through. `after`: the curve's USDC side (virtual plus real) and token
 * reserve once the trade landed (its event's realUsdcAfter and reserveTokenAfter), for the price it leaves.
 */
export function curveToTrade(
  args: { isBuy: boolean; usdc: bigint; tokens: bigint; recipient: Address },
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
  after?: ReservesAfter,
): Omit<PoolTrade, "time"> {
  return {
    side: args.isBuy ? "buy" : "sell",
    usdc: args.usdc,
    tokens: args.tokens,
    price: priceOf(args.usdc, args.tokens, tokenDecimals),
    ...(after ? { priceAfter: priceOf(after.usdc, after.tokens, tokenDecimals) } : {}),
    to: args.recipient,
    viaIntent: isSolver(args.recipient, solver),
    venue: "curve",
    ...at,
  };
}

/** V9: a fair opening's settlement (its OpeningSettled event): the USDC it used (fee included), the fee, the tokens. */
export type OpeningSettlement = { used: bigint; fee: bigint; tokens: bigint };

/**
 * A V9 fair-opening claim (OpeningClaimed) as a buy: the recipient's tokens at the opening's one price (USDC used over
 * tokens bought, fee included), credited to the recipient. `priceAfter` is the curve's price once the opening
 * settled. The opening is always the curve's first buy, so with k = virtualUsdc × curveSupply its USDC side is then
 * virtualUsdc + net and its token side virtualUsdc × tokens / net. Null for an empty opening or claim.
 */
export function openingClaimToTrade(
  args: { recipient: Address; tokens: bigint },
  settled: OpeningSettlement,
  virtualUsdc: bigint | undefined,
  tokenDecimals: number,
  solver: Solvers,
  at: Positioned,
): Omit<PoolTrade, "time"> | null {
  const zero = BigInt(0);
  if (settled.tokens === zero || args.tokens === zero || settled.used === zero) return null;
  const net = settled.used - settled.fee;
  return {
    side: "buy",
    usdc: (args.tokens * settled.used) / settled.tokens,
    tokens: args.tokens,
    price: priceOf(settled.used, settled.tokens, tokenDecimals),
    ...(virtualUsdc !== undefined && virtualUsdc > zero && net > zero ? { priceAfter: priceOf(virtualUsdc + net, (virtualUsdc * settled.tokens) / net, tokenDecimals) } : {}),
    to: args.recipient,
    viaIntent: isSolver(args.recipient, solver),
    venue: "curve",
    ...at,
  };
}

/**
 * An opening's settlement from the curve's stored values (openingUsed, openingTokens, k, virtualUsdc), so no event
 * needs finding. The opening is the curve's first buy: its token side after is k / (virtualUsdc + net), so
 * net = k / (curveSupply − tokens) − virtualUsdc with curveSupply = k / virtualUsdc, and the fee is what's left of used.
 * Null when nothing was bought.
 */
export function settlementFromState(s: { used: bigint; tokens: bigint; k: bigint; virtualUsdc: bigint }): OpeningSettlement | null {
  const zero = BigInt(0);
  if (s.used === zero || s.tokens === zero || s.virtualUsdc === zero) return null;
  const supply = s.k / s.virtualUsdc;
  if (supply <= s.tokens) return null;
  const net = s.k / (supply - s.tokens) - s.virtualUsdc;
  return { used: s.used, fee: net > zero && net < s.used ? s.used - net : zero, tokens: s.tokens };
}
