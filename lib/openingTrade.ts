import { formatUnits } from "viem";
import { PRICE_DECIMALS, PRICE_DENOMINATOR, type AuctionV2 } from "./launchV2.ts";

/** A graduated launch's opening, as the first trade on its chart and in its trades list. */
export type OpeningTrade = { time: number; price: number; usdc: bigint; tokens: bigint; buyers: number };

/**
 * The opening cleared the whole sale at one price at graduation: that is the token's first trade, even though it
 * isn't a pool swap (bids are claimed from the factory, and buys at open are filled from the solver's claim). Without
 * it a new launch whose only activity is its opening would draw an empty chart. Null before graduation.
 */
export function openingTrade(a: Pick<AuctionV2, "status" | "settledAt" | "clearingPrice" | "saleSupply" | "bidderCount">): OpeningTrade | null {
  if (a.status !== 1 || a.clearingPrice === BigInt(0) || a.settledAt === 0) return null;
  return {
    time: a.settledAt,
    price: Number(formatUnits(a.clearingPrice, PRICE_DECIMALS)),
    usdc: (a.saleSupply * a.clearingPrice) / PRICE_DENOMINATOR,
    tokens: a.saleSupply,
    buyers: a.bidderCount,
  };
}
