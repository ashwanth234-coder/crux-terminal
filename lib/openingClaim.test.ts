import { test } from "node:test";
import assert from "node:assert/strict";

const ME = "0x9b55250592327E5696598852a369cFF350155aFE";
const SOLVER = "0xDEbbE137f2AB252e28d1070F687010C0909d0492";
const at = { txHash: `0x${"ab".repeat(32)}` as `0x${string}`, blockNumber: BigInt(1), logIndex: 0 };

test("openingClaimToTrade: $BT's opening ($10 in, 643.9M tokens) is a buy at its one price; the curve is left at ~8e-8", async () => {
  const { openingClaimToTrade } = await import("./tradeDecode.ts");
  // V = $2.40, 800M on the curve: $10 gross, $0.10 fee, $9.90 net buys 800M × 9.9 / 12.3 tokens.
  const tokens = (BigInt(800_000_000) * BigInt(10) ** BigInt(18) * BigInt(99)) / BigInt(123);
  const settled = { used: BigInt(10_000_000), fee: BigInt(100_000), tokens };
  const t = openingClaimToTrade({ recipient: SOLVER, tokens }, settled, BigInt(2_400_000), 18, [SOLVER], at)!;
  assert.equal(t.side, "buy");
  assert.equal(t.usdc, BigInt(10_000_000));
  assert.ok(Math.abs(t.price - 10 / 643_902_439) / t.price < 1e-6, `price ${t.price}`);
  // The curve's price after: (2.4 + 9.9) / (800M − 643.9M) ≈ 7.88e-8, what the next curve buy starts from.
  assert.ok(Math.abs(t.priceAfter! - 12.3 / 156_097_561) / t.priceAfter! < 1e-6, `after ${t.priceAfter}`);
  assert.equal(t.viaIntent, true, "claimed to the solver for a CRUX Account");
  // A share of it: its part of the USDC.
  const half = openingClaimToTrade({ recipient: ME, tokens: tokens / BigInt(2) }, settled, BigInt(2_400_000), 18, [SOLVER], at)!;
  assert.equal(half.usdc, BigInt(5_000_000));
  assert.equal(half.viaIntent, false);
  assert.equal(openingClaimToTrade({ recipient: ME, tokens: BigInt(0) }, settled, BigInt(2_400_000), 18, [SOLVER], at), null);
});

test("settlementFromState: $BT's stored values give back its $0.10 fee, so the price after matches", async () => {
  const { settlementFromState } = await import("./tradeDecode.ts");
  const V = BigInt(2_400_000);
  const S = BigInt(800_000_000) * BigInt(10) ** BigInt(18);
  const k = V * S;
  const net = BigInt(9_900_000);
  // The curve's own math: tokens = S − ceil(k / (V + net)).
  const tokens = S - (k + V + net - BigInt(1)) / (V + net);
  const s = settlementFromState({ used: BigInt(10_000_000), tokens, k, virtualUsdc: V })!;
  assert.ok(s.fee >= BigInt(99_999) && s.fee <= BigInt(100_001), `fee ${s.fee}`);
  assert.equal(s.tokens, tokens);
  assert.equal(settlementFromState({ used: BigInt(0), tokens: BigInt(0), k, virtualUsdc: V }), null);
});
