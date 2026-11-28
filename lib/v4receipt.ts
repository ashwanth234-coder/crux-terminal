import { formatEther, formatUnits, getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { ttlCache } from "./ttlCache.ts";
import { ETH_USD_FEED, ethUsdFeedAbi } from "./v4create.ts";
import { fmtQuote, hookAbi, quoteOf, rewardsAbi, rulesText, type V4Launch } from "./v4launch.ts";

/** The holders' payout list the relay publishes for a coin (crux-solver scripts/v4snapshot.ts). */
export type RewardsFile = {
  coin: Address;
  root: Hex;
  /** wei */
  pot: string;
  snapshotAt: number;
  from: number;
  excluded?: string[];
  blocks?: { from: string; to: string };
  list: RewardLine[];
};
export type RewardLine = {
  account: Address;
  /** wei */
  amount: string;
  proof: Hex[];
  /** coin wei, 18 decimals */
  avgBalance: string;
  endBalance: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const isAddress40 = (v: unknown): v is Address => typeof v === "string" && ADDRESS.test(v);

/** The wallet's line in the list, or null (also for a list that isn't there). */
export function receiptFor(file: RewardsFile | null | undefined, wallet: string | null | undefined): RewardLine | null {
  if (!file || !wallet || !Array.isArray(file.list)) return null;
  const w = wallet.toLowerCase();
  return file.list.find((l) => l.account.toLowerCase() === w) ?? null;
}

const DIGITS = /^\d+$/;
const HEX = /^0x[0-9a-fA-F]*$/;

/** A list line that is safe to turn into BigInts and send as a claim; anything else is dropped. */
function goodLine(l: unknown): l is RewardLine {
  const x = l as Partial<RewardLine> | null;
  return (
    !!x &&
    isAddress40(x.account) &&
    typeof x.amount === "string" &&
    DIGITS.test(x.amount) &&
    typeof x.avgBalance === "string" &&
    DIGITS.test(x.avgBalance) &&
    typeof x.endBalance === "string" &&
    DIGITS.test(x.endBalance) &&
    Array.isArray(x.proof) &&
    x.proof.every((p) => typeof p === "string" && HEX.test(p))
  );
}

/** "ok" with the list, "none" when there is no list yet (404), "error" when Crux couldn't be reached or sent junk. */
export type RewardsResult = { status: "ok"; file: RewardsFile } | { status: "none" } | { status: "error" };

export async function fetchRewards(relay: string, coin: string, fetcher: typeof fetch = fetch): Promise<RewardsResult> {
  if (!isAddress40(coin)) return { status: "none" };
  try {
    const r = await fetcher(`${relay.replace(/\/$/, "")}/v1/v4/rewards/${coin}`);
    if (r.status === 404) return { status: "none" };
    if (!r.ok) return { status: "error" };
    const j = (await r.json()) as RewardsFile;
    if (!j || !Array.isArray(j.list)) return { status: "error" };
    return { status: "ok", file: { ...j, list: j.list.filter(goodLine) } };
  } catch {
    return { status: "error" };
  }
}

/* ---- Plain-words numbers ---- */

export function fmtEth(wei: bigint): string {
  const n = Number(formatEther(wei));
  return `${n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4).replace(/\.?0+$/, "")} ETH`;
}

export function fmtUsd(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (v > 0 && v < 0.01) return "<$0.01";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Coin amounts in words: 3,450 · 1.2 million · 4.5 billion. */
export function fmtCoins(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)} million`;
  if (n >= 1) return Math.round(n).toLocaleString("en-US");
  return n === 0 ? "0" : "<1";
}

export function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The coin's ticker as shown on the card: no leading $, at most 12 characters. */
export function shortSymbol(symbol: string): string {
  const t = symbol.replace(/^\$/, "");
  return t.length > 12 ? `${t.slice(0, 12)}…` : t;
}

/* ---- Logs ---- */

export type Paid = { amount: bigint; tx: Hex };
export type ReceiptLogs = {
  /** Sum of early fees, or null when the logs can't be read. */
  earlyFees: bigint | null;
  /** The wallet's holder payout, if paid. */
  holderPaid: Paid | null;
  /** What the creator took out (CreatorClaimed paid to this wallet). */
  creatorPaid: Paid | null;
};

/** The three reads the log scans need (a chain-specific viem client has narrower block types, so this is structural). */
type LogClient = {
  getBlockNumber: () => Promise<bigint>;
  getBlock: (a: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
  getLogs: PublicClient["getLogs"];
};
const CHUNK = BigInt(45_000);
const CONCURRENCY = 4;

const blockMemo = ttlCache<bigint>(500, 6 * 3_600_000);
/** The first block at or after `ts` (binary search on real block times). Past answers don't change, so they're remembered. */
export async function blockAtOrAfter(client: LogClient, ts: number, head: bigint): Promise<bigint> {
  const settled = ts < Date.now() / 1000 - 120;
  const hit = settled ? blockMemo.get(String(ts)) : undefined;
  if (hit !== undefined) return hit;
  let lo = BigInt(0);
  let hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const b = await client.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) >= ts) hi = mid;
    else lo = mid + BigInt(1);
  }
  if (settled) blockMemo.set(String(ts), lo);
  return lo;
}

async function scan<T>(from: bigint, to: bigint, read: (a: bigint, b: bigint) => Promise<T[]>): Promise<T[]> {
  const ranges: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += CHUNK) ranges.push([s, s + CHUNK - BigInt(1) > to ? to : s + CHUNK - BigInt(1)]);
  const out: T[][] = new Array(ranges.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, async () => {
      while (next < ranges.length) {
        const i = next++;
        out[i] = await read(ranges[i][0], ranges[i][1]);
      }
    }),
  );
  return out.flat();
}

const earlyFeeEvent = getAbiItem({ abi: hookAbi, name: "EarlyFee" });
const creatorClaimedEvent = getAbiItem({ abi: hookAbi, name: "CreatorClaimed" });
const claimedEvent = getAbiItem({ abi: rewardsAbi, name: "Claimed" });

export function sumFees(logs: { args: { fee?: bigint } }[]): bigint {
  return logs.reduce((t, l) => t + (l.args.fee ?? BigInt(0)), BigInt(0));
}

/** The last payment in a set of logs, with the total. */
export function paidFrom(logs: { args: { amount?: bigint }; transactionHash: Hex | null }[]): Paid | null {
  if (!logs.length) return null;
  const amount = logs.reduce((t, l) => t + (l.args.amount ?? BigInt(0)), BigInt(0));
  return { amount, tx: (logs[logs.length - 1].transactionHash ?? "0x") as Hex };
}

const feeMemo = ttlCache<bigint>(500, 24 * 3_600_000);

/** Early fees paid in the launch window, summed. Once the window is over the sum is final and kept; null when unreadable. */
export async function readEarlyFees(client: LogClient, hook: Address, coin: Address, launch: Pick<V4Launch, "launchedAt" | "windowSec">): Promise<bigint | null> {
  const endSec = launch.launchedAt + launch.windowSec + 60;
  const final = endSec < Date.now() / 1000 - 120;
  const key = coin.toLowerCase();
  const hit = final ? feeMemo.get(key) : undefined;
  if (hit !== undefined) return hit;
  try {
    const head = await client.getBlockNumber();
    const [from, to] = await Promise.all([blockAtOrAfter(client, launch.launchedAt, head), blockAtOrAfter(client, endSec, head)]);
    const logs = await scan(from, to, (a, b) => client.getLogs({ address: hook, event: earlyFeeEvent, args: { coin }, fromBlock: a, toBlock: b }));
    const sum = sumFees(logs as unknown as { args: { fee?: bigint } }[]);
    if (final) feeMemo.set(key, sum);
    return sum;
  } catch {
    return null;
  }
}

/**
 * What one wallet was paid: its holder payout (Claimed, scanned from the snapshot onward) and the creator's own
 * payouts (CreatorClaimed paid to it). Each part fails alone and reads as "nothing found".
 */
export async function readWalletPaid(
  client: LogClient,
  hook: Address,
  rewards: Address,
  coin: Address,
  wallet: Address,
  launch: Pick<V4Launch, "launchedAt">,
  paidFromSec: number,
): Promise<{ holderPaid: Paid | null; creatorPaid: Paid | null }> {
  const out: { holderPaid: Paid | null; creatorPaid: Paid | null } = { holderPaid: null, creatorPaid: null };
  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return out;
  }
  const fromLaunch = await blockAtOrAfter(client, launch.launchedAt, head).catch(() => BigInt(0));
  await Promise.all([
    (async () => {
      const start = (await blockAtOrAfter(client, paidFromSec, head).catch(() => fromLaunch)) || fromLaunch;
      const logs = await scan(start, head, (a, b) => client.getLogs({ address: rewards, event: claimedEvent, args: { coin, account: wallet }, fromBlock: a, toBlock: b }));
      out.holderPaid = paidFrom(logs as unknown as Parameters<typeof paidFrom>[0]);
    })().catch(() => {}),
    (async () => {
      const logs = await scan(fromLaunch, head, (a, b) => client.getLogs({ address: hook, event: creatorClaimedEvent, args: { coin }, fromBlock: a, toBlock: b }));
      const mine = (logs as unknown as { args: { to?: Address; amount?: bigint }; transactionHash: Hex | null }[]).filter((l) => l.args.to?.toLowerCase() === wallet.toLowerCase());
      out.creatorPaid = paidFrom(mine);
    })().catch(() => {}),
  ]);
  return out;
}

/* ---- The card ---- */

export type Receipt = {
  kind: "holder" | "creator";
  coin: string;
  launchDate: string;
  /** "—" when it can't be read. */
  earlyFees: string;
  choice: string;
  /** Holders only: the average held through day one, e.g. "1.25 million". */
  heldAmount: string | null;
  /** Holders only: "You held an average of X $COIN through day one". */
  held: string | null;
  shareEth: string;
  shareUsd: string | null;
  paid: boolean;
  tx: Hex | null;
};

/**
 * The receipt for a wallet: its holder line, or (failing that) the creator payout it received. Null when it has
 * neither. Numbers all come from the posted list and the chain, never from a caller's say-so.
 */
export function buildReceipt(o: {
  symbol: string;
  launch: V4Launch;
  file: RewardsFile | null;
  wallet: string;
  logs: ReceiptLogs;
  ethUsd: number | null;
}): Receipt | null {
  const line = receiptFor(o.file, o.wallet);
  const quote = quoteOf(o.launch);
  const sym = `$${shortSymbol(o.symbol)}`;
  const base = {
    coin: sym,
    launchDate: fmtDate(o.launch.launchedAt),
    earlyFees: o.logs.earlyFees === null ? "—" : fmtQuote(o.logs.earlyFees, quote),
    choice: rulesText(o.launch).join(" "),
  };
  // Dollar coins are paid in dollars already: no second dollar figure.
  const usd = (wei: bigint) => (quote === "USDC" ? null : fmtUsd(o.ethUsd === null ? null : Number(formatEther(wei)) * o.ethUsd));
  if (line) {
    const amount = BigInt(line.amount);
    const heldAmount = fmtCoins(BigInt(line.avgBalance));
    const paid = o.logs.holderPaid;
    return {
      ...base,
      kind: "holder",
      heldAmount,
      held: `You held an average of ${heldAmount} ${sym} through day one`,
      shareEth: fmtQuote(amount, quote),
      shareUsd: usd(amount),
      paid: paid !== null,
      tx: paid?.tx ?? null,
    };
  }
  const cp = o.logs.creatorPaid;
  if (cp) return { ...base, kind: "creator", heldAmount: null, held: null, shareEth: fmtQuote(cp.amount, quote), shareUsd: usd(cp.amount), paid: true, tx: cp.tx };
  return null;
}

export const CLAIM_PERIOD_SEC = 30 * 86_400;

/**
 * How Crux's list file stands against the chain: "unposted" until the Safe posts a root, "match" when the file's root is
 * the posted one, "mismatch" when they differ (the file is newer or older than what was posted; nothing in it is claimable).
 */
export type ListState = "unposted" | "match" | "mismatch";
export function listState(fileRoot: string | null | undefined, reward: { posted: boolean; root?: string }): ListState {
  if (!reward.posted) return "unposted";
  if (!fileRoot || !reward.root || fileRoot.toLowerCase() !== reward.root.toLowerCase()) return "mismatch";
  return "match";
}

/**
 * Whether to offer "Claim it yourself": the line exists, the list is posted, it hasn't been paid, wasn't swept to the
 * floor, the 30-day claim period (from posting) is still open, and the file's root is the one posted on chain (a proof from
 * any other list would only revert).
 */
export function canClaimYourself(
  line: RewardLine | null,
  fileRoot: string | null | undefined,
  reward: { posted: boolean; swept: boolean; postedAt?: number; root?: string },
  claimed: boolean,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!line || !reward.posted || reward.swept || claimed) return false;
  if (listState(fileRoot, reward) !== "match") return false;
  if (reward.postedAt && nowSec >= reward.postedAt + CLAIM_PERIOD_SEC) return false;
  return BigInt(line.amount) > BigInt(0);
}

/** ETH's price in dollars from Chainlink on Base; null when it can't be read or the answer is over 3 hours old. */
export async function readEthUsd(client: Pick<PublicClient, "readContract">, nowSec: number = Math.floor(Date.now() / 1000)): Promise<number | null> {
  try {
    const [, answer, , updatedAt] = await client.readContract({ address: ETH_USD_FEED, abi: ethUsdFeedAbi, functionName: "latestRoundData" });
    if (nowSec - Number(updatedAt) > 3 * 3600) return null;
    const n = Number(answer) / 1e8;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
