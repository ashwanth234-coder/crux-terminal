import { createPublicClient, fallback, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

// sepolia.base.org caps eth_getLogs at 200 blocks; publicnode allows 50k per call, Tenderly is the fallback.
const LOGS_RPCS = [process.env.NEXT_PUBLIC_BASE_SEPOLIA_LOGS_RPC, "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.gateway.tenderly.co"].filter(
  (u): u is string => Boolean(u),
);

/** Base Sepolia client for wide log scans (the terminal's tape and demand curve). */
export const logClient = createPublicClient({ chain: baseSepolia, transport: fallback(LOGS_RPCS.map((u) => http(u, { timeout: 15_000 }))) });

export const BLOCK_SECONDS = 2; // Base Sepolia
export const LOG_CHUNK = BigInt(45_000);
/** About six days of blocks per scan; older history isn't fetched (and the UI says so). */
export const MAX_LOG_CHUNKS = 6;

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
 * Already-read blocks that every poll reads again. A log reorged out of them is dropped and its replacement picked up,
 * and a node that reports a head before its log index has caught up gets a second look.
 */
const REORG_BLOCKS = BigInt(20);

type Positioned = { blockNumber: bigint; logIndex: number; txHash: Hex };

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
  /** One block and its unix time; every other block is dated from it (Base blocks are exactly 2s apart). */
  anchor: { block: bigint; time: number };
};

/** Reads one block range of the data set's logs, mapped to items. `timeOf` dates a block. */
export type ReadLogs<T> = (fromBlock: bigint, toBlock: bigint, timeOf: (block: bigint) => number) => Promise<T[]>;

const logKey = (i: Positioned) => `${i.txHash}:${i.logIndex}`;
const byPosition = (a: Positioned, b: Positioned) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);

async function readRanges<T>(from: bigint, head: bigint, read: ReadLogs<T>, timeOf: (block: bigint) => number) {
  const chunks = await Promise.all(logRanges(from, head).map(([fromBlock, toBlock]) => read(fromBlock, toBlock, timeOf)));
  return chunks.flat();
}

/**
 * A data set's logs since `since` (unix seconds). With no `prev`, reads the whole window (up to MAX_LOG_CHUNKS calls).
 * After that, each poll costs one eth_blockNumber plus one eth_getLogs over the new blocks and the reorg margin,
 * and returns `prev` itself when no block has landed.
 */
export async function scanLogs<T extends Positioned>(prev: LogScan<T> | undefined, since: number, read: ReadLogs<T>): Promise<LogScan<T>> {
  if (prev) {
    // Reuse a head at most one block old, so the bid and swap polls on one page can share it.
    const head = await logClient.getBlockNumber({ cacheTime: BLOCK_SECONDS * 1000 });
    if (head <= prev.scannedTo) return prev;
    const margin = prev.scannedTo - REORG_BLOCKS + BigInt(1);
    const from = margin > prev.floor ? margin : prev.floor;
    // Polls pause while the tab is hidden; after a gap wider than the window, read the window afresh.
    if (head - from < LOG_CHUNK * BigInt(MAX_LOG_CHUNKS)) {
      const { block, time } = prev.anchor;
      const fresh = await readRanges(from, head, read, (b) => time + Number(b - block) * BLOCK_SECONDS);
      // The re-read blocks replace what was there; a log that moved deeper than the margin is kept once.
      const seen = new Set(fresh.map(logKey));
      const kept = prev.items.filter((i) => i.blockNumber < from && !seen.has(logKey(i)));
      return { ...prev, items: [...kept, ...fresh].sort(byPosition), scannedTo: head };
    }
  }

  const head = await logClient.getBlock();
  const elapsed = Math.max(0, Number(head.timestamp) - since);
  // Nothing in the data set predates `since`: begin a little earlier than that block.
  const wanted = head.number - BigInt(Math.ceil(elapsed / BLOCK_SECONDS) + 300);
  const floorBlock = head.number - LOG_CHUNK * BigInt(MAX_LOG_CHUNKS);
  const floor = wanted > floorBlock ? wanted : floorBlock < BigInt(0) ? BigInt(0) : floorBlock;
  const anchor = { block: head.number, time: Number(head.timestamp) };
  const items = await readRanges(floor, head.number, read, (b) => anchor.time - Number(anchor.block - b) * BLOCK_SECONDS);
  return { items: items.sort(byPosition), floor, scannedTo: head.number, truncated: wanted < floorBlock, anchor };
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
