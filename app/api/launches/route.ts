import { connection } from "next/server";
import { feedResponse, readLaunches } from "@/lib/launchFeed";

/**
 * GET /api/launches: every Crux launch on Base Sepolia, newest first, read live from the batch factories.
 * Open to any origin and CDN-cached for a minute, for indexers, trading terminals and bots.
 * ?phase=graduated (or open, scheduled, closed, cancelled) filters.
 */
export async function GET(request: Request) {
  await connection();
  const phase = new URL(request.url).searchParams.get("phase");
  try {
    const launches = await readLaunches();
    return feedResponse({
      chainId: 84532,
      network: "base-sepolia",
      testnet: true,
      generatedAt: new Date().toISOString(),
      notes: "Test tokens on Base Sepolia only. Prices are in test USDC. Graduated pools are Uniswap V2 pairs whose LP tokens are burned.",
      launches: phase ? launches.filter((l) => l.phase === phase) : launches,
    });
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
