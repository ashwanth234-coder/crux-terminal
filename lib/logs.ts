import { createPublicClient, fallback, http } from "viem";
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
