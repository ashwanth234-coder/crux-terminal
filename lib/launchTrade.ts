import { getAddress, type Address } from "viem";

/**
 * Intents for graduated launch tokens. The Crux solver (crux-solver/scripts/pool.ts) prices them from the
 * token's locked Uniswap V2 pool: the pool's quote for the whole batch, less its spread, shared at one
 * uniform price. A single order is quoted here with the same math, so an order alone in its batch fills
 * at this quote, and the signed floor (0.5% under it) only bites when a crowded batch moves the pool.
 */
export const SOLVER_SPREAD_BPS = 30;

const BPS = BigInt(10_000);
const ZERO = BigInt(0);

/** CAIP-19 id of a launch token on Base Sepolia, checksummed: the settlers key assets by keccak256 of this exact string. */
export function launchCaip19(token: Address) {
  return `eip155:84532/erc20:${getAddress(token)}`;
}

/** Uniswap V2 getAmountOut (0.3% fee). */
export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (amountIn <= ZERO || reserveIn <= ZERO || reserveOut <= ZERO) return ZERO;
  const withFee = amountIn * BigInt(997);
  return (withFee * reserveOut) / (reserveIn * BigInt(1000) + withFee);
}

/** Uniswap V2 getAmountIn (0.3% fee); null when the pool can't supply that much. */
export function amountIn(amountOutWanted: bigint, reserveIn: bigint, reserveOut: bigint): bigint | null {
  if (amountOutWanted <= ZERO || reserveIn <= ZERO || amountOutWanted >= reserveOut) return null;
  return (reserveIn * amountOutWanted * BigInt(1000)) / ((reserveOut - amountOutWanted) * BigInt(997)) + BigInt(1);
}

export type PoolReserves = { usdc: bigint; token: bigint };

/** What the solver pays for `input` (USDC on a buy, tokens on a sell): the pool's quote less the spread. */
export function solverQuote(side: "buy" | "sell", input: bigint, r: PoolReserves) {
  const out = side === "buy" ? amountOut(input, r.usdc, r.token) : amountOut(input, r.token, r.usdc);
  return (out * (BPS - BigInt(SOLVER_SPREAD_BPS))) / BPS;
}

/** USDC (base units) a buy of `tokens` costs once the spread is taken; null if the pool is too thin. */
export function buyCost(tokens: bigint, r: PoolReserves) {
  const gross = (tokens * BPS + (BPS - BigInt(SOLVER_SPREAD_BPS)) - BigInt(1)) / (BPS - BigInt(SOLVER_SPREAD_BPS));
  return amountIn(gross, r.usdc, r.token);
}

/** Pool mid price in USDC per whole token (both sides' decimals applied). */
export function midPrice(r: PoolReserves, tokenDecimals: number) {
  if (r.usdc === ZERO || r.token === ZERO) return null;
  return Number(r.usdc) / 1e6 / (Number(r.token) / 10 ** tokenDecimals);
}

/** Prices far below a cent still need their digits: $0.000000005. */
export function fmtTokenPrice(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd >= 0.01) return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${usd.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 })}`;
}
