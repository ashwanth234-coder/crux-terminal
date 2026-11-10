import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { barTime, markTrades, type MarkContext } from "./chartMarks.ts";
import type { TokenTransfer } from "../hooks/useTokenTransfers.ts";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const PAIR = a(1);
const POOL = a(2);
const SOLVER = a(3);
const SETTLER = a(4);
const ME = a(10);
const MY_ACCOUNT = a(11);
const DEV = a(12);
const WHALE = a(13);
const NOBODY = a(14);
const e18 = BigInt(10) ** BigInt(18);

const tr = (from: Address, to: Address, tokens: number, time: number, kind: "transfer" | "claim" = "transfer"): TokenTransfer => ({
  kind,
  from,
  to,
  value: BigInt(tokens) * e18,
  txHash: "0x01" as Hex,
  blockNumber: BigInt(time),
  logIndex: 0,
  time,
});

const ctx: MarkContext = { sources: [PAIR, POOL, SOLVER], sinks: [PAIR, POOL, SETTLER], me: [ME, MY_ACCOUNT], dev: DEV, whales: [WHALE], top: [] };

test("buys from venues and sells into them, for the people worth marking", () => {
  const marks = markTrades(
    [
      tr(PAIR, ME, 100, 10), // direct pool buy
      tr(SOLVER, MY_ACCOUNT, 50, 20), // intent fill into my Crux account
      tr(ME, SETTLER, 30, 30), // intent sell escrow
      tr(POOL, DEV, 70, 40), // the creator buys in the batch pool
      tr(WHALE, PAIR, 5, 50), // a whale sells
      tr(PAIR, NOBODY, 1000, 60), // not marked
      tr(ME, WHALE, 10, 70), // a transfer between holders is no trade
      tr(SOLVER, ME, 9, 80, "claim"), // claims are no trades
    ],
    ctx,
    () => 0.5,
  );
  assert.deepEqual(
    marks.map((m) => [m.time, m.side, m.who, m.tokens, m.usd]),
    [
      [10, "buy", "me", 100, 50],
      [20, "buy", "me", 50, 25],
      [30, "sell", "me", 30, 15],
      [40, "buy", "dev", 70, 35],
      [50, "sell", "whale", 5, 2.5],
    ],
  );
});

test("the dev label outranks the viewer when the creator is the viewer (marked DB / DS)", () => {
  const [m] = markTrades([tr(PAIR, DEV, 1, 1)], { ...ctx, me: [DEV] }, () => 1);
  assert.equal(m.who, "dev");
});

test("a mark sits on the latest bar at or before its time", () => {
  const times = [100, 160, 220];
  assert.equal(barTime(times, 159), 100);
  assert.equal(barTime(times, 160), 160);
  assert.equal(barTime(times, 999), 220);
  assert.equal(barTime(times, 50), 100, "before the first bar: the first bar");
  assert.equal(barTime([], 5), null);
});

test("markBarTime: a sell's badge goes on the candle its sale made, after its escrow transfer; a buy's stays put", async () => {
  const { markBarTime } = await import("./chartMarks.ts");
  // 1-second candles: a buy's candle at 100, then the account sell clicked at 101 whose pool sale lands at 106.
  const times = [100, 106];
  assert.equal(markBarTime(times, 101, "sell"), 106, "on the red candle the sale made, not the green one before it");
  assert.equal(markBarTime(times, 101, "buy"), 100, "a buy keeps the latest candle at or before it");
  // No candle soon after (the sale fell in the same candle, on a longer timeframe): the transfer's own candle.
  assert.equal(markBarTime([0, 300], 120, "sell"), 0);
  assert.equal(markBarTime([100, 200], 101, "sell"), 100, "a later candle beyond the lag isn't the sale's");
});

test("markBarTime: with a quick buy between the click and the sale, the sell's badge skips the green candle", async () => {
  const { markBarTime } = await import("./chartMarks.ts");
  // The sell clicked at 101; a quick buy's green candle at 103; the sale's red candle at 106.
  const down = new Set([106]);
  assert.equal(markBarTime([100, 103, 106], 101, "sell", (t) => down.has(t)), 106);
  // No red candle soon after (on a longer timeframe the sale shares the click's candle): the click's own candle.
  assert.equal(markBarTime([0, 300], 120, "sell", () => false), 0);
});

test("markBarTime: an escrow transfer with no sale nearby gets no badge, never one on an older candle", async () => {
  const { markBarTime } = await import("./chartMarks.ts");
  const down = new Set([5_000]);
  // $MT: a creator escrow on the 1s chart, the latest candle 75 minutes earlier, no sale within 30 s.
  assert.equal(markBarTime([5_000, 20_000], 9_619, "sell", (t) => down.has(t), 1), null);
  // A wallet sale straight into the pool: its own (red) candle, even with another red candle seconds later.
  const red = new Set([200, 205]);
  assert.equal(markBarTime([200, 205], 200, "sell", (t) => red.has(t), 1), 200);
});
