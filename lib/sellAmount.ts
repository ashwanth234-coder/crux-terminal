/**
 * The tokens a sell needs to bring back about `usd` (USDC units), from a holding of `held` tokens that sells for
 * `heldUsd` in full: a first guess in proportion, then corrected by what each guess sells for (a smaller sale moves
 * the price less, so it returns a little more per token), at most three quotes, stopping within 0.5%. Never more than
 * the holding.
 */
export async function tokensForUsdc(usd: bigint, held: bigint, heldUsd: bigint, quoteSell: (tokens: bigint) => Promise<bigint>): Promise<bigint> {
  if (usd <= BigInt(0) || held <= BigInt(0) || heldUsd <= BigInt(0)) return BigInt(0);
  if (usd >= heldUsd) return held;
  let tokens = (held * usd) / heldUsd;
  for (let i = 0; i < 3; i++) {
    const got = await quoteSell(tokens);
    if (got <= BigInt(0)) break;
    const off = got > usd ? got - usd : usd - got;
    if (off * BigInt(200) <= usd) break;
    tokens = (tokens * usd) / got;
    if (tokens > held) return held;
  }
  return tokens > held ? held : tokens;
}
