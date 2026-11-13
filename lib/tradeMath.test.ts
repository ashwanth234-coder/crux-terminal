import { test } from "node:test";
import assert from "node:assert/strict";
import { afterRead, buysOnTheWay, heldNow, minimumOut, poolMath, poolQuote, quickSellAmount, routerQuote, type Flight } from "./tradeMath/index.ts";

const B = (n: number) => BigInt(n);
const flight = (o: Partial<Flight> & Pick<Flight, "id" | "buy" | "amountIn">): Flight => ({ got: B(0), filledAt: null, ...o });

test("heldNow: the chain's balances at a block, with only the trades that block doesn't hold; never high", () => {
  const read = { block: B(100), at: 10_000, tokens: B(1_000), usdc: B(50) };
  // A buy on its way: its USDC is off now, its tokens aren't counted until it fills.
  assert.deepEqual(heldNow(read, [flight({ id: 1, buy: true, amountIn: B(10) })]), { tokens: B(1_000), usdc: B(40) });
  // Filled after the read's block: its tokens count. Filled in a block the read holds: nothing more.
  assert.deepEqual(heldNow(read, [flight({ id: 1, buy: true, amountIn: B(10), got: B(200), filledAt: 9_000, fillBlock: B(101) })]), { tokens: B(1_200), usdc: B(40) });
  assert.deepEqual(heldNow(read, [flight({ id: 1, buy: true, amountIn: B(10), got: B(200), filledAt: 9_000, fillBlock: B(100) })]), { tokens: B(1_000), usdc: B(50) });
  // A sell's tokens are off from the press; nothing below zero.
  assert.deepEqual(heldNow(read, [flight({ id: 1, buy: false, amountIn: B(5_000) })]).tokens, B(0));
});

test("afterRead: by block when both are known; a read without a block counts recent fills for 8 s", () => {
  const f = flight({ id: 1, buy: true, amountIn: B(1), filledAt: 5_000, fillBlock: B(7) });
  assert.equal(afterRead(f, { block: B(6), at: 0 }), true);
  assert.equal(afterRead(f, { block: B(7), at: 0 }), false);
  assert.equal(afterRead({ ...f, fillBlock: undefined }, { at: 12_000 }), true);
  assert.equal(afterRead({ ...f, fillBlock: undefined }, { at: 14_000 }), false);
});

test("poolQuote: after the trades the reserves don't hold (`got`); after only those on their way (`alone`)", () => {
  const reserves = { usdc: B(10_000_000), tokens: B(10) ** B(27), block: B(100), at: 0 };
  const alone = poolMath({ ...reserves, feeBps: 100 }).buyOut(B(1_000_000));
  assert.deepEqual(poolQuote(reserves, 100, [], true, B(1_000_000)), { got: alone, alone });
  const ahead = flight({ id: 1, buy: true, amountIn: B(1_000_000) });
  const after = poolMath({ ...poolMath({ ...reserves, feeBps: 100 }).after(true, B(1_000_000)), feeBps: 100 }).buyOut(B(1_000_000));
  const q = poolQuote(reserves, 100, [ahead], true, B(1_000_000))!;
  assert.equal(q.got, after);
  assert.equal(q.alone, after, "a trade still on its way counts in both");
  assert.ok(q.got < alone);
});

test("routerQuote: this trade's part after the same-side trades ahead; `alone` after only the ones on their way", async () => {
  // A curve paying 100 for the first unit and less after: quote(x) = 100x − x².
  const quote = async (_buy: boolean, x: bigint) => B(100) * x - x * x;
  const filledLater = flight({ id: 1, buy: true, amountIn: B(1), filledAt: 1, fillBlock: B(9) });
  const onTheWay = flight({ id: 2, buy: true, amountIn: B(1) });
  const q = await routerQuote(quote, B(8), [filledLater, onTheWay], true, B(1));
  assert.equal(q.got, (await quote(true, B(3))) - (await quote(true, B(2))), "after both");
  assert.equal(q.alone, (await quote(true, B(2))) - (await quote(true, B(1))), "after only the one not back yet");
  assert.deepEqual(await routerQuote(quote, B(8), [], true, B(1)), { got: B(99), alone: B(99) });
});

test("minimumOut, quickSellAmount, buysOnTheWay", () => {
  assert.equal(minimumOut({ got: B(1_000), alone: B(1_000) }), B(900));
  assert.equal(minimumOut({ got: B(100), alone: B(1_000) }), B(500), "never under half of what it gets alone");
  assert.equal(quickSellAmount(B(1_000), 25), B(250));
  assert.equal(quickSellAmount(B(999), 100), B(999));
  assert.equal(buysOnTheWay([flight({ id: 1, buy: false, amountIn: B(1) })]), false);
  assert.equal(buysOnTheWay([flight({ id: 1, buy: true, amountIn: B(1) })]), true);
});

test("curveMath: exact to CruxCurveV9 (x·y = k over virtual USDC), null for a buy that reaches graduation", async () => {
  const { curveMath, curveQuote } = await import("./tradeMath/index.ts");
  // $BURST-like: 2,000 virtual USDC, 800M tokens (18 decimals), $10 threshold, 1% fee.
  const virtualUsdc = B(2_000_000_000);
  const supply = B(800_000_000) * B(10) ** B(18);
  const c = { virtualUsdc, k: virtualUsdc * supply, threshold: B(10_000_000), feeBps: 100, realUsdc: B(0), reserveToken: supply };
  const ceil = (a: bigint, b: bigint) => (a + b - B(1)) / b;
  const net = B(1_000_000) - B(10_000);
  assert.equal(curveMath(c).buyOut(B(1_000_000)), supply - ceil(c.k, virtualUsdc + net));
  const after = curveMath(c).after(true, B(1_000_000))!;
  assert.equal(after.realUsdc, net);
  const back = after.reserveToken + B(10) ** B(24);
  const gross = virtualUsdc + net - ceil(c.k, back);
  assert.equal(curveMath(after).sellOut(B(10) ** B(24)), gross - (gross * B(100)) / B(10_000));
  assert.equal(curveMath(c).buyOut(B(11_000_000)), null, "reaches the $10 threshold: the router is asked");
  // With a buy on its way, the next is priced after it; a burst past the threshold isn't priced here.
  const q = curveQuote({ ...c, at: 0 }, [flight({ id: 1, buy: true, amountIn: B(1_000_000) })], true, B(1_000_000))!;
  assert.equal(q.got, curveMath(after).buyOut(B(1_000_000)));
  assert.equal(curveQuote({ ...c, at: 0 }, [flight({ id: 1, buy: true, amountIn: B(9_500_000) })], true, B(1_000_000)), null);
});
