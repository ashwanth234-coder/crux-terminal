/**
 * The trade panel's own math for CRUX Account market trades on a V9 launch, in one place: what a trade should get,
 * its signed minimum, what the trader holds while trades are on their way, and what a quick sell sells. The page
 * (components/launch/V9Launch.tsx) runs exactly this, and so does the solver's end-to-end burst test
 * (crux-solver scripts/fork-burst.ts), so a burst that passes there behaves the same on the site. No imports: it runs
 * in the browser and under plain Node.
 */

/**
 * A trade this page has pressed and not yet seen in every read. `got`: what it gets (the relay's exact amount once
 * filled). `sent`: its request has gone to the relay (false while its price is still being read and it's signed).
 */
export type Flight = { id: number; buy: boolean; amountIn: bigint; got: bigint; filledAt: number | null; fillBlock?: bigint; sent?: boolean };

/**
 * On its way: not back from the relay. The relay measures its price guard after the account's trades it has and
 * hasn't answered; the page posts a burst in press order, so every one pressed earlier is there first.
 */
const atRelay = (f: Flight) => f.filledAt === null;

/** Balances (or a pool's reserves) read from the chain at a known block, and when (ms). */
export type AtBlock = { block: bigint; at: number };
export type HeldRead = AtBlock & { tokens: bigint; usdc: bigint };
export type Reserves = { usdc: bigint; tokens: bigint };

const ZERO = BigInt(0);
const BPS = BigInt(10_000);

/** The signed minimum's default slippage: 10% under what it should get. */
export const SLIPPAGE_BPS = BigInt(1_000);
/** How long a filled trade counts on top of a reserves read with no block (the shared cache's). */
export const PRICE_WINDOW_MS = 8_000;

/**
 * CruxRouterV9's pool math on a graduated launch's pool: its fee off a buy's USDC (or a sell's proceeds), then
 * Uniswap V2's getAmountOut with its 0.3%. Exact to the router's quotes.
 */
export function poolMath(p: Reserves & { feeBps: number }) {
  const fee = BigInt(p.feeBps);
  const ONE = BigInt(1);
  const swap = (a: bigint, rin: bigint, rout: bigint) => (a <= ZERO || rin <= ZERO || rout <= ZERO ? ZERO : (a * BigInt(997) * rout) / (rin * BigInt(1000) + a * BigInt(997)));
  const buyOut = (usdc: bigint) => swap(usdc - (usdc * fee) / BPS, p.usdc, p.tokens);
  const sellOut = (tokens: bigint) => {
    const gross = swap(tokens, p.tokens, p.usdc);
    return gross - (gross * fee) / BPS;
  };
  const tokensFor = (usdcOut: bigint) => {
    if (usdcOut <= ZERO) return ZERO;
    const gross = (usdcOut * BPS + (BPS - fee) - ONE) / (BPS - fee);
    if (gross >= p.usdc) return null;
    let t = (p.tokens * gross * BigInt(1000)) / ((p.usdc - gross) * BigInt(997)) + ONE;
    for (let i = 0; i < 4 && sellOut(t) < usdcOut; i++) t += t / BigInt(1_000_000) + ONE;
    return t;
  };
  /** The pool once a trade of `amount` (USDC for a buy, tokens for a sell) has gone through it. */
  const after = (isBuy: boolean, amount: bigint): Reserves => {
    if (isBuy) {
      const net = amount - (amount * fee) / BPS;
      return { usdc: p.usdc + net, tokens: p.tokens - swap(net, p.usdc, p.tokens) };
    }
    return { usdc: p.usdc - swap(amount, p.tokens, p.usdc), tokens: p.tokens + amount };
  };
  return { buyOut, sellOut, tokensFor, after };
}

/**
 * Whether a read made at `read` (a block, or only a time for the shared cache's reads) doesn't hold trade `f` yet: it
 * isn't filled, or it filled in a later block (or, its block unknown, lately).
 */
export function afterRead(f: Flight, read: { block?: bigint; at: number }, windowMs = 2_000): boolean {
  if (f.filledAt === null) return true;
  if (read.block !== undefined) return f.fillBlock !== undefined ? f.fillBlock > read.block : f.filledAt > read.at - windowMs;
  return f.filledAt > read.at - PRICE_WINDOW_MS;
}

