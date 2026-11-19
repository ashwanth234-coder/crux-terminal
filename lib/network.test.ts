import { test } from "node:test";
import assert from "node:assert/strict";
import { caip19, need, NETWORKS, networkFrom } from "./network.ts";

test("the site defaults to Base Sepolia, and only the two networks are accepted", () => {
  assert.equal(networkFrom(undefined).chain.id, 84532);
  assert.equal(networkFrom("base-mainnet").chain.id, 8453);
  assert.throws(() => networkFrom("mainnet"), /NEXT_PUBLIC_NETWORK must be/);
});

test("Base Sepolia keeps the addresses the site used before the switch", () => {
  const s = NETWORKS["base-sepolia"];
  assert.equal(s.usdc, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  assert.equal(s.crux.settlerV4, "0x399147a5960A120A3b8b89A33a30500a561145D9");
  // One-account move (2026-11-17): launches and accounts moved to the FactoryV4 stack; the old factory is the previous one.
  assert.equal(s.crux.factoryV9, "0x5091Bc334D9F4acc1A5Ed1AeC5DE49F4873e66d9");
  assert.equal(s.crux.accountFactoryV3, "0x510F86D29D166242b59D2c2C2afd40759a7CBd26");
  assert.equal(s.crux.accountFactoryV3Previous, "0x19049da3A3834A5d65305f9271BFa290E56ea377");
  assert.equal(caip19(s.usdc, s), "eip155:84532/erc20:0x036CbD53842c5426634e7929541eC2318f3dCF7e");
});

test("on Base mainnet a Crux contract that isn't deployed stops the build, by name", () => {
  const m = NETWORKS["base-mainnet"];
  assert.equal(m.usdc, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(need("CruxFactoryV9", m.crux.factoryV9, m), "0x84f918e07FeD33027F27808BbF894c39F1180fB7");
  assert.throws(() => need("CruxFactoryV8", m.crux.factoryV8, m), /CruxFactoryV8 isn't deployed on Base yet/);
});
