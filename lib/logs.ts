import { createPublicClient, fallback, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

// sepolia.base.org caps eth_getLogs at 200 blocks; publicnode allows 50k per call, Tenderly is the fallback.
const LOGS_RPCS = [process.env.NEXT_PUBLIC_BASE_SEPOLIA_LOGS_RPC, "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.gateway.tenderly.co"].filter(
  (u): u is string => Boolean(u),
);

/** Base Sepolia client for wide log scans (the terminal's tape and demand curve). */
export const logClient = createPublicClient({ chain: baseSepolia, transport: fallback(LOGS_RPCS.map((u) => http(u, { timeout: 15_000 }))) });
/** The same RPCs with JSON-RPC batching, for dating many blocks at once. */
const blockClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback(LOGS_RPCS.map((u) => http(u, { timeout: 15_000, batch: { batchSize: 50 } }))),
});

/*
 * Nothing here assumes a block time. Base Sepolia's changed under us (2 s per block until about 2026-10-21, 0.2 s
 * since), and a fixed one put scans in the wrong blocks and dated every log wrongly. Windows are found from real
 * block timestamps, and every log is dated by its own block.
 */

export const LOG_CHUNK = BigInt(45_000);
/** How far back a scan reads; older history isn't fetched (and the UI says so). */
const WINDOW_SECONDS = 3 * 86_400;
export const LOG_WINDOW_LABEL = "three days";
/** eth_getLogs calls in flight per scan, so a first read of a long window doesn't burst the public RPC. */
const SCAN_CONCURRENCY = 6;

/** Block ranges covering [from, head], each within the logs RPC's 50k-block limit. */
export function logRanges(from: bigint, head: bigint): [bigint, bigint][] {
  const ranges: [bigint, bigint][] = [];
  for (let start = from < BigInt(0) ? BigInt(0) : from; start <= head; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - BigInt(1);
    ranges.push([start, end > head ? head : end]);
  }
  return ranges;
}

/**
 * Already-read blocks that every poll reads again (20 s of Base blocks). A log reorged out of them is dropped and its
 * replacement picked up, and a node that reports a head before its log index has caught up gets a second look.
 */
const REORG_BLOCKS = BigInt(100);

/**
 * Blocks every scan stays behind the reported head. Public RPCs are pools of nodes a block or two apart, and a
 * node rejects eth_getLogs past its own head ("block range extends beyond current head block"), so a head read
 * from one node and a range served by another would fail now and then. Also used for the origin chains' scans.
 */
export const HEAD_LAG = BigInt(2);
/** The same on Base, in its 0.2 s blocks: 2 s. */
const BASE_HEAD_LAG = BigInt(10);

type Positioned = { blockNumber: bigint; logIndex: number; txHash: Hex; time: number };

/** One data set of logs (an auction's bids, a pool's swaps), kept in the query cache and extended by each poll. */
export type LogScan<T extends Positioned> = {
  /** Oldest first. */
  items: T[];
  /** First block of the window; scans never read below it. */
  floor: bigint;
  /** Last block read. */
  scannedTo: bigint;
  /** True when the data set is older than the window, so early logs may be missing. */
  truncated: boolean;
  /** The window in blocks, at the block time measured when it was found. */
  windowBlocks: bigint;
};

/** Reads one block range of the data set's logs, mapped to items; scanLogs dates them (`time`). */
export type ReadLogs<T extends Positioned> = (fromBlock: bigint, toBlock: bigint) => Promise<Omit<T, "time">[]>;

const logKey = (i: Positioned) => `${i.txHash}:${i.logIndex}`;
const byPosition = (a: Positioned, b: Positioned) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);

/** Unix time of each block read so far. A block's time doesn't change, so each is read once per page load. */
const blockTimes = new Map<bigint, number>();
async function blockTime(blockNumber: bigint) {
  let t = blockTimes.get(blockNumber);
  if (t === undefined) {
    t = Number((await blockClient.getBlock({ blockNumber })).timestamp);
    blockTimes.set(blockNumber, t);
  }
  return t;
}

async function readRanges<T extends Positioned>(from: bigint, head: bigint, read: ReadLogs<T>): Promise<T[]> {
  const ranges = logRanges(from, head);
  const chunks: Omit<T, "time">[][] = [];
  for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
    chunks.push(...(await Promise.all(ranges.slice(i, i + SCAN_CONCURRENCY).map(([fromBlock, toBlock]) => read(fromBlock, toBlock)))));
  }
  const items = chunks.flat();
  await Promise.all([...new Set(items.map((i) => i.blockNumber))].map(blockTime));
  return items.map((i) => ({ ...i, time: blockTimes.get(i.blockNumber)! }) as T);
}

