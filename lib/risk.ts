import { amountOut, solverQuote, type PoolReserves } from "./launchTrade";

/**
 * Smart Risk Preview math. Everything here mirrors what will actually execute: the factory's clearing and
 * graduation rules for a bid, and the solver's pool quote (crux-solver/scripts/pool.ts) for an intent. It's
 * an estimate only where the future is unknown (other bids, other trades), and the UI says so.
 */

const PRICE_ONE = BigInt(10) ** BigInt(36); // CruxFactory PRICE_DENOMINATOR: tokens = quote × 1e36 / price
const BPS = BigInt(10_000);
const ZERO = BigInt(0);

/** CruxFactoryV2/V3 graduation split: 60% sale, 30% LP; the pool gets lpQuote = raise × 3000 / 6000. */
const SALE_BPS = BigInt(6_000);
const LP_BPS = BigInt(3_000);

/** Fraction lost versus a reference value, as a percentage (positive = worse). */
const lossPct = (got: number, fair: number) => (fair > 0 ? (1 - got / fair) * 100 : 0);

export type BidRisk = {
  /** Tokens this bid buys if the batch cleared at the projected price (before anyone else bids). */
  tokensAtProjected: bigint | null;
  /** The worst price the bid can clear at: its limit (after tick rounding), or null for no limit. */
  worstPrice: bigint | null;
  /** Fewest tokens the bid receives if it fills at all (at its limit). Null without a limit. */
  minTokens: bigint | null;
  /** Selling those tokens into the freshly seeded pool right after graduation. */
  exit: { usdcBack: bigint; lossPct: number } | null;
  /** Which price the exit estimate assumes. */
  basis: "projected" | "floor";
};

/**
 * A bid of `quote` (USDC base units) with an optional limit. The pool that graduation seeds is fully determined
 * by the clearing price: lpQuote = raise × LP/SALE, lpTokens = 30% of supply. So the exit impact of dumping
 * your allocation is known in advance, given a clearing price.
 */
export function bidRisk(args: {
  quote: bigint;
  /** Effective limit (already rounded to its tick on V3), or null for no limit. */
  limit: bigint | null;
  projected: bigint | null;
  floor: bigint;
  saleSupply: bigint;
  totalSupply: bigint;
}): BidRisk {
  const { quote, limit, projected, floor, saleSupply, totalSupply } = args;
  const price = projected ?? floor;
  const basis = projected ? "projected" : "floor";
  if (quote <= ZERO || price <= ZERO) return { tokensAtProjected: null, worstPrice: limit, minTokens: null, exit: null, basis };

  const tokens = (quote * PRICE_ONE) / price;
  const minTokens = limit ? (quote * PRICE_ONE) / limit : null;

  // The pool at graduation, if the batch clears at `price` and the whole sale fills.
  const raise = (saleSupply * price) / PRICE_ONE;
  const poolUsdc = (raise * LP_BPS) / SALE_BPS;
  const poolTokens = (totalSupply * LP_BPS) / BPS;
  const back = amountOut(tokens, poolTokens, poolUsdc);
  const paid = (tokens * price) / PRICE_ONE;

  return {
    tokensAtProjected: projected ? tokens : null,
    worstPrice: limit,
    minTokens,
    exit: { usdcBack: back, lossPct: lossPct(Number(back), Number(paid)) },
    basis,
  };
}

export type TradeRisk = {
  /** What the solver delivers for this input, alone in its batch (tokens on a buy, USDC on a sell). */
  out: bigint;
  /** Cost of the trade versus the pool's mid price: price impact, Uniswap's 0.3% fee and the solver spread. */
  slippagePct: number;
  /** Pool impact exactly as the solver measures it: the pool's output short of the mid price, 0.3% fee included. */
  poolImpactPct: number;
  /** Buy only: selling the tokens straight back afterwards returns this much (round trip). */
  roundTrip: { usdcBack: bigint; lossPct: number } | null;
};

/** An intent trade against a graduated launch's locked pool, quoted exactly as the solver fills it. */
export function tradeRisk(side: "buy" | "sell", input: bigint, r: PoolReserves): TradeRisk | null {
  if (input <= ZERO || r.usdc <= ZERO || r.token <= ZERO) return null;
  const out = solverQuote(side, input, r);
  if (out <= ZERO) return null;

  const mid = Number(r.usdc) / Number(r.token); // USDC base units per token base unit
  if (side === "buy") {
    const fairTokens = Number(input) / mid;
    // The pool after the solver's swap: about `input` USDC in, the pool's own output taken out.
    const poolOut = amountOut(input, r.usdc, r.token);
    const after: PoolReserves = { usdc: r.usdc + input, token: r.token - poolOut };
    const back = solverQuote("sell", out, after);
    return {
      out,
      slippagePct: lossPct(Number(out), fairTokens),
      poolImpactPct: lossPct(Number(poolOut), fairTokens),
      roundTrip: { usdcBack: back, lossPct: lossPct(Number(back), Number(input)) },
    };
  }
  const fairUsdc = Number(input) * mid;
  const poolOut = amountOut(input, r.token, r.usdc);
  return {
    out,
    slippagePct: lossPct(Number(out), fairUsdc),
    poolImpactPct: lossPct(Number(poolOut), fairUsdc),
    roundTrip: null,
  };
}

/** The solver skips any batch side that would move a pool more than this (crux-solver MAX_IMPACT_BPS default). */
export const SOLVER_MAX_IMPACT_PCT = 10;
