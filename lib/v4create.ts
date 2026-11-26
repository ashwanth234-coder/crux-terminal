import { parseAbi, type Address, type Hex } from "viem";
import { mineTokenSalt } from "./tokenSalt.ts";
import type { V4Launch } from "./v4launch.ts";

/** CruxV4LaunchFactory on Base mainnet: coins launched from the login's own Base wallet (crux-solver /v1/v4/launch). */
export const V4_FACTORY: Address = "0x8f4b00740343BEc81c57fbE3Ff6E8636574b0219";
export const v4FactoryAbi = parseAbi([
  "function coinInitCodeHash(string name, string symbol, string metadataURI, address creator) pure returns (bytes32)",
  "function earlyStartBps() view returns (uint16)",
  "function cruxEarlyBps() view returns (uint16)",
]);

/** The early buyers' fee lengths the factory allows, in seconds (Off, 1, 3, 5 minutes). */
export const V4_WINDOWS = [0, 60, 180, 300] as const;
export const DEFAULT_WINDOW = 60;
/** The largest first buy, in dollars of cash. */
export const MAX_FIRST_BUY_USD = 50;

/** Where the creator's share of the early fee goes, in percent (10% steps). */
export type Mix = { you: number; floor: number; holders: number };
export const DEFAULT_MIX: Mix = { you: 0, floor: 100, holders: 0 };

/** Why the mix can't launch, in plain words; null when it can (whole 10% steps, 100% in all). */
export function mixProblem(m: Mix): string | null {
  const parts = [m.you, m.floor, m.holders];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p % 10 !== 0)) return "Use 10% steps.";
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== 100) return `That adds up to ${total}%. It must be 100%.`;
  return null;
}

/** The mix in the factory's terms (parts of 10,000). */
export const mixBps = (m: Mix) => ({ toCreatorBps: m.you * 100, toLiquidityBps: m.floor * 100, toHoldersBps: m.holders * 100 });

/** The rules the coin will have, shaped like a launched coin's so the coin page's words (rulesText) can describe them. */
export function previewLaunch(o: { windowSec: number; mix: Mix; startBps: number; cruxEarlyBps: number }): V4Launch {
  return {
    launchedAt: 0,
    windowSec: o.windowSec,
    startBps: o.startBps,
    cruxEarlyBps: o.cruxEarlyBps,
    ...mixBps(o.mix),
    floorEth: BigInt(0),
    holdersEth: BigInt(0),
    floorsPlaced: 0,
    reward: { posted: false, pot: BigInt(0), claimed: BigInt(0), swept: false },
  };
}

/** What a coin's 5afe address depends on: change any of it and the salt must be mined again. */
export type SaltInput = { name: string; symbol: string; metadataURI: string; creator: Address };

/**
 * The form's salt: mined against the factory's init-code hash for exactly these inputs, and mined again whenever any
 * of them changes (an edited name, ticker, picture, description or X link, or another wallet). Unchanged inputs reuse
 * the last salt.
 */
export function makeSaltKeeper(hashOf: (i: SaltInput) => Promise<Hex>, mine: typeof mineTokenSalt = mineTokenSalt) {
  let last: { key: string; salt: Hex; coin: Address } | null = null;
  return async function saltFor(i: SaltInput): Promise<{ salt: Hex; coin: Address; mined: boolean }> {
    const key = JSON.stringify([i.name, i.symbol, i.metadataURI, i.creator.toLowerCase()]);
    if (last && last.key === key) return { salt: last.salt, coin: last.coin, mined: false };
    const { salt, token } = mine(V4_FACTORY, await hashOf(i));
    last = { key, salt, coin: token };
    return { salt, coin: token, mined: true };
  };
}

/** The longest name, ticker and description a launch may carry (the relay's limits: name and ticker in bytes). */
export const NAME_MAX_BYTES = 32;
export const TICKER_MAX_BYTES = 10;
export const DESCRIPTION_MAX_CHARS = 1_000;

/** `s` cut to at most `max` UTF-8 bytes, never mid-character (an emoji counts as 4). */
export function fitBytes(s: string, max: number): string {
  const enc = new TextEncoder();
  let out = "";
  let used = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** Chainlink's ETH / USD feed on Base mainnet (8 decimals): values ETH already in the wallet for the first buy. */
export const ETH_USD_FEED: Address = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
export const ethUsdFeedAbi = parseAbi(["function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"]);
/** The ETH a Base wallet keeps for gas (the relay's top-up target): never counted toward a first buy. */
export const GAS_FLOOR_WEI = BigInt(50_000_000_000_000);

/**
 * The dollars a first buy can use: the wallet's cash plus its ETH above the gas floor (a first buy left from a launch
 * that didn't go through: the relay spends that ETH first and swaps only the rest).
 */
export function firstBuyFunds(o: { cash: number; ethWei: bigint; ethUsd: number | null }): number {
  const spare = o.ethWei > GAS_FLOOR_WEI ? o.ethWei - GAS_FLOOR_WEI : BigInt(0);
  const spareUsd = o.ethUsd && o.ethUsd > 0 ? (Number(spare) / 1e18) * o.ethUsd : 0;
  return o.cash + spareUsd;
}