/**
 * The window for a data set that begins at `since`: from a block at or before it, or from the window's edge if
 * `since` is older. Found from block timestamps, not an assumed block time.
 */
async function findWindow(since: number) {
  const head = await logClient.getBlock();
  const sample = head.number > BigInt(10_000) ? head.number - BigInt(10_000) : BigInt(0);
  const secondsPerBlock = Math.max(0.05, (Number(head.timestamp) - (await blockTime(sample))) / Math.max(1, Number(head.number - sample)));
  const windowBlocks = BigInt(Math.ceil(WINDOW_SECONDS / secondsPerBlock));
  const edge = head.number > windowBlocks ? head.number - windowBlocks : BigInt(0);
  // Step back at the current block time. If older blocks were faster, that lands after `since`: step again from there.
  let wanted = head.number;
  let time = Number(head.timestamp);
  for (let i = 0; i < 4 && time > since && wanted > edge; i++) {
    wanted -= BigInt(Math.ceil((time - since) / secondsPerBlock) + 50);
    if (wanted > edge) time = await blockTime(wanted);
  }
  return { head: head.number, floor: wanted > edge ? wanted : edge, truncated: wanted < edge, windowBlocks };
}

/** The window, in Base's 0.2 s blocks, given to a data set seeded from the relay's history. */
const SEEDED_WINDOW_BLOCKS = BigInt(Math.ceil(WINDOW_SECONDS / 0.2));

/**
 * A data set's logs since `since` (unix seconds). With no `prev`, starts from `seed` (the relay's full history, when
 * it has it: everything up to a recent block, so only the blocks after it are read here) or else reads the window.
 * After that, each poll costs one eth_blockNumber plus one eth_getLogs over the new blocks and the reorg margin (and
 * one block read per new block with a log, to date it), and returns `prev` itself when no block has landed.
 */
export async function scanLogs<T extends Positioned>(
  prev: LogScan<T> | undefined,
  since: number,
  read: ReadLogs<T>,
  seed?: () => Promise<{ items: T[]; scannedTo: bigint } | null>,
): Promise<LogScan<T>> {
  if (!prev && seed) {
    const s = await seed().catch(() => null);
    if (s) prev = { items: [...s.items].sort(byPosition), floor: BigInt(0), scannedTo: s.scannedTo, truncated: false, windowBlocks: SEEDED_WINDOW_BLOCKS };
  }
  if (prev) {
    // Reuse a head up to a second old, so the bid and swap polls on one page can share it.
    const head = (await logClient.getBlockNumber({ cacheTime: 1_000 })) - BASE_HEAD_LAG;
    if (head <= prev.scannedTo) return prev;
    const margin = prev.scannedTo - REORG_BLOCKS + BigInt(1);
    const from = margin > prev.floor ? margin : prev.floor;
    // Polls pause while the tab is hidden; after a gap wider than the window, read the window afresh.
    if (head - from < prev.windowBlocks) {
      const fresh = await readRanges(from, head, read);
      // The re-read blocks replace what was there; a log that moved deeper than the margin is kept once.
      const seen = new Set(fresh.map(logKey));
      const kept = prev.items.filter((i) => i.blockNumber < from && !seen.has(logKey(i)));
      return { ...prev, items: [...kept, ...fresh].sort(byPosition), scannedTo: head };
    }
  }

  const { head, floor, truncated, windowBlocks } = await findWindow(since);
  const end = head - BASE_HEAD_LAG;
  const items = await readRanges(floor, end, read);
  return { items: items.sort(byPosition), floor, scannedTo: end, truncated, windowBlocks };
}

const MAX_BACKOFF_MS = 120_000;
/** Consecutive failed reads per polled data set. */
const failures = new Map<string, number>();

/** Runs one read of a polled data set, counting consecutive failures so its poll can back off. */
export async function tracked<T>(id: string, read: () => Promise<T>): Promise<T> {
  try {
    const result = await read();
    failures.delete(id);
    return result;
  } catch (err) {
    failures.set(id, (failures.get(id) ?? 0) + 1);
    throw err;
  }
}

/**
 * The poll interval for a data set: `every` while reads succeed; after a failure, doubling per consecutive failure up
 * to two minutes, so a rate-limited RPC isn't hammered. A failed read is retried even when the set isn't polled.
 */
export function pollInterval(id: string, every: number | false, base = 6_000): number | false {
  const n = failures.get(id) ?? 0;
  return n === 0 ? every : Math.min((every || base) * 2 ** n, MAX_BACKOFF_MS);
}
