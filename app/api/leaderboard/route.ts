import { connection } from "next/server";
import { feedResponse } from "@/lib/launchFeed";
import { readLeaderboards } from "@/lib/leaderboard";
import { NETWORK_NAME } from "@/lib/network";
import { IS_TESTNET, NETWORK } from "@/lib/network";

/**
 * GET /api/leaderboard: the Discover boards. Top 10 Crux memecoins by market cap and the 10 wallets with the best PnL
 * across them, counting only markets with at least the liquidity floor (minLiquidityUsd). CDN-cached for a minute.
 */
export async function GET() {
  await connection();
  try {
    return feedResponse({ chainId: NETWORK.chain.id, testnet: IS_TESTNET, generatedAt: new Date().toISOString(), ...(await readLeaderboards()) }, 200, 60);
  } catch {
    return feedResponse({ error: `Couldn't read ${NETWORK_NAME} right now. Retry shortly.` }, 503);
  }
}
