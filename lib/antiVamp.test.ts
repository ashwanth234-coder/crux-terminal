import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLaunch, conflictLine, dHashOf, hammingHex, normalizeTicker, normalizeXUrl, type GuardLaunch } from "./antiVamp.ts";

const NOW = 1_800_000_000;
const launch = (over: Partial<GuardLaunch> = {}): GuardLaunch => ({
  symbol: "PEPE",
  token: "0x1111111111111111111111111111111111111111",
  href: "/launch/v7/0",
  phase: "graduated",
  closesAt: NOW - 86_400,
  x: "https://x.com/pepe",
  art: { sha256: "aa".repeat(32), dhash: "f0f0f0f0f0f0f0f0" },
  ...over,
});

test("tickers normalise case, spaces, symbols and leetspeak", () => {
  for (const t of ["PEPE", "pepe", " $pepe ", "P.E.P.E", "P3P3", "p-e-p-e"]) assert.equal(normalizeTicker(t), "pepe", t);
  assert.equal(normalizeTicker("B0NK"), "bonk");
  assert.equal(normalizeTicker("4LPH4"), "aipha", "4 reads as a, l reads as i");
  assert.equal(normalizeTicker("ALPHA"), "aipha", "so ALPHA and 4LPH4 collide");
  assert.equal(normalizeTicker("5H1B"), "shib");
  assert.notEqual(normalizeTicker("PEPE2"), normalizeTicker("PEPE"));
});

test("X links normalise across twitter.com, x.com, case, query and trailing slash", () => {
  for (const u of ["https://x.com/Pepe", "twitter.com/pepe/", "https://www.twitter.com/PEPE?s=20", "@pepe", "mobile.x.com/pepe"]) {
    assert.equal(normalizeXUrl(u), "x.com/pepe", u);
  }
  assert.equal(normalizeXUrl("https://x.com/pepe/status/123?t=1"), "x.com/pepe/status/123");
  assert.equal(normalizeXUrl("https://example.com/pepe"), null);
  assert.equal(normalizeXUrl(""), null);
});

test("dHash: one bit per pixel darker than its right neighbour; Hamming distance counts differing bits", () => {
  const rising = Uint8Array.from({ length: 72 }, (_, i) => (i % 9) * 10);
  assert.equal(dHashOf(rising), "ffffffffffffffff");
  assert.equal(dHashOf(new Uint8Array(72)), "0000000000000000");
  assert.equal(hammingHex("ffffffffffffffff", "0000000000000000"), 64);
  assert.equal(hammingHex("f0f0f0f0f0f0f0f0", "f0f0f0f0f0f0f0f1"), 1);
});

test("a graduated ticker is held for good, a live auction's while it runs, a cancelled one's for an hour", () => {
  assert.equal(checkLaunch({ symbol: "p3p3" }, [launch()], NOW)[0]?.kind, "ticker");
  assert.equal(checkLaunch({ symbol: "PEPE" }, [launch({ phase: "open", closesAt: NOW + 60 })], NOW)[0]?.kind, "ticker");
  assert.equal(checkLaunch({ symbol: "PEPE" }, [launch({ phase: "cancelled", closesAt: NOW - 600 })], NOW)[0]?.kind, "ticker");
  assert.deepEqual(checkLaunch({ symbol: "PEPE" }, [launch({ phase: "cancelled", closesAt: NOW - 3_601 })], NOW), []);
});

test("artwork: exact file or near-identical picture of an active token; cancelled tokens' artwork is free", () => {
  const exact = checkLaunch({ symbol: "NEW", art: { sha256: "aa".repeat(32), dhash: "0000000000000000" } }, [launch()], NOW);
  assert.deepEqual(exact.map((c) => c.kind), ["artwork"]);
  const near = checkLaunch({ symbol: "NEW", art: { sha256: "bb".repeat(32), dhash: "f0f0f0f0f0f0f0f3" } }, [launch()], NOW);
  assert.deepEqual(near.map((c) => c.kind), ["artwork-near"]);
  const far = checkLaunch({ symbol: "NEW", art: { sha256: "bb".repeat(32), dhash: "0f0f0f0f0f0f0f0f" } }, [launch()], NOW);
  assert.deepEqual(far, []);
  assert.deepEqual(checkLaunch({ symbol: "NEW", art: { sha256: "aa".repeat(32), dhash: "f0f0f0f0f0f0f0f0" } }, [launch({ phase: "cancelled", closesAt: NOW - 7_200 })], NOW), []);
});

test("an X account reused across active tokens is refused, and the banner names every kind once", () => {
  const c = checkLaunch({ symbol: "PEPE", x: "https://twitter.com/PEPE/", art: { sha256: "aa".repeat(32), dhash: "1" } }, [launch()], NOW);
  assert.deepEqual(c.map((x) => x.kind), ["ticker", "artwork", "x"]);
  assert.equal(conflictLine(c), "Ticker reserved on CRUX · Exact artwork already used · X account already used");
  assert.equal(c[0].href, "/launch/v7/0");
});
