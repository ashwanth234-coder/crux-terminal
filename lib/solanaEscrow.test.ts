import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  associatedTokenAddress,
  newSolanaOrder,
  openInstruction,
  orderProven,
  refundInstruction,
  solanaOriginData,
} from "./solanaEscrow.ts";

const TEST_WALLET = new PublicKey("54drirH8v2r6WQqXesLTWfcBS9GbN3c2ckVDaKBo4jFC");

test("derives the wallet's USDG account exactly as the Solana CLI does", () => {
  // `solana find-program-derived-address` for this wallet's Token-2022 USDG account (checked 2026-10-29).
  assert.equal(associatedTokenAddress(TEST_WALLET).toBase58(), "2X6sLgQeeLHKNeFXYNdeJ8Z3mieaJkWH33b3HYdhyb1P");
});

test("originData is the program's ABI layout", () => {
  const d = solanaOriginData(new Uint8Array(32).fill(0x11), `0x${"22".repeat(20)}`, "x", BigInt(5), 0x01020304);
  assert.deepEqual([...d.subarray(0, 32)], Array(32).fill(0x11));
  assert.deepEqual([...d.subarray(32, 44)], Array(12).fill(0));
  assert.deepEqual([...d.subarray(44, 64)], Array(20).fill(0x22));
  assert.equal(d[127], 5);
  assert.deepEqual([...d.subarray(157, 160)], [0x01, 0x4a, 0x34]); // 84532
  assert.deepEqual([...d.subarray(188, 192)], [1, 2, 3, 4]);
});

test("open encodes OpenArgs in Anchor's borsh layout with the program's accounts", () => {
  const order = newSolanaOrder({
    user: TEST_WALLET,
    amount: BigInt(2_500_000),
    tokenOut: "eip155:84532/erc20:0xabc",
    minAmountOut: BigInt(10) ** BigInt(20),
    payee: `0x${"33".repeat(20)}`,
    now: 1_800_000_000,
  });
  assert.equal(order.fillDeadline, 1_800_000_600);
  const ix = openInstruction(order, 10);
  const d = Uint8Array.from(ix.data);
  assert.deepEqual([...d.subarray(0, 8)], [228, 220, 155, 71, 199, 189, 60, 45]);
  const view = new DataView(d.buffer);
  assert.equal(view.getBigUint64(8, true), order.nonce);
  assert.equal(view.getBigUint64(16, true), BigInt(2_500_000));
  const len = view.getUint32(24, true);
  assert.equal(new TextDecoder().decode(d.subarray(28, 28 + len)), "eip155:84532/erc20:0xabc");
  let o = 28 + len;
  assert.equal(view.getBigUint64(o, true) + (view.getBigUint64(o + 8, true) << BigInt(64)), BigInt(10) ** BigInt(20));
  o += 16 + 20;
  assert.equal(view.getUint32(o, true), 1_800_000_600);
  assert.equal(view.getUint32(o + 4, true), 10);
  assert.deepEqual(d.subarray(o + 8, o + 40), order.orderId);
  assert.deepEqual(d.subarray(o + 40, o + 72), order.fillHash);
  assert.equal(d.length, o + 72);
  assert.equal(ix.keys.length, 9);
  assert.ok(ix.keys[0].isSigner && ix.keys[0].pubkey.equals(TEST_WALLET));
  assert.equal(refundInstruction(TEST_WALLET, order.fillHash).keys.length, 6);
});

test("reads whether an Order account has been proven", () => {
  const data = new Uint8Array(205);
  data.set([134, 173, 223, 185, 77, 86, 28, 51]);
  assert.equal(orderProven(data), false);
  data[190] = 1;
  assert.equal(orderProven(data), true);
  assert.throws(() => orderProven(new Uint8Array(205)));
});