/**
 * What the trader holds: the balances read at a known block, with this page's trades that block doesn't hold. A buy's
 * tokens count only once filled (they arrive in its fill); a sell's tokens are off from the click until a read after
 * its fill. Any doubt counts the holding low, never high, so a sell of everything never asks for tokens that aren't
 * there.
 */
export function heldNow(read: HeldRead, flights: readonly Flight[]): { tokens: bigint; usdc: bigint } {
  let tokens = read.tokens;
  let usdc = read.usdc;
  for (const f of flights) {
    if (!afterRead(f, read)) continue;
    if (f.buy) {
      usdc -= f.amountIn;
      if (f.filledAt !== null) tokens += f.got;
    } else {
      tokens -= f.amountIn;
      if (f.filledAt !== null) usdc += f.got;
    }
  }
  return { tokens: tokens > ZERO ? tokens : ZERO, usdc: usdc > ZERO ? usdc : ZERO };
}

/**
 * On a graduated pool: what a trade gets after this page's trades the reserves read doesn't hold (`got`), and after
 * only the ones on their way at the relay (`alone`: the minimum's floor; the relay measures its guard after exactly
 * those, so a floor that also counted presses not sent yet sat under the guard and was refused).
 */
export function poolQuote(reserves: Reserves & { block?: bigint; at: number }, feeBps: number, flights: readonly Flight[], buy: boolean, amount: bigint): { got: bigint; alone: bigint } | null {
  if (reserves.usdc <= ZERO || reserves.tokens <= ZERO) return null;
  const step = (r: Reserves, isBuy: boolean, a: bigint) => poolMath({ ...r, feeBps }).after(isBuy, a);
  let surely: Reserves = { usdc: reserves.usdc, tokens: reserves.tokens };
  let r: Reserves = { usdc: reserves.usdc, tokens: reserves.tokens };
  for (const f of flights) {
    if (!afterRead(f, reserves)) continue;
    r = step(r, f.buy, f.amountIn);
    // `alone` leaves out only presses the relay doesn't have yet (not sent): filled ones the read misses count.
    if (f.filledAt !== null || atRelay(f)) surely = step(surely, f.buy, f.amountIn);
  }
  const out = (x: Reserves) => (x.usdc > ZERO && x.tokens > ZERO ? (buy ? poolMath({ ...x, feeBps }).buyOut(amount) : poolMath({ ...x, feeBps }).sellOut(amount)) : ZERO);
  return { got: out(r), alone: out(surely) };
}

/**
 * On the curve (or anywhere the router is asked): the same from the router's own quotes at one block. The trades of
 * this side still ahead of it (not back, or filled after that block) are quoted together with it, and its part is
 * what the router pays for all of them less what it pays for the ones ahead. A trade the other way only helps it.
 */
export async function routerQuote(
  quote: (buy: boolean, amount: bigint, block: bigint) => Promise<bigint>,
  block: bigint,
  flights: readonly Flight[],
  buy: boolean,
  amount: bigint,
): Promise<{ got: bigint; alone: bigint }> {
  const sum = (fs: readonly Flight[]) => fs.reduce((s, f) => s + f.amountIn, ZERO);
  const ahead = sum(flights.filter((f) => f.buy === buy && (f.filledAt === null || (f.fillBlock !== undefined && f.fillBlock > block))));
  // `alone` is after the ones still on their way only (not back from the relay): the relay measures its guard there.
  // (Quoted on its own at the price now, half of it sat above what the fifth $1 buy in a row on a thin curve could get
  // in its turn, and the solver had to leave it out.)
  const unfilled = sum(flights.filter((f) => f.buy === buy && atRelay(f)));
  const part = async (before: bigint) => {
    if (before === ZERO) return quote(buy, amount, block);
    const [all, first] = await Promise.all([quote(buy, before + amount, block), quote(buy, before, block)]);
    return all > first ? all - first : ZERO;
  };
  const [got, alone] = await Promise.all([part(ahead), unfilled === ahead ? null : part(unfilled)]);
  return { got, alone: alone ?? got };
}

/** A V9 curve's state: its fixed virtual USDC, k, threshold and fee, and the real USDC and tokens it holds now. */
export type CurveState = { virtualUsdc: bigint; k: bigint; threshold: bigint; feeBps: number; realUsdc: bigint; reserveToken: bigint };

const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;

