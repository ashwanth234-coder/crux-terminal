import { connection } from "next/server";
import { isAddress } from "viem";
import { INTERVALS, toCandles } from "@/lib/candles";
import { feedResponse } from "@/lib/launchFeed";
import { API_NOTES, launchOfPair, readTrades } from "@/lib/marketData";

const BY_LABEL = new Map<string, number>(INTERVALS.map((i) => [i.label.toLowerCase(), i.seconds]));
const MAX_LIMIT = 1000;

/**
 * GET /api/candles?pair=0x…&interval=5m: OHLCV candles of a graduated launch, oldest first, built from its trades
 * exactly as the terminal's chart builds them (each candle opens at the previous close; the first at the auction's
 * clearing price). interval: 1m, 5m (default), 15m, 1h, 4h, 1d. ?limit: the most recent N (default 300, max 1000).
 * Open to any origin; CDN-cached 15 s. Documented at /developers.
 */
export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const pair = params.get("pair");
  if (!pair || !isAddress(pair)) return feedResponse({ error: "pair (an address) is required" }, 400);
  const label = (params.get("interval") ?? "5m").toLowerCase();
  const interval = BY_LABEL.get(label);
  if (!interval) return feedResponse({ error: `interval must be one of ${[...BY_LABEL.keys()].join(", ")}` }, 400);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? 300) || 300));
  try {
    const launch = await launchOfPair(pair);
    if (!launch) return feedResponse({ error: "No graduated Crux launch has that pair." }, 404);
    const { trades, truncated } = await readTrades(launch);
    const candles = toCandles(
      trades.map((t) => ({ time: t.time, price: t.price, usdc: t.usdc })),
      interval,
      launch.clearingPriceUsd && launch.clearingPriceUsd > 0 ? launch.clearingPriceUsd : null,
    ).slice(-limit);
    return feedResponse(
      {
        ...API_NOTES,
        generatedAt: new Date().toISOString(),
        pair,
        baseToken: { address: launch.token, symbol: launch.symbol },
        interval: label,
        intervalSeconds: interval,
        truncated,
        candles: candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volumeUsd: c.volume, trades: c.trades })),
      },
      200,
      15,
    );
  } catch {
    return feedResponse({ error: "Couldn't read Base Sepolia right now. Retry shortly." }, 503);
  }
}
