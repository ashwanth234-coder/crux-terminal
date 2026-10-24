import { connection } from "next/server";
import { isAddress } from "viem";
import { feedResponse } from "@/lib/launchFeed";
import { API_NOTES, launchOfPair, readTrades, tradeJson } from "@/lib/marketData";

const MAX_LIMIT = 500;

/**
 * GET /api/trades?pair=0x…: a graduated launch's trades, newest first: Uniswap V2 swaps and, during an anti-sniper
 * window, batch-pool fills at their batch's price. ?limit (default 100, max 500); ?before=<blockNumber> pages back.
 * Open to any origin; CDN-cached 10 s. Documented at /developers.
 */
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const pair = params.get("pair");
  if (!pair || !isAddress(pair)) return feedResponse({ error: "pair (an address) is required" }, 400);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? 100) || 100));
  const beforeRaw = params.get("before");
  if (beforeRaw !== null && !/^\d+$/.test(beforeRaw)) return feedResponse({ error: "before must be a block number" }, 400);
  const before = beforeRaw !== null ? BigInt(beforeRaw) : null;
  try {
    const launch = await launchOfPair(pair);
    if (!launch) return feedResponse({ error: "No graduated Crux launch has that pair." }, 404);
    const { trades, truncated } = await readTrades(launch);
    const newestFirst = [...trades].reverse().filter((t) => before === null || t.blockNumber < before);
    const page = newestFirst.slice(0, limit);
    return feedResponse(
      {
        ...API_NOTES,
        generatedAt: new Date().toISOString(),
        pair,
        baseToken: { address: launch.token, symbol: launch.symbol },
        truncated,
        trades: page.map(tradeJson),
        // The next page: trades in blocks before the last one returned.
        next: newestFirst.length > limit ? `/api/trades?pair=${pair}&limit=${limit}&before=${page[page.length - 1].blockNumber}` : null,
      },
      200,
      10,
    );
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