/**
 * CruxCurveV9's own math (x · y = k over virtual USDC), exact to its quoteBuy / quoteSell: a buy's fee off its USDC,
 * then y − ⌈k / (x + net)⌉ tokens; a sell's x − ⌈k / (y + tokens)⌉ USDC, then its fee. `buyOut` is null for a buy that
 * would reach the graduation threshold (the rest goes into the new pool: the router is asked for that one).
 */
export function curveMath(c: CurveState) {
  const fee = BigInt(c.feeBps);
  const buy = (usdcIn: bigint) => {
    const f = (usdcIn * fee) / BPS;
    const net = usdcIn - f;
    if (c.realUsdc + net >= c.threshold) return null;
    const newY = ceilDiv(c.k, c.virtualUsdc + c.realUsdc + net);
    return { net, tokens: c.reserveToken > newY ? c.reserveToken - newY : ZERO };
  };
  const sellGross = (tokensIn: bigint) => {
    const x = c.virtualUsdc + c.realUsdc;
    const newX = ceilDiv(c.k, c.reserveToken + tokensIn);
    return x > newX ? x - newX : ZERO;
  };
  const buyOut = (usdcIn: bigint) => (usdcIn <= ZERO ? ZERO : (buy(usdcIn)?.tokens ?? null));
  const sellOut = (tokensIn: bigint) => {
    if (tokensIn <= ZERO) return ZERO;
    const gross = sellGross(tokensIn);
    return gross - (gross * fee) / BPS;
  };
  /** The curve once a trade has gone through it, or null for a buy that reaches graduation. */
  const after = (isBuy: boolean, amount: bigint): CurveState | null => {
    if (isBuy) {
      const b = buy(amount);
      return b ? { ...c, realUsdc: c.realUsdc + b.net, reserveToken: c.reserveToken - b.tokens } : null;
    }
    return { ...c, realUsdc: c.realUsdc - sellGross(amount), reserveToken: c.reserveToken + amount };
  };
  return { buyOut, sellOut, after };
}

/**
 * On the curve: what a trade gets after this page's trades the curve read doesn't hold (`got`), and after the ones
 * on their way (`alone`), worked out here with no chain read (the router read took ~0.3 s before every press could be
 * signed). Null when any of it reaches graduation: then the router is asked (routerQuote).
 */
export function curveQuote(state: CurveState & { block?: bigint; at: number }, flights: readonly Flight[], buy: boolean, amount: bigint): { got: bigint; alone: bigint } | null {
  let r: CurveState | null = state;
  let surely: CurveState | null = state;
  for (const f of flights) {
    if (!afterRead(f, state)) continue;
    r = r && curveMath(r).after(f.buy, f.amountIn);
    if (f.filledAt !== null || atRelay(f)) surely = surely && curveMath(surely).after(f.buy, f.amountIn);
  }
  if (!r || !surely) return null;
  const out = (c: CurveState) => (buy ? curveMath(c).buyOut(amount) : curveMath(c).sellOut(amount));
  const got = out(r);
  const alone = out(surely);
  return got === null || alone === null ? null : { got, alone };
}

/** The signed minimum: `slippageBps` under what it should get, never under half of what it gets on its own now. */
export function minimumOut(q: { got: bigint; alone: bigint }, slippageBps = SLIPPAGE_BPS): bigint {
  const under = (q.got * (BPS - slippageBps)) / BPS;
  return under > q.alone / BigInt(2) ? under : q.alone / BigInt(2);
}

/** A quick sell's size: `pct` (0–100) of what the trader holds now. 100 is everything. */
export function quickSellAmount(held: bigint, pct: number): bigint {
  return pct >= 100 ? held : (held * BigInt(Math.round(pct * 100))) / BPS;
}

/**
 * Whether a quick sell can be sized and priced now: no buy still on its way (their tokens arrive with their fills), and
 * the pool read (`readBlock`) is from a block that holds every fill (so the price isn't a guess about them).
 */
export function readyToSell(flights: readonly Flight[], readBlock: bigint | undefined): boolean {
  if (buysOnTheWay(flights)) return false;
  const last = flights.reduce((m, f) => (f.fillBlock !== undefined && f.fillBlock > m ? f.fillBlock : m), ZERO);
  return readBlock === undefined || readBlock >= last;
}

/** Whether any buy is still on its way (a Sell All waits for them: their tokens arrive with their fills). */
export const buysOnTheWay = (flights: readonly Flight[]) => flights.some((f) => f.buy && f.filledAt === null);
