import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { buildReceipt, canClaimYourself, fetchRewards, fmtCoins, fmtDate, fmtEth, fmtUsd, isAddress40, paidFrom, receiptFor, sumFees, type RewardsFile } from "./v4receipt.ts";
import type { V4Launch } from "./v4launch.ts";

const e18 = BigInt(10) ** BigInt(18);
const COIN = "0x1111111111111111111111111111111111111111" as Address;
const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as Address;
const BOB = "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb" as Address;
const TX = ("0x" + "ab".repeat(32)) as Hex;

const file: RewardsFile = {
  coin: COIN,
  root: ("0x" + "00".repeat(32)) as Hex,
  pot: String(e18 / BigInt(10)),
  snapshotAt: 1_800_086_400,
  from: 1_800_000_000,
  list: [{ account: ALICE, amount: String(e18 / BigInt(100)), proof: [], avgBalance: String(BigInt(1_250_000) * e18), endBalance: "0" }],
};
const launch: V4Launch = {
  launchedAt: 1_800_000_000,
  windowSec: 600,
  startBps: 9000,
  cruxEarlyBps: 1000,
  toCreatorBps: 0,
  toLiquidityBps: 5000,
  toHoldersBps: 5000,
  floorEth: BigInt(0),
  holdersEth: BigInt(0),
  floorsPlaced: 1,
  reward: { posted: true, pot: e18 / BigInt(10), claimed: BigInt(0), swept: false },
};

test("receiptFor finds the wallet's line in any letter case, else null", () => {
  assert.equal(receiptFor(file, ALICE.toLowerCase())?.account, ALICE);
  assert.equal(receiptFor(file, BOB), null);
  assert.equal(receiptFor(null, ALICE), null);
  assert.equal(receiptFor(file, undefined), null);
});

test("numbers read in plain words", () => {
  assert.equal(fmtEth(e18 / BigInt(100)), "0.01 ETH");
  assert.equal(fmtEth(BigInt(1)), "<0.0001 ETH");
  assert.equal(fmtUsd(12.5), "$12.50");
  assert.equal(fmtUsd(0.001), "<$0.01");
  assert.equal(fmtUsd(null), null);
  assert.equal(fmtCoins(BigInt(3450) * e18), "3,450");
  assert.equal(fmtCoins(BigInt(1_250_000) * e18), "1.25 million");
  assert.equal(fmtCoins(BigInt(4_500_000_000) * e18), "4.5 billion");
  assert.equal(fmtDate(1_800_000_000), "15 Jan 2027");
});

test("holder receipt: average held, share, paid link", () => {
  const r = buildReceipt({ symbol: "COIN", launch, file, wallet: ALICE, logs: { earlyFees: e18, holderPaid: { amount: e18 / BigInt(100), tx: TX }, creatorPaid: null }, ethUsd: 3000 });
  assert.ok(r);
  assert.equal(r.kind, "holder");
  assert.equal(r.held, "You held an average of 1.25 million $COIN through day one");
  assert.equal(r.shareEth, "0.01 ETH");
  assert.equal(r.shareUsd, "$30.00");
  assert.equal(r.earlyFees, "1 ETH");
  assert.equal(r.paid, true);
  assert.equal(r.tx, TX);
});

test("unpaid holder, unreadable fees and no price degrade quietly", () => {
  const r = buildReceipt({ symbol: "$COIN", launch, file, wallet: ALICE, logs: { earlyFees: null, holderPaid: null, creatorPaid: null }, ethUsd: null });
  assert.ok(r);
  assert.equal(r.paid, false);
  assert.equal(r.tx, null);
  assert.equal(r.earlyFees, "—");
  assert.equal(r.shareUsd, null);
  assert.equal(r.coin, "$COIN");
});

test("creator gets the same card from CreatorClaimed; a stranger gets none", () => {
  const logs = { earlyFees: e18, holderPaid: null, creatorPaid: { amount: e18 / BigInt(2), tx: TX } };
  const c = buildReceipt({ symbol: "COIN", launch, file, wallet: BOB, logs, ethUsd: 2000 });
  assert.equal(c?.kind, "creator");
  assert.equal(c?.held, null);
  assert.equal(c?.shareEth, "0.5 ETH");
  assert.equal(buildReceipt({ symbol: "COIN", launch, file, wallet: BOB, logs: { ...logs, creatorPaid: null }, ethUsd: 2000 }), null);
});

test("log sums", () => {
  assert.equal(sumFees([{ args: { fee: BigInt(2) } }, { args: { fee: BigInt(3) } }]), BigInt(5));
  assert.equal(paidFrom([]), null);
  assert.deepEqual(paidFrom([{ args: { amount: BigInt(2) }, transactionHash: TX }]), { amount: BigInt(2), tx: TX });
});

test("claim button only when the line exists, the list is posted and it's unpaid", () => {
  const line = file.list[0];
  assert.equal(canClaimYourself(line, true, false), true);
  assert.equal(canClaimYourself(null, true, false), false);
  assert.equal(canClaimYourself(line, false, false), false);
  assert.equal(canClaimYourself(line, true, true), false);
});

test("fetchRewards: 404 and bad addresses are null; a list comes back", async () => {
  const ok = (async () => new Response(JSON.stringify(file), { status: 200 })) as unknown as typeof fetch;
  const nf = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  assert.equal((await fetchRewards("https://r/", COIN, ok))?.list.length, 1);
  assert.equal(await fetchRewards("https://r", COIN, nf), null);
  assert.equal(await fetchRewards("https://r", "nope", ok), null);
  assert.equal(isAddress40(COIN), true);
  assert.equal(isAddress40("0x12"), false);
});
