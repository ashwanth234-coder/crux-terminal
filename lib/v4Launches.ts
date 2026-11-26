import { createPublicClient, erc20Abi, fallback, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { parseTokenMeta, tokenMetaAbi, type TokenMeta } from "./tokenMeta.ts";
import { BASE_LOGS_RPCS, BASE_RPCS, NETWORK } from "./network.ts";
import { V4_FACTORY } from "./v4create.ts";

/**
 * Every Crux V4 coin's ticker and metadata, from CruxV4LaunchFactory's Launched events on Base mainnet (server side):
 * what the anti-copycat check compares a new launch against. A V4 coin is never cancelled, so its ticker, artwork and
 * X account stay taken for good. Empty on the test site (V4 is on Base mainnet only).
 */
const FACTORY_BLOCK = BigInt(62157561);
/** Blocks per log read (public nodes cap a range). */
const CHUNK = BigInt(40_000);
const launched = parseAbiItem(
  "event Launched(address indexed coin, address indexed creator, bytes32 poolId, uint32 window, uint16 toCreatorBps, uint16 toLiquidityBps, uint16 toHoldersBps, uint256 creatorBought, uint256 vested, uint256 vestId)",
);
const logsClient = createPublicClient({ chain: base, transport: fallback(BASE_LOGS_RPCS.map((u) => http(u, { timeout: 10_000 }))) });
const client = createPublicClient({ chain: base, transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))) });

export type V4GuardLaunch = { token: Address; symbol: string; metadata: TokenMeta };

/** Coins found so far and the last block read: each call only reads what's new (a coin's ticker and metadata are fixed). */
let known: V4GuardLaunch[] = [];
let scanned = FACTORY_BLOCK - BigInt(1);

let running: Promise<V4GuardLaunch[]> | null = null;

export function readV4Launches(): Promise<V4GuardLaunch[]> {
  if (NETWORK.testnet) return Promise.resolve([]);
  // One read at a time, so two checks at once don't add the same coins twice.
  running ??= scan().finally(() => (running = null));
  return running;
}

async function scan(): Promise<V4GuardLaunch[]> {
  const head = await client.getBlockNumber();
  const found: Address[] = [];
  let from = scanned + BigInt(1);
  while (from <= head) {
    const to = from + CHUNK - BigInt(1) < head ? from + CHUNK - BigInt(1) : head;
    const logs = await logsClient.getLogs({ address: V4_FACTORY, event: launched, fromBlock: from, toBlock: to });
    for (const l of logs) if (l.args.coin) found.push(l.args.coin);
    from = to + BigInt(1);
  }
  if (found.length > 0) {
    const meta = await client.multicall({
      allowFailure: true,
      contracts: found.flatMap((t) => [
        { address: t, abi: erc20Abi, functionName: "symbol" } as const,
        { address: t, abi: tokenMetaAbi, functionName: "metadataURI" } as const,
      ]),
    });
    known = [
      ...known,
      ...found.map((token, i) => ({ token, symbol: (meta[i * 2]?.result as string | undefined) ?? "", metadata: parseTokenMeta(meta[i * 2 + 1]?.result as string | undefined) })),
    ];
  }
  scanned = head;
  return known;
}
