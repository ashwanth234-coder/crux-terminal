import { formatEther, formatUnits, parseAbi, type Address, type PublicClient } from "viem";
import { dollarCoins, maybeDollarCoin, type V4Contracts } from "./dollarCoins.ts";

/** Crux V4 on Base mainnet (chain 8453): the coin's launch rules, read straight from the contracts. */
export const V4_HOOK: Address = "0x71F19f5Fa71FF21F19453d7acD625932355d60cC";
export const V4_LOCKER: Address = "0x0184596998D4FC7242cC35dD1230f821Be2B815f";
export const V4_REWARDS: Address = "0x4c09Ed1C6D759E91b543073e2264E856236BF430";
/** The ETH set (the live one); dollar coins come from dollarCoins(). */
export const ETH_V4: V4Contracts = { quote: "ETH", factory: "0x8f4b00740343BEc81c57fbE3Ff6E8636574b0219", hook: V4_HOOK, locker: V4_LOCKER, rewards: V4_REWARDS };

export const hookAbi = parseAbi([
  "struct Config { address coin; uint40 launchedAt; uint32 window; uint16 startBps; uint16 cruxEarlyBps; uint16 toCreatorBps; uint16 toLiquidityBps; uint16 toHoldersBps; }",
  "function configOf(address coin) view returns (Config)",
  "function liquidityPot(address coin) view returns (uint256)",
  "function holdersPot(address coin) view returns (uint256)",
  "event EarlyFee(address indexed coin, address indexed sender, uint256 fee, uint256 toCrux, uint256 toCreator, uint256 toLiquidity, uint256 toHolders)",
  "event CreatorClaimed(address indexed coin, address to, uint256 amount)",
]);
const lockerAbi = parseAbi([
  "struct Position { int24 lo; int24 hi; bytes32 salt; }",
  "function positionsOf(address coin) view returns (Position[])",
  "function floorPot(address coin) view returns (uint256)",
  "function creatorOf(address coin) view returns (address)",
]);
export const rewardsAbi = parseAbi([
  "function rewardOf(address coin) view returns (bytes32 root, uint256 pot, uint256 claimed, uint40 postedAt, bool swept)",
  "function isClaimed(address coin, address account) view returns (bool)",
  "function claim(address coin, address account, uint256 amount, bytes32[] proof)",
  "event Claimed(address indexed coin, address indexed account, uint256 amount)",
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
  reward: { posted: boolean; pot: bigint; claimed: bigint; swept: boolean; /** unix s; set once the list is posted */ postedAt?: number; /** the posted list's merkle root (zero until posted) */ root?: `0x${string}` };
  /** The contracts that launched it (absent: the ETH set). Amounts (floor, holders, rewards) are in its quote coin. */
  contracts?: V4Contracts;
};

/** The coin a launch's amounts are in: ETH, or USDC for dollar coins. */
export const quoteOf = (l: Pick<V4Launch, "contracts">): "ETH" | "USDC" => l.contracts?.quote ?? "ETH";
/** The contracts that launched it. */
export const contractsOf = (l: Pick<V4Launch, "contracts">): V4Contracts => l.contracts ?? ETH_V4;

/** An amount of a launch's quote coin, plain: "0.0123 ETH", or "$4.20" for dollar coins. */
export function fmtQuote(v: bigint, quote: "ETH" | "USDC"): string {
  if (quote === "USDC") {
    const n = Number(formatUnits(v, 6));
    return n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const n = Number(formatEther(v));
  return `${n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4).replace(/\.?0+$/, "")} ETH`;
}

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

/**
 * The buy panel's early-fee warning while the coin's window is on (a buyer ticks it before buying): the fee now, the
 * time left and where it goes. Null once the window is over, and for a coin with none.
 */
export function earlyFeeNote(l: V4Launch, nowSec: number): { bps: number; left: number; text: string } | null {
  const bps = feeAt(l, nowSec);
  const left = l.launchedAt + l.windowSec - nowSec;
  if (bps <= 0 || left <= 0) return null;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return { bps, left, text: `Early fee now ${Math.max(1, Math.round(bps / 100))}% of what you pay, for ${clock} more. ${rulesText(l)[1] ?? ""}`.trim() };
}

/**
 * Reads the coin's launch rules from the set that launched it (ETH, or dollar coins once they're on); null when it
 * isn't a Crux V4 launch. `dollar`: the dollar-coin contracts (default: as the server names them).
 */
export async function readV4Launch(
  client: Pick<PublicClient, "multicall" | "readContract">,
  coin: Address,
  dollar?: V4Contracts | null,
): Promise<V4Launch | null> {
  let set = ETH_V4;
  let cfg = await client.readContract({ address: set.hook, abi: hookAbi, functionName: "configOf", args: [coin] });
  if (!cfg || Number(cfg.launchedAt) === 0) {
    // Only an address that could be a dollar coin is looked up there (no extra read for any other coin).
    const d = maybeDollarCoin(coin) ? (dollar === undefined ? await dollarCoins() : dollar) : null;
    if (!d) return null;
    set = d;
    cfg = await client.readContract({ address: set.hook, abi: hookAbi, functionName: "configOf", args: [coin] });
    if (!cfg || Number(cfg.launchedAt) === 0) return null;
  }
  const [liq, holders, floorPot, positions, reward] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: set.hook, abi: hookAbi, functionName: "liquidityPot", args: [coin] },
      { address: set.hook, abi: hookAbi, functionName: "holdersPot", args: [coin] },
      { address: set.locker, abi: lockerAbi, functionName: "floorPot", args: [coin] },
      { address: set.locker, abi: lockerAbi, functionName: "positionsOf", args: [coin] },
      { address: set.rewards, abi: rewardsAbi, functionName: "rewardOf", args: [coin] },
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
    reward: { posted: r[3] > 0, pot: r[1], claimed: r[2], swept: r[4], postedAt: Number(r[3]), root: r[0] as `0x${string}` },
    ...(set === ETH_V4 ? {} : { contracts: set }),
  };
}

/** The coin's current creator, per its locker (where the creator's payout goes); null when it can't be read. */
export async function readCreator(client: Pick<PublicClient, "readContract">, coin: Address, locker: Address = V4_LOCKER): Promise<Address | null> {
  try {
    return await client.readContract({ address: locker, abi: lockerAbi, functionName: "creatorOf", args: [coin] });
  } catch {
    return null;
  }
}
