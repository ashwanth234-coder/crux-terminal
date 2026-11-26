import { test } from "node:test";
import assert from "node:assert/strict";
import { noReceiptPossible, parseReceiptParams, rateLimiter } from "./receiptGuard.ts";
import { ttlCache } from "./ttlCache.ts";
import type { RewardsFile } from "./v4receipt.ts";

const COIN = "0x1111111111111111111111111111111111111111";
const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const BOB = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";
const q = (s: string) => new URLSearchParams(s);

test("route parameters: both must be 0x + 40 hex, else 400", () => {
  assert.deepEqual(parseReceiptParams(q(`coin=${COIN}&wallet=${ALICE}`)), { ok: true, coin: COIN, wallet: ALICE });
  for (const bad of ["", `coin=${COIN}`, `wallet=${ALICE}`, `coin=${COIN}&wallet=0x12`, `coin=${COIN}&wallet=${ALICE}zz`, `coin=0x${"g".repeat(40)}&wallet=${ALICE}`, `coin=${COIN}&wallet=${ALICE.slice(2)}`]) {
    const r = parseReceiptParams(q(bad));
    assert.equal(r.ok, false, bad);
    assert.equal(!r.ok && r.status, 400);
  }
});

test("404 short-circuit: no line and not the creator means no log work", () => {
  const file = { coin: COIN, list: [{ account: ALICE, amount: "1", proof: [], avgBalance: "1", endBalance: "1" }] } as unknown as RewardsFile;
  assert.equal(noReceiptPossible(file, BOB, "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc"), true);
  assert.equal(noReceiptPossible(file, ALICE.toLowerCase(), BOB), false, "a listed wallet proceeds");
  assert.equal(noReceiptPossible(file, BOB.toLowerCase(), BOB), false, "the creator proceeds");
  assert.equal(noReceiptPossible(null, BOB, ALICE), true, "no list yet and not the creator");
});

test("ttlCache expires and evicts the oldest", () => {
  let t = 0;
  const c = ttlCache<number>(2, 100, () => t);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("c"), 3);
  t = 101;
  assert.equal(c.get("b"), undefined);
});

test("rateLimiter allows `limit` hits per window per key", () => {
  let t = 0;
  const allow = rateLimiter(2, 1000, () => t);
  assert.equal(allow("ip"), true);
  assert.equal(allow("ip"), true);
  assert.equal(allow("ip"), false);
  assert.equal(allow("other"), true);
  t = 1001;
  assert.equal(allow("ip"), true);
});
