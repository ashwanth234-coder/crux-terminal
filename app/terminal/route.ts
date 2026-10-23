import { connection } from "next/server";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { cruxBatchFactoryAbi } from "@/contracts/abis/batchAuction";
import { FACTORY_V3, FACTORY_V4, FACTORY_V5 } from "@/lib/intents";
import { phaseV2, toAuctionV2, type AuctionV2 } from "@/lib/launchV2";

/** How many of the newest V3 auctions to consider. */
const LOOKBACK = 20;
/** Where to send traders when there is no V3 launch to open (or the chain can't be read). */
const FALLBACK = "/launches";

// Same Base Sepolia endpoint as the wagmi config: the override if set, else the chain's public RPC.
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || undefined, { timeout: 5_000 }),
});

/**
 * The pro terminal to open: the newest V3 auction taking bids, else the newest graduated one
 * (tradeable through intents), else the newest of any kind. `auctions` is newest first.
 */
function pickTerminal(auctions: { id: number; auction: AuctionV2 }[], now: number): number | null {
  const phased = auctions.map((a) => ({ id: a.id, phase: phaseV2(a.auction, now) }));
  return (phased.find((a) => a.phase === "open") ?? phased.find((a) => a.phase === "graduated") ?? phased[0])?.id ?? null;
}

async function latestTerminal(): Promise<string> {
  // The newest factory first: V5 once deployed, else V4, else V3.
  const version = FACTORY_V5 ? 5 : FACTORY_V4 ? 4 : 3;
  const address = FACTORY_V5 ?? FACTORY_V4 ?? FACTORY_V3;
  if (!address) return FALLBACK;
  const factory = { address, abi: cruxBatchFactoryAbi } as const;
  const count = Number(await client.readContract({ ...factory, functionName: "auctionCount" }));
  const ids = Array.from({ length: Math.min(count, LOOKBACK) }, (_, i) => count - 1 - i);
  if (ids.length === 0) return FALLBACK;
  const results = await client.multicall({
    contracts: ids.map((id) => ({ ...factory, functionName: "getAuction" as const, args: [BigInt(id)] as const })),
  });
  const auctions = ids.flatMap((id, i) => {
    const r = results[i];
    return r.status === "success" ? [{ id, auction: toAuctionV2(r.result) }] : [];
  });
  const id = pickTerminal(auctions, Math.floor(Date.now() / 1000));
  return id === null ? FALLBACK : `/launch/v${version}/${id}`;
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
