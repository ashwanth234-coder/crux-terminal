import assert from "node:assert/strict";
import test from "node:test";
import { countdown, refundClock } from "./refundTime.ts";
import { parseSolanaOrders, tokenFromCaip19 } from "./solanaOrders.ts";
import { SOLANA_KEPT_SOL, SOLANA_OPEN_SOL, SOLANA_RENT, SOLANA_RETURNED_SOL, solAmount } from "./solanaEscrow.ts";

test("countdown reads hours and minutes, then mm:ss", () => {
  assert.equal(countdown(5 * 3600 + 41 * 60 + 9), "5h 41m");
  assert.equal(countdown(249), "04:09");
  assert.equal(countdown(-5), "00:00");
});

test("refundClock shows the date only when it isn't today", () => {
  const now = Date.UTC(2026, 9, 31, 10, 0) / 1000;
  assert.doesNotMatch(refundClock(now + 3600, now), /,/);
  assert.match(refundClock(now + 3 * 86_400, now), /,/);
});

test("Solana rent matches the program's account sizes at 6,960 lamports per byte (+128 header)", () => {
  const rent = (bytes: number) => (128 + bytes) * 6_960;
  assert.equal(SOLANA_RENT.order, rent(8 + 197));
  assert.equal(SOLANA_RENT.marker, rent(8));
  assert.equal(SOLANA_RENT.vault, rent(165));
  assert.equal(solAmount(SOLANA_OPEN_SOL), "≈0.0053 SOL");
  assert.equal(solAmount(SOLANA_RETURNED_SOL), "≈0.0023 SOL");
  assert.equal(solAmount(SOLANA_KEPT_SOL), "≈0.0030 SOL");
});

test("stored Solana orders: malformed entries are dropped; the token comes from the CAIP-19", () => {
  const good = { fillHash: "ab", user: "u", token: "0xabc", symbol: "X", amount: "1", fillDeadline: 1, signature: "s" };
  assert.deepEqual(parseSolanaOrders(JSON.stringify([good, { fillHash: 3 }, null])), [good]);
  assert.deepEqual(parseSolanaOrders("not json"), []);
  assert.equal(tokenFromCaip19("eip155:84532/erc20:0xAbC"), "0xabc");
});
