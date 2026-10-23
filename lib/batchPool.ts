import { parseAbi } from "viem";

/**
 * CruxBatchPool (crux-contracts/src/CruxBatchPool.sol): where a CruxFactoryV5 launch trades for its first 24 hours
 * after graduation, only in 60-second batches cleared at one uniform price on-chain, before its liquidity migrates
 * into the token's Uniswap V2 pair. A V5 token (CruxTokenV2) names its pool as `guardian()`; older tokens have none.
 */
export const batchPoolAbi = parseAbi([
  "function pools(address token) view returns (uint128 reserveQuote, uint128 reserveToken, address pair, uint64 seededAt, bool migrated)",
  "function batchOrders(address token, uint256 batch) view returns ((address owner, uint128 amountIn, uint128 minOut)[] buys, (address owner, uint128 amountIn, uint128 minOut)[] sells)",
  "function pendingBatches(address token) view returns (uint256[])",
  "function buy(address token, uint256 quoteIn, uint256 minTokensOut) returns (uint256 batch)",
  "function sell(address token, uint256 tokensIn, uint256 minQuoteOut) returns (uint256 batch)",
  "function clear(address token, uint256 maxBatches) returns (uint256 cleared)",
  "function migrate(address token) returns (uint256 liquidity)",
  "event OrderPlaced(address indexed token, uint256 indexed batch, address indexed owner, bool isBuy, uint256 amountIn, uint256 minOut)",
  "event OrderFilled(address indexed token, uint256 indexed batch, address indexed owner, bool isBuy, uint256 amountIn, uint256 amountOut)",
  "event OrderRefunded(address indexed token, uint256 indexed batch, address indexed owner, bool isBuy, uint256 amountIn)",
  "error ProtectionOver()",
  "error AlreadyMigrated()",
  "error AlreadyOrdered()",
  "error BatchFull()",
  "error ZeroAmount()",
  "error OrderTooLarge()",
]);

export const guardianAbi = parseAbi(["function guardian() view returns (address)"]);

export const BATCH_SECONDS = 60;
export const PROTECTION_SECONDS = 24 * 3600;

/** The batch an order placed at `now` (unix seconds) lands in, and when it closes. */
export function batchAt(seededAt: number, now: number) {
  const batch = Math.max(0, Math.floor((now - seededAt) / BATCH_SECONDS));
  return { batch, closesAt: seededAt + (batch + 1) * BATCH_SECONDS };
}

/** Uniswap V2's getAmountOut (0.3% fee): what an order alone in its batch receives. */
export function soloOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= BigInt(0) || reserveIn <= BigInt(0) || reserveOut <= BigInt(0)) return BigInt(0);
  const withFee = amountIn * BigInt(997);
  return (withFee * reserveOut) / (reserveIn * BigInt(1000) + withFee);
}

export const POOL_ERRORS: Record<string, string> = {
  ProtectionOver: "The 24-hour batch window is over; this token now trades on Uniswap. Nothing was sent.",
  AlreadyMigrated: "This token has moved to Uniswap; trade it there. Nothing was sent.",
  AlreadyOrdered: "You already have an order on this side of the current batch. Wait for the next batch (under a minute).",
  BatchFull: "This batch is full (50 orders a side). Try again in the next batch, under a minute away.",
  ZeroAmount: "Enter an amount above zero.",
  OrderTooLarge: "That order is larger than the pool accepts.",
};
