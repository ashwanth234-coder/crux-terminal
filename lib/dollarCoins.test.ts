import assert from "node:assert/strict";
import test from "node:test";
import { getContractAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { BASE_USDC, maybeDollarCoin, type V4Contracts } from "./dollarCoins.ts";
import { mineTokenSalt } from "./tokenSalt.ts";
import { ETH_V4, fmtQuote, quoteOf, readV4Launch, type V4Launch } from "./v4launch.ts";
import { buildReceipt, type RewardsFile } from "./v4receipt.ts";

const DEPLOYER: Address = "0x23a62d64Ab9FFF531F0D42f4E91370600cbCB964";
const INIT_HASH = keccak256(toHex("crux dollar coin init code"));
const DOLLAR: V4Contracts = {
  quote: "USDC",
  factory: DEPLOYER,
  hook: "0x841E85dB609A1Dfac168598A3Adc4C9AA92b20cc",
  locker: "0x06740E00322980C4c5802784F8DFd22dFc8428e7",
  rewards: "0x9B60761fa6ed4699aeb4cC2e8Ad1C723Bfae039a",
};

test("a dollar coin's salt gives a 5afe address that sorts after USDC, checked with viem's own CREATE2", () => {
  for (const start of [BigInt(0), BigInt(1_000_000), BigInt(99)]) {
    const { salt, token } = mineTokenSalt(DEPLOYER, INIT_HASH, start, BASE_USDC);
    assert.equal(token, getContractAddress({ opcode: "CREATE2", from: DEPLOYER, salt, bytecodeHash: INIT_HASH }));
    assert.ok(maybeDollarCoin(token), token);
  }
});

test("maybeDollarCoin: 5afe and above USDC only", () => {
  assert.equal(maybeDollarCoin("0x9eDD1fA7BF44D762d78C10491d645E2A8fdf5AFe"), true);
  assert.equal(maybeDollarCoin("0x0C959d32561DBC20FDaBd136220e177f7Bab5aFE"), false, "an ETH coin below USDC");
  assert.equal(maybeDollarCoin("0x9eDD1fA7BF44D762d78C10491d645E2A8fdf1234"), false);
  assert.equal(maybeDollarCoin("not an address"), false);
});

test("amounts read in the coin's own quote: ETH, or dollars", () => {
  assert.equal(fmtQuote(BigInt(12_300_000_000_000_000), "ETH"), "0.0123 ETH");
  assert.equal(fmtQuote(BigInt(4_200_000), "USDC"), "$4.20");
  assert.equal(fmtQuote(BigInt(1_234_567_890), "USDC"), "$1,234.57");
  assert.equal(fmtQuote(BigInt(5_000), "USDC"), "<$0.01");
  assert.equal(fmtQuote(BigInt(0), "USDC"), "$0");
});

test("a dollar coin's rules are read from the dollar contracts; an ETH coin's from the ETH ones", async () => {
  const coin = "0x9eDD1fA7BF44D762d78C10491d645E2A8fdf5AFe" as Address;
  const asked: string[] = [];
  const client = {
    readContract: async ({ address }: { address: Address }) => {
      asked.push(address);
      return { launchedAt: address === DOLLAR.hook ? 1_800_000_000 : 0, window: 60, startBps: 8000, cruxEarlyBps: 1000, toCreatorBps: 0, toLiquidityBps: 10_000, toHoldersBps: 0 };
    },
    multicall: async ({ contracts }: { contracts: { address: Address }[] }) => {
      assert.deepEqual(contracts.map((c) => c.address), [DOLLAR.hook, DOLLAR.hook, DOLLAR.locker, DOLLAR.locker, DOLLAR.rewards]);
      return [BigInt(3_000_000), BigInt(0), BigInt(0), [1, 2, 3], ["0x", BigInt(0), BigInt(0), 0, false]];
    },
  };
  const l = (await readV4Launch(client as never, coin, DOLLAR))!;
  assert.deepEqual(asked, [ETH_V4.hook, DOLLAR.hook]);
  assert.equal(quoteOf(l), "USDC");
  assert.equal(fmtQuote(l.floorEth, quoteOf(l)), "$3.00");
  // Dollar coins off (null): not looked up there at all.
  asked.length = 0;
  assert.equal(await readV4Launch(client as never, coin, null), null);
  assert.deepEqual(asked, [ETH_V4.hook]);
});

test("a dollar coin's receipt is in dollars, with no second dollar figure", () => {
  const coin = "0x9eDD1fA7BF44D762d78C10491d645E2A8fdf5AFe" as Address;
  const alice = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as Address;
  const file: RewardsFile = { coin, root: `0x${"00".repeat(32)}` as Hex, pot: "72000000", snapshotAt: 1_800_086_400, from: 1_800_000_000, list: [{ account: alice, amount: "7200000", proof: [], avgBalance: String(BigInt(10) ** BigInt(24)), endBalance: "0" }] };
  const launch: V4Launch = { launchedAt: 1_800_000_000, windowSec: 60, startBps: 8000, cruxEarlyBps: 1000, toCreatorBps: 0, toLiquidityBps: 0, toHoldersBps: 10_000, floorEth: BigInt(0), holdersEth: BigInt(0), floorsPlaced: 0, reward: { posted: true, pot: BigInt(72_000_000), claimed: BigInt(0), swept: false }, contracts: DOLLAR };
  const r = buildReceipt({ symbol: "DOLL", launch, file, wallet: alice, logs: { earlyFees: BigInt(80_000_000), holderPaid: null, creatorPaid: null }, ethUsd: 3000 })!;
  assert.equal(r.shareEth, "$7.20");
  assert.equal(r.shareUsd, null);
  assert.equal(r.earlyFees, "$80.00");
});
