import { connection } from "next/server";
import { isAddress } from "viem";
import { feedResponse } from "@/lib/launchFeed";
import { API_NOTES, readPair, readPairs } from "@/lib/marketData";

/**
 * GET /api/pairs: every graduated Crux launch's market on Base Sepolia (its Uniswap V2 pair, where it trades now,
 * live reserves and price), newest launch first. ?pair=0x… returns one. Open to any origin; CDN-cached 30 s.
 * Documented at /developers.
 */
export async function GET(request: Request) {
  await connection();
  const pair = new URL(request.url).searchParams.get("pair");
  if (pair !== null && !isAddress(pair)) return feedResponse({ error: "pair must be an address" }, 400);
  try {
    if (pair) {
      const one = await readPair(pair);
      return one ? feedResponse({ ...API_NOTES, generatedAt: new Date().toISOString(), pair: one }, 200, 30) : feedResponse({ error: "No graduated Crux launch has that pair." }, 404);
    }
    return feedResponse({ ...API_NOTES, generatedAt: new Date().toISOString(), pairs: await readPairs() }, 200, 30);
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
