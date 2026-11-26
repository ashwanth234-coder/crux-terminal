import { test } from "node:test";
import assert from "node:assert/strict";
import { deepestPair, poolIdOk } from "./solanaCoins.ts";

const POOL_ID = "0x6990e66bb0735bc40f042aa762b8bd3de7936a9c54f7c9594b1066e7b47aece7";
const COIN = "0x0C959d32561DBC20FDaBd136220e177f7Bab5aFE";
const WETH = "0x4200000000000000000000000000000000000006";

const withPairs = async (pairs: unknown[], run: () => Promise<void>) => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(pairs), { status: 200 })) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
};

test("v4PoolIdAccepted: a Uniswap V4 pool (32-byte id) is the coin's market", async () => {
  await withPairs(
    [{ dexId: "uniswap", labels: ["v4"], pairAddress: POOL_ID, baseToken: { address: COIN }, quoteToken: { address: WETH } }],
    async () => assert.equal((await deepestPair("base", COIN))?.pairAddress, POOL_ID),
  );
});

test("a pair address that is neither 20 nor 32 bytes is still dropped", async () => {
  await withPairs(
    [{ pairAddress: "0x1234", baseToken: { address: "0xAbCdEf0000000000000000000000000000000001" }, quoteToken: { address: WETH } }],
    async () => assert.equal(await deepestPair("base", "0xAbCdEf0000000000000000000000000000000001"), null),
  );
});

test("poolIdOk: a 32-byte V4 pool id only on Base; 20-byte addresses on every EVM network; anything on Solana", () => {
  assert.equal(poolIdOk("base", POOL_ID), true);
  assert.equal(poolIdOk("bsc", POOL_ID), false);
  assert.equal(poolIdOk("bsc", WETH), true);
  assert.equal(poolIdOk("base", WETH), true);
  assert.equal(poolIdOk("bsc", "not-a-pool"), false);
  assert.equal(poolIdOk("solana", "So11111111111111111111111111111111111111112"), true);
});
