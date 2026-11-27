import { test } from "node:test";
import assert from "node:assert/strict";
import { HOURS_READ, tradingSince } from "./coinAge.ts";

const H = 3_600_000;

test("a market created empty that traded hours later: age counts from its first traded hour", () => {
  // $POLO: market created 06:27, first trade in the 10:00 hour.
  assert.equal(tradingSince({ marketCreatedAt: 6.45 * H, firstHour: 10 * 3_600, hours: 3 }), 10 * H);
});

test("a market that traded from its creation keeps the creation time (its first hour is the same hour)", () => {
  assert.equal(tradingSince({ marketCreatedAt: 6.45 * H, firstHour: 6 * 3_600, hours: 50 }), 6.45 * H);
});

test("a pump.fun coin starts at its first curve trade, before its market existed", () => {
  assert.equal(tradingSince({ marketCreatedAt: 100 * H, firstHour: 100 * 3_600, hours: 40, launchFirst: 99.9 * H }), 99.9 * H);
});

test("hourly history that was cut short (a full page) says nothing about the start", () => {
  assert.equal(tradingSince({ marketCreatedAt: 1 * H, firstHour: 5_000 * 3_600, hours: HOURS_READ }), 1 * H);
  assert.equal(tradingSince({ hours: 0 }), undefined);
});
