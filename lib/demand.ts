/**
 * The demand curve of a batch auction, with the factory's own rules: a bid counts at every price up to
 * its limit (its tick price on V3), buying quote × 1e36 / price tokens there; on V2 each wallet is also
 * capped at maxAllocationPerWallet tokens. The batch clears at the highest price where demand still
 * covers the sale. The contract's findClearingPrice gives that price exactly; this module draws the curve.
 */

const ONE = BigInt(10) ** BigInt(36);
const ZERO = BigInt(0);

export type BookBid = { quote: bigint; maxPrice: bigint };

/** Tokens (18 decimals) all bids would buy at `price`. */
export function demandAt(book: BookBid[], price: bigint, capTokens: bigint | null): bigint {
  if (price <= ZERO) return ZERO;
  let total = ZERO;
  for (const b of book) {
    if (b.maxPrice < price) continue;
    const tokens = (b.quote * ONE) / price;
    total += capTokens !== null && tokens > capTokens ? capTokens : tokens;
  }
  return total;
}

export type CurvePoint = { price: bigint; tokens: bigint };

/**
 * Points along the curve between lo and hi: log-spaced samples plus both sides of every limit inside the
 * range, so each step down (a bid dropping out) is drawn exactly where it happens.
 */
export function curvePoints(book: BookBid[], lo: bigint, hi: bigint, capTokens: bigint | null, samples = 120): CurvePoint[] {
  if (lo <= ZERO || hi <= lo) return [];
  const prices = new Set<bigint>();
  const ratio = Number(hi) / Number(lo);
  for (let i = 0; i <= samples; i++) prices.add(BigInt(Math.round(Number(lo) * ratio ** (i / samples))));
  for (const b of book) {
    if (b.maxPrice >= lo && b.maxPrice <= hi) {
      prices.add(b.maxPrice);
      prices.add(b.maxPrice + BigInt(1)); // just above the limit, where the bid drops out
    }
  }
  return [...prices]
    .filter((p) => p >= lo && p <= hi)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((price) => ({ price, tokens: demandAt(book, price, capTokens) }));
}

/** The visible price range: from just under the floor to well past the clearing price and every finite limit. */
export function curveRange(book: BookBid[], floor: bigint, clearing: bigint | null, noLimitAbove: bigint): { lo: bigint; hi: bigint } {
  const lo = (floor * BigInt(4)) / BigInt(5);
  let hi = floor * BigInt(4);
  if (clearing && clearing * BigInt(2) > hi) hi = clearing * BigInt(2);
  for (const b of book) {
    if (b.maxPrice < noLimitAbove) {
      const pad = (b.maxPrice * BigInt(5)) / BigInt(4);
      if (pad > hi) hi = pad;
    }
  }
  return { lo, hi };
}
