import { parseAbi, type Address, type PublicClient } from "viem";

/** Crux V4 on Base mainnet (chain 8453): the coin's launch rules, read straight from the contracts. */
export const V4_HOOK: Address = "0x71F19f5Fa71FF21F19453d7acD625932355d60cC";
export const V4_LOCKER: Address = "0x0184596998D4FC7242cC35dD1230f821Be2B815f";
export const V4_REWARDS: Address = "0x4c09Ed1C6D759E91b543073e2264E856236BF430";

const hookAbi = parseAbi([
  "struct Config { address coin; uint40 launchedAt; uint32 window; uint16 startBps; uint16 cruxEarlyBps; uint16 toCreatorBps; uint16 toLiquidityBps; uint16 toHoldersBps; }",
  "function configOf(address coin) view returns (Config)",
  "function liquidityPot(address coin) view returns (uint256)",
  "function holdersPot(address coin) view returns (uint256)",
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
  /** ETH waiting to be added to the floor (the hook's pot plus the locker's). */
  floorEth: bigint;
  holdersEth: bigint;
  /** Floors already placed (positions beyond the coin's first three). */
  floorsPlaced: number;
  reward: { posted: boolean; pot: bigint; claimed: bigint; swept: boolean };
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

function pct(bps: number): string {
  return `${Math.round(bps) / 100}%`;
}

/** The creator's mix, in words: "all to X", "half to X, half to Y", "60% to X, 40% to Y". */
function split(l: V4Launch): string {
  const parts = [
    { bps: l.toLiquidityBps, to: "this coin's locked floor" },
    { bps: l.toCreatorBps, to: "the creator" },
    { bps: l.toHoldersBps, to: "holders" },
  ].filter((p) => p.bps > 0);
  if (parts.length === 1) return `all to ${parts[0].to}`;
  return parts.map((p) => `${p.bps === 5000 ? "half" : pct(p.bps)} to ${p.to}`).join(", ");
}

/** The rules in plain words. Crux's share comes off the top; the rest follows the creator's mix. */
export function rulesText(l: V4Launch): string[] {
  if (l.windowSec <= 0 || l.startBps <= 0) return ["No early fee: everyone pays the normal 1%."];
  const out = [`Early buyers pay a fee for ${span(l.windowSec)}.`];
  const single = [l.toLiquidityBps, l.toCreatorBps, l.toHoldersBps].filter((b) => b > 0).length === 1;
  if (l.cruxEarlyBps > 0) out.push(`${pct(l.cruxEarlyBps)} of it goes to Crux; the rest goes ${split(l)}.`);
  else if (single) out.push(`It ${split(l).replace("all to", "all goes to")}.`);
  else out.push(`It goes ${split(l)}.`);
  return out;
}

/** Reads the coin's launch rules; null when it isn't a Crux V4 launch. */
export async function readV4Launch(client: Pick<PublicClient, "multicall" | "readContract">, coin: Address): Promise<V4Launch | null> {
  const cfg = await client.readContract({ address: V4_HOOK, abi: hookAbi, functionName: "configOf", args: [coin] });
  if (!cfg || Number(cfg.launchedAt) === 0) return null;
  const [liq, holders, floorPot, positions, reward] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: V4_HOOK, abi: hookAbi, functionName: "liquidityPot", args: [coin] },
      { address: V4_HOOK, abi: hookAbi, functionName: "holdersPot", args: [coin] },
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
    floorEth: (liq as bigint) + (floorPot as bigint),
    holdersEth: holders as bigint,
    floorsPlaced: Math.max(0, (positions as readonly unknown[]).length - 3),
    reward: { posted: r[3] > 0, pot: r[1], claimed: r[2], swept: r[4] },
  };
}
