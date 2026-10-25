import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { buildHolders, type HolderContext } from "./holders.ts";
import type { PoolTrade } from "./tradeDecode.ts";
import type { TokenTransfer } from "../hooks/useTokenTransfers.ts";

const e18 = BigInt(10) ** BigInt(18);
const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;
const POOL = "0x3333333333333333333333333333333333333333" as Address;
const PAIR = "0x4444444444444444444444444444444444444444" as Address;
const ctx: HolderContext = {
  totalSupply: BigInt(1_000_000_000) * e18,
  clearingPrice: 0.000001,
  creator: "0x5555555555555555555555555555555555555555",
  factory: "0x6666666666666666666666666666666666666666",
  pair: PAIR,
  solver: "0x7777777777777777777777777777777777777777",
  destinationSettler: "0x8888888888888888888888888888888888888888",
  me: A,
  batchPool: POOL,
};
const CLEAR = "0xc1ea" as Hex;

const payout = (to: Address, tokens: bigint, logIndex: number): TokenTransfer => ({
  kind: "transfer",
  from: POOL,
  to,
  value: tokens * e18,
  txHash: CLEAR,
  blockNumber: BigInt(5),
  logIndex,
  time: 100,
});
const fill = (owner: Address, tokens: bigint, usdc: bigint, price: number, logIndex: number): PoolTrade => ({
  side: "buy",
  usdc,
  tokens: tokens * e18,
  price,
  to: owner,
  viaIntent: false,
  venue: "batch-pool",
  batch: 0,
  txHash: CLEAR,
  blockNumber: BigInt(5),
  logIndex,
  time: 100,
});

test("batch-pool fills: each payout in one clear is priced at its owner's fill, not tagged as a holder", () => {
  // One batch clears two buyers in the same transaction (the batch's single price, rounded per fill).
  const rows = buildHolders(
    [payout(A, BigInt(1_000), 1), payout(B, BigInt(3_000), 3)],
    [fill(B, BigInt(3_000), BigInt(6_000), 0.002, 2), fill(A, BigInt(1_000), BigInt(2_100), 0.0021, 0)],
    ctx,
  );
  const a = rows.find((r) => r.address === A)!;
  const b = rows.find((r) => r.address === B)!;
  assert.ok(Math.abs(a.entry! - 0.0021) < 1e-12);
  assert.ok(Math.abs(b.entry! - 0.002) < 1e-12);
  assert.deepEqual(a.tags, ["you"]);
  assert.equal(a.partialEntry, false);
});

test("without the batch pool in context its payouts are unpriced", () => {
  const rows = buildHolders([payout(A, BigInt(1_000), 1)], [fill(A, BigInt(1_000), BigInt(2_100), 0.0021, 0)], { ...ctx, batchPool: null });
  assert.equal(rows[0].entry, null);
});
