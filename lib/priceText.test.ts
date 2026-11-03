import { test } from "node:test";
import assert from "node:assert/strict";
import { compactZeros } from "./priceText.ts";
import { fmtTokenPrice } from "./launchTrade.ts";

test("four or more zeros after the point are counted in a subscript", () => {
  assert.equal(compactZeros("0.00000000232"), "0.0₈232");
  assert.equal(compactZeros("0.00001"), "0.0₄1");
  assert.equal(compactZeros("0.0000000000001234"), "0.0₁₂1234");
});

test("anything shorter or not a plain decimal is left as it is", () => {
  assert.equal(compactZeros("0.000123"), "0.000123");
  assert.equal(compactZeros("1.00000001"), "1.00000001");
  assert.equal(compactZeros("2.25"), "2.25");
  assert.equal(compactZeros("—"), "—");
});

test("token prices: tiny ones compact, cents and dollars unchanged", () => {
  assert.equal(fmtTokenPrice(0.00000000232), "$0.0₈232");
  assert.equal(fmtTokenPrice(0.000123), "$0.000123");
  assert.equal(fmtTokenPrice(2.25), "$2.25");
});
