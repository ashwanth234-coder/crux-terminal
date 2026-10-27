import { connection } from "next/server";
import { feedResponse } from "@/lib/launchFeed";
import { readLeaderboards } from "@/lib/leaderboard";

/**
 * GET /api/leaderboard: the Discover boards. Top 10 Crux memecoins by market cap and the 10 wallets with the best PnL
 * across them, counting only markets with at least the liquidity floor (minLiquidityUsd). CDN-cached for a minute.
 */
export async function GET() {
  await connection();
  try {
    return feedResponse({ chainId: 84532, testnet: true, generatedAt: new Date().toISOString(), ...(await readLeaderboards()) }, 200, 60);
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
