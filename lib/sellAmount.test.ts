import { test } from "node:test";
import assert from "node:assert/strict";
import { tokensForUsdc } from "./sellAmount.ts";

// A Uniswap V2 pool (0.3% fee) like $MT's after graduation: 1.2e9 tokens against $13 of USDC (6 decimals).
const R_TOK = BigInt(12) * BigInt(10) ** BigInt(26);
const R_USD = BigInt(13_000_000);
const sellQuote = async (tokens: bigint) => (tokens * BigInt(997) * R_USD) / (R_TOK * BigInt(1000) + tokens * BigInt(997));

test("tokensForUsdc: a USDC amount becomes the tokens that sell for about that much", async () => {
  const held = BigInt(476_240_062) * BigInt(10) ** BigInt(18);
  const heldUsd = await sellQuote(held);
  for (const usd of [BigInt(500_000), BigInt(1_000_000), BigInt(2_000_000)]) {
    const tokens = await tokensForUsdc(usd, held, heldUsd, sellQuote);
    const back = await sellQuote(tokens);
    const off = Number(back > usd ? back - usd : usd - back) / Number(usd);
    assert.ok(off < 0.006, `$${Number(usd) / 1e6}: sells for $${Number(back) / 1e6} (${(off * 100).toFixed(2)}% off)`);
    assert.ok(tokens <= held);
  }
});

test("tokensForUsdc: at or above what the holding sells for, it sells the holding; nothing for nothing", async () => {
  const held = BigInt(10) ** BigInt(26);
  const heldUsd = await sellQuote(held);
  assert.equal(await tokensForUsdc(heldUsd, held, heldUsd, sellQuote), held);
  assert.equal(await tokensForUsdc(heldUsd * BigInt(2), held, heldUsd, sellQuote), held);
  assert.equal(await tokensForUsdc(BigInt(0), held, heldUsd, sellQuote), BigInt(0));
});
