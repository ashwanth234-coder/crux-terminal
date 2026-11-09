import { connection } from "next/server";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7, FACTORY_V8 } from "@/lib/intents";
import { phaseV2, toAuctionV2, type AuctionV2 } from "@/lib/launchV2";
import { FACTORY_V9, V9_ON, factoryV9Abi } from "@/lib/v9";

/** How many of each factory's newest launches to consider. */
const LOOKBACK = 20;
/** Where to send traders when there is no launch to open (or the chain can't be read). */
const FALLBACK = "/launches";

// Same Base Sepolia endpoint as the wagmi config: the override if set, else the chain's public RPC.
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined, { timeout: 5_000 }),
});

type Candidate = { version: number; id: number; auction: AuctionV2 };

/**
 * The pro terminal to open, across every factory: the opening taking buys right now (the newest to start), else the
 * most recently graduated token (tradeable). Never a cancelled, closing or scheduled launch: nothing to trade there.
 */
function pickTerminal(candidates: Candidate[], now: number): Candidate | null {
  const phased = candidates.map((c) => ({ ...c, phase: phaseV2(c.auction, now) }));
  const open = phased.filter((c) => c.phase === "open").sort((a, b) => b.auction.startTime - a.auction.startTime)[0];
  if (open) return open;
  return phased.filter((c) => c.phase === "graduated").sort((a, b) => b.auction.settledAt - a.auction.settledAt)[0] ?? null;
}

/** The newest LOOKBACK launches of one factory (none for a factory fresh out of deployment). */
async function launchesOf(version: number, address: `0x${string}`): Promise<Candidate[]> {
  const f = { address, abi: cruxBatchFactoryAbi } as const;
  const count = Number(await client.readContract({ ...f, functionName: "auctionCount" }));
  const ids = Array.from({ length: Math.min(count, LOOKBACK) }, (_, i) => count - 1 - i);
  if (ids.length === 0) return [];
  const results = await client.multicall({ contracts: ids.map((id) => ({ ...f, functionName: "getAuction" as const, args: [BigInt(id)] as const })) });
  return ids.flatMap((id, i) => {
    const r = results[i];
    return r.status === "success" ? [{ version, id, auction: toAuctionV2(r.result) }] : [];
  });
}

/** The newest curve launch's terminal (launches are curve launches now), or null when there's none yet. */
async function latestV9(): Promise<string | null> {
  const count = Number(await client.readContract({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount" }));
  return count > 0 ? `/launch/v9/${count - 1}` : null;
}

async function latestTerminal(): Promise<string> {
  if (V9_ON) return (await latestV9()) ?? "/discover";
  const factories = ([[8, FACTORY_V8], [7, FACTORY_V7], [6, FACTORY_V6], [5, FACTORY_V5], [4, FACTORY_V4], [3, FACTORY_V3]] as const).filter(
    (c): c is readonly [8 | 7 | 6 | 5 | 4 | 3, `0x${string}`] => c[1] !== null,
  );
  // One factory that can't be read doesn't hide the others' launches.
  const all = (await Promise.all(factories.map(([v, address]) => launchesOf(v, address).catch(() => [] as Candidate[])))).flat();
  const pick = pickTerminal(all, Math.floor(Date.now() / 1000));
  return pick ? `/launch/v${pick.version}/${pick.id}` : FALLBACK;
}

/** /terminal: one click from the nav into the live pro trading view, resolved on-chain per request. */
export async function GET(request: Request) {
  await connection();
  let path = FALLBACK;
  try {
    path = await latestTerminal();
  } catch {
    // Base Sepolia unreachable: the launch list still loads and retries on its own.
  }
  return new Response(null, {
    status: 307,
    headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" },
  });
}
