import assert from "node:assert/strict";
import test from "node:test";
import { getContractAddress, keccak256, toHex, type Address } from "viem";
import { endsIn5afe, mineTokenSalt } from "./tokenSalt.ts";

const DEPLOYER: Address = "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f";
const INIT_HASH = keccak256(toHex("crux token init code"));

test("mines a salt whose CREATE2 address ends in 5afe, checked with viem's own CREATE2", () => {
  const { salt, token } = mineTokenSalt(DEPLOYER, INIT_HASH, BigInt(0));
  assert.ok(endsIn5afe(token), token);
  assert.equal(token, getContractAddress({ opcode: "CREATE2", from: DEPLOYER, salt, bytecodeHash: INIT_HASH }));
});

test("matches the contracts' test miner on a pinned vector (test/CruxFactoryV8.t.sol)", () => {
  const { salt, token } = mineTokenSalt(DEPLOYER, INIT_HASH, BigInt(0));
  assert.equal(BigInt(salt), BigInt(13060));
  assert.equal(token, "0xc126666ae62B368f3166D728ac79c99F29F45afe");
});

test("the search is deterministic from a start, and a later start finds a different salt", () => {
  const a = mineTokenSalt(DEPLOYER, INIT_HASH, BigInt(0));
  assert.deepEqual(mineTokenSalt(DEPLOYER, INIT_HASH, BigInt(0)), a);
  const b = mineTokenSalt(DEPLOYER, INIT_HASH, BigInt(a.salt) + BigInt(1));
  assert.notEqual(b.salt, a.salt);
  assert.ok(endsIn5afe(b.token));
});

test("a random start still finds a 5afe address", () => {
  assert.ok(endsIn5afe(mineTokenSalt(DEPLOYER, INIT_HASH).token));
});
