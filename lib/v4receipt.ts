import { formatEther, formatUnits, getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { ETH_USD_FEED, ethUsdFeedAbi } from "./v4create.ts";
import { hookAbi, rewardsAbi, rulesText, type V4Launch } from "./v4launch.ts";

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

/** Reads a coin's list from the relay; null when there is none yet (404) or it can't be read. */
export async function fetchRewards(relay: string, coin: string, fetcher: typeof fetch = fetch): Promise<RewardsFile | null> {
  if (!isAddress40(coin)) return null;
  try {
    const r = await fetcher(`${relay.replace(/\/$/, "")}/v1/v4/rewards/${coin}`);
    if (!r.ok) return null;
    const j = (await r.json()) as RewardsFile;
    return j && Array.isArray(j.list) ? j : null;
  } catch {
    return null;
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

/** The first block at or after `ts` (binary search on real block times). */
export async function blockAtOrAfter(client: LogClient, ts: number, head: bigint): Promise<bigint> {
  let lo = BigInt(0);
  let hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const b = await client.getBlock({ blockNumber: mid });
    if (Number(b.timestamp) >= ts) hi = mid;
    else lo = mid + BigInt(1);
  }
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

/**
 * Reads what the receipt needs from chain logs: the early fees paid in the launch window, the wallet's holder payout
 * (Claimed) and the creator's own payouts (CreatorClaimed). Each part fails alone: a missing read shows as "—".
 */
export async function readReceiptLogs(
  client: LogClient,
  hook: Address,
  rewards: Address,
  coin: Address,
  wallet: Address | null,
  launch: Pick<V4Launch, "launchedAt" | "windowSec">,
  paidFromSec: number,
): Promise<ReceiptLogs> {
  const out: ReceiptLogs = { earlyFees: null, holderPaid: null, creatorPaid: null };
  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return out;
  }
  let launchBlock: bigint | null = null;
  try {
    launchBlock = await blockAtOrAfter(client, launch.launchedAt, head);
  } catch {}
  const fromLaunch = launchBlock ?? BigInt(0);
  await Promise.all([
    (async () => {
      if (launchBlock === null) return;
      // Early fees only exist inside the window: one short read.
      const endBlock = await blockAtOrAfter(client, launch.launchedAt + launch.windowSec + 60, head);
      const logs = await scan(fromLaunch, endBlock, (a, b) => client.getLogs({ address: hook, event: earlyFeeEvent, args: { coin }, fromBlock: a, toBlock: b }));
      out.earlyFees = sumFees(logs as unknown as { args: { fee?: bigint } }[]);
    })().catch(() => {}),
    (async () => {
      if (!wallet) return;
      const start = (await blockAtOrAfter(client, paidFromSec, head).catch(() => fromLaunch)) || fromLaunch;
      const logs = await scan(start, head, (a, b) => client.getLogs({ address: rewards, event: claimedEvent, args: { coin, account: wallet }, fromBlock: a, toBlock: b }));
      out.holderPaid = paidFrom(logs as unknown as Parameters<typeof paidFrom>[0]);
    })().catch(() => {}),
    (async () => {
      if (!wallet) return;
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
  const sym = `$${o.symbol.replace(/^\$/, "")}`;
  const rules = rulesText(o.launch);
  const base = {
    coin: sym,
    launchDate: fmtDate(o.launch.launchedAt),
    earlyFees: o.logs.earlyFees === null ? "—" : fmtEth(o.logs.earlyFees),
    choice: rules.join(" "),
  };
  const usd = (wei: bigint) => fmtUsd(o.ethUsd === null ? null : Number(formatEther(wei)) * o.ethUsd);
  if (line) {
    const amount = BigInt(line.amount);
    const paid = o.logs.holderPaid;
    return {
      ...base,
      kind: "holder",
      held: `You held an average of ${fmtCoins(BigInt(line.avgBalance))} ${sym} through day one`,
      shareEth: fmtEth(amount),
      shareUsd: usd(amount),
      paid: paid !== null,
      tx: paid?.tx ?? null,
    };
  }
  const cp = o.logs.creatorPaid;
  if (cp) return { ...base, kind: "creator", held: null, shareEth: fmtEth(cp.amount), shareUsd: usd(cp.amount), paid: true, tx: cp.tx };
  return null;
}

/** Whether to offer "Claim it yourself": the line exists, the list is posted and it hasn't been paid. */
export function canClaimYourself(line: RewardLine | null, posted: boolean, claimed: boolean): boolean {
  return Boolean(line && posted && !claimed && BigInt(line.amount) > BigInt(0));
}

/** ETH's price in dollars from Chainlink on Base, or null when it can't be read. */
export async function readEthUsd(client: Pick<PublicClient, "readContract">): Promise<number | null> {
  try {
    const [, answer] = await client.readContract({ address: ETH_USD_FEED, abi: ethUsdFeedAbi, functionName: "latestRoundData" });
    const n = Number(answer) / 1e8;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
