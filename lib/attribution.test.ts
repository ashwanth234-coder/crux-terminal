import { test } from "node:test";
import assert from "node:assert/strict";
import { Attribution } from "ox/erc8021";
import { concat, decodeFunctionData, encodeFunctionData, erc20Abi } from "viem";
import { attributionSuffix, BUILDER_CODE, suffixFor } from "./attribution.ts";

test("the site's suffix is ox's ERC-8021 schema 0 for Crux's builder code", () => {
  assert.equal(suffixFor(undefined), Attribution.toDataSuffix({ codes: [BUILDER_CODE] }));
  assert.equal(suffixFor(""), attributionSuffix(["bc_n7i0zwf4"]));
  assert.equal(suffixFor("off"), undefined);
});

test("an attributed approval decodes the same and carries the code", () => {
  const plain = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: ["0x2222222222222222222222222222222222222222", BigInt(5_000_000)] });
  const attributed = concat([plain, suffixFor(undefined)!]);
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: attributed }), decodeFunctionData({ abi: erc20Abi, data: plain }));
  assert.deepEqual(Attribution.fromData(attributed), { codes: [BUILDER_CODE], id: 0 });
});
