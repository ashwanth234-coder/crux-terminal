import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { orderflow } from "./orderflow.ts";
import type { PoolTrade } from "./tradeDecode.ts";

const SOLVER = "0x7777777777777777777777777777777777777777" as Address;
const trade = (side: "buy" | "sell", to: Address, usdc: number, time: number, viaIntent = false): PoolTrade => ({
  side,
  usdc: BigInt(usdc),
  tokens: BigInt(1),
  price: 1,
  to: viaIntent ? SOLVER : to,
  viaIntent,
  venue: "uniswap-v2",
  txHash: "0x01" as Hex,
  blockNumber: BigInt(time),
  logIndex: 0,
  time,
});
const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;

test("order flow counts distinct direct buyers and sellers, and intent fills apart", () => {
  const f = orderflow([trade("buy", A, 5, 50), trade("buy", A, 5, 40), trade("sell", B, 3, 30), trade("buy", B, 2, 20, true), trade("buy", B, 9, 5)], 10);
  assert.equal(f.buys, 3);
  assert.equal(f.sells, 1);
  assert.equal(f.buyers, 1);
  assert.equal(f.sellers, 1);
  assert.equal(f.intentTrades, 1);
  assert.equal(f.buyUsdc, BigInt(12));
  assert.equal(f.intentUsdc, BigInt(2));
});
