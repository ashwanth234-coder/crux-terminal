import { parseAbi, type Address, type PublicClient } from "viem";

/** Crux V4 on Base mainnet (chain 8453): the coin's launch rules, read straight from the contracts. */
export const V4_HOOK: Address = "0x71F19f5Fa71FF21F19453d7acD625932355d60cC";
export const V4_LOCKER: Address = "0x0184596998D4FC7242cC35dD1230f821Be2B815f";
export const V4_REWARDS: Address = "0x4c09Ed1C6D759E91b543073e2264E856236BF430";

const hookAbi = parseAbi([
  "struct Config { address coin; uint40 launchedAt; uint32 window; uint16 startBps; uint16 cruxEarlyBps; uint16 toCreatorBps; uint16 toLiquidityBps; uint16 toHoldersBps; }",
  "function configOf(address coin) view returns (Config)",
  "function earlyFeeBps(address coin) view returns (uint256)",
  "function liquidityPot(address coin) view returns (uint256)",
  "function holdersPot(address coin) view returns (uint256)",
  "function creatorOwed(address coin) view returns (uint256)",
]);
const lockerAbi = parseAbi([
  "struct Position { int24 lo; int24 hi; bytes32 salt; }",
  "function positionsOf(address coin) view returns (Position[])",
  "function floorPot(address coin) view returns (uint256)",
]);
const rewardsAbi = parseAbi([
  "function rewardOf(address coin) view returns (bytes32 root, uint256 pot, uint256 claimed, uint40 postedAt, bool swept)",
]);

export type V4Launch = {
  launchedAt: number;
  windowSec: number;
  startBps: number;
  cruxEarlyBps: number;
  toCreatorBps: number;
  toLiquidityBps: number;
  toHoldersBps: number;
  feeBpsNow: number;
  /** ETH waiting to be added to the floor (the hook's pot plus the locker's). */
  floorEth: bigint;
  holdersEth: bigint;
  creatorEth: bigint;
  /** Floors already placed (positions beyond the coin's first three). */
  floorsPlaced: number;
  reward: { posted: boolean; pot: bigint; claimed: bigint };
};

/** The early fee at a moment: the same straight-line fall to zero the contract uses. */
export function feeAt(l: V4Launch, nowSec: number): number {
  if (l.windowSec <= 0) return 0;
  const elapsed = nowSec - l.launchedAt;
  if (elapsed >= l.windowSec) return 0;
  return Math.floor((l.startBps * (l.windowSec - Math.max(0, elapsed))) / l.windowSec);
}

function span(sec: number): string {
  if (sec % 60 === 0) {
    const m = sec / 60;
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  return `${sec} seconds`;
}

function share(bps: number): string {
  if (bps === 10000) return "all";
  if (bps === 5000) return "half";
  return `${bps / 100}%`;
}

/** The rules in plain words. */
export function rulesText(l: V4Launch): string[] {
  if (l.windowSec <= 0 || l.startBps <= 0) return ["No early fee: everyone pays the normal 1%."];
  const out = [`Early buyers pay a fee for ${span(l.windowSec)}.`];
  const parts: string[] = [];
  if (l.toLiquidityBps) parts.push(`${share(l.toLiquidityBps)} to this coin's locked floor`);
  if (l.toCreatorBps) parts.push(`${share(l.toCreatorBps)} to the creator`);
  if (l.toHoldersBps) parts.push(`${share(l.toHoldersBps)} to holders`);
  if (l.cruxEarlyBps) parts.push(`${share(l.cruxEarlyBps)} to Crux`);
  if (parts.length === 1 && l.toLiquidityBps === 10000) out.push("It all goes to this coin's locked floor.");
  else if (parts.length) out.push(`The fee is split: ${parts.join(", ")}.`);
  return out;
}

/** Reads the coin's launch rules; null when it isn't a Crux V4 launch. */
export async function readV4Launch(client: Pick<PublicClient, "multicall" | "readContract">, coin: Address): Promise<V4Launch | null> {
  const cfg = await client.readContract({ address: V4_HOOK, abi: hookAbi, functionName: "configOf", args: [coin] });
  if (!cfg || Number(cfg.launchedAt) === 0) return null;
  const [fee, liq, holders, creator, floorPot, positions, reward] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: V4_HOOK, abi: hookAbi, functionName: "earlyFeeBps", args: [coin] },
      { address: V4_HOOK, abi: hookAbi, functionName: "liquidityPot", args: [coin] },
      { address: V4_HOOK, abi: hookAbi, functionName: "holdersPot", args: [coin] },
      { address: V4_HOOK, abi: hookAbi, functionName: "creatorOwed", args: [coin] },
      { address: V4_LOCKER, abi: lockerAbi, functionName: "floorPot", args: [coin] },
      { address: V4_LOCKER, abi: lockerAbi, functionName: "positionsOf", args: [coin] },
      { address: V4_REWARDS, abi: rewardsAbi, functionName: "rewardOf", args: [coin] },
    ],
  });
  const r = reward as readonly [string, bigint, bigint, number, boolean];
  return {
    launchedAt: Number(cfg.launchedAt),
    windowSec: Number(cfg.window),
    startBps: Number(cfg.startBps),
    cruxEarlyBps: Number(cfg.cruxEarlyBps),
    toCreatorBps: Number(cfg.toCreatorBps),
    toLiquidityBps: Number(cfg.toLiquidityBps),
    toHoldersBps: Number(cfg.toHoldersBps),
    feeBpsNow: Number(fee),
    floorEth: (liq as bigint) + (floorPot as bigint),
    holdersEth: holders as bigint,
    creatorEth: creator as bigint,
    floorsPlaced: Math.max(0, (positions as readonly unknown[]).length - 3),
    reward: { posted: r[3] > 0, pot: r[1], claimed: r[2] },
  };
}
