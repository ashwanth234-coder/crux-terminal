import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { buildHolders, buildLedger, topTraders, type HolderContext } from "./holders.ts";
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

const swap = (side: "buy" | "sell", to: Address, tokens: bigint, usdc: bigint, price: number, tx: Hex, block: number): PoolTrade => ({
  side,
  usdc,
  tokens: tokens * e18,
  price,
  to,
  viaIntent: false,
  venue: "uniswap-v2",
  txHash: tx,
  blockNumber: BigInt(block),
  logIndex: 0,
  time: block * 10,
});
const move = (from: Address, to: Address, tokens: bigint, tx: Hex, block: number): TokenTransfer => ({
  kind: "transfer",
  from,
  to,
  value: tokens * e18,
  txHash: tx,
  blockNumber: BigInt(block),
  logIndex: 1,
  time: block * 10,
});

test("realized PnL: half sold at twice the entry takes the profit on that half and keeps the rest's basis", () => {
  const ledger = buildLedger(
    [move(PAIR, B, BigInt(1_000), "0xb1" as Hex, 10), move(B, PAIR, BigInt(500), "0xb2" as Hex, 20)],
    [swap("sell", B, BigInt(500), BigInt(1_000_000), 0.002, "0xb2" as Hex, 20), swap("buy", B, BigInt(1_000), BigInt(1_000_000), 0.001, "0xb1" as Hex, 10)],
    ctx,
  );
  const b = ledger.find((r) => r.address === B)!;
  assert.ok(Math.abs(b.realized - 0.5) < 1e-9, `realized ${b.realized}`);
  assert.ok(Math.abs(b.boughtUsd - 1) < 1e-9);
  assert.ok(Math.abs(b.soldUsd - 1) < 1e-9);
  assert.ok(Math.abs(b.basis - 0.5) < 1e-9);
  assert.equal(b.buys, 1);
  assert.equal(b.sells, 1);
  assert.equal(b.partialRealized, false);
  // Unrealized at 0.003: 500 × 0.003 − 0.5 = 1.
  const [top] = topTraders(ledger, 0.003);
  assert.equal(top.address, B);
  assert.ok(Math.abs(top.total - 1.5) < 1e-9);
});

test("a sold-out wallet stays in the ledger, not in holders; free tokens sold aren't counted as profit", () => {
  const ledger = buildLedger(
    // A was sent 1,000 tokens by B for free, then sold them all into the pool.
    [move(PAIR, B, BigInt(1_000), "0xc1" as Hex, 10), move(B, A, BigInt(1_000), "0xc2" as Hex, 11), move(A, PAIR, BigInt(1_000), "0xc3" as Hex, 12)],
    [swap("sell", A, BigInt(1_000), BigInt(2_000_000), 0.002, "0xc3" as Hex, 12), swap("buy", B, BigInt(1_000), BigInt(1_000_000), 0.001, "0xc1" as Hex, 10)],
    ctx,
  );
  const a = ledger.find((r) => r.address === A)!;
  assert.equal(a.balance, BigInt(0));
  assert.equal(a.realized, 0);
  assert.equal(a.sells, 1);
  // B gave its priced tokens away: no sale, so nothing realized, flagged partial.
  const b = ledger.find((r) => r.address === B)!;
  assert.equal(b.realized, 0);
  assert.equal(b.partialRealized, true);
  assert.equal(buildHolders(
    [move(PAIR, B, BigInt(1_000), "0xc1" as Hex, 10), move(B, A, BigInt(1_000), "0xc2" as Hex, 11), move(A, PAIR, BigInt(1_000), "0xc3" as Hex, 12)],
    [],
    ctx,
  ).some((h) => h.address === A), false);
});
