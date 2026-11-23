import { connection } from "next/server";
import { freshEvmCoins, scanEvmCoins, trendingEvmCoins, type EvmNetwork } from "@/lib/coinMarket";

/**
 * GET /api/market?network=bsc|base&kind=new|trending: BNB Chain's and Base's newest and trending coins, read from
 * GeckoTerminal by this server and CDN-cached for 20 s, so every visitor shares one read. GeckoTerminal allows ~30
 * reads a minute per caller: read from each visitor's browser, the rail and Trenches ran past it (live 2026-11-22: the
 * BNB and Base lists came back empty). When GeckoTerminal refuses, the last good list is served instead of nothing.
 */
const last = new Map<string, unknown[]>();

export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams;
  const network = q.get("network");
  const kind = q.get("kind");
  if ((network !== "bsc" && network !== "base") || (kind !== "new" && kind !== "trending" && kind !== "scan")) {
    return Response.json({ error: "network must be bsc or base, kind new, trending or scan" }, { status: 400 });
  }
  const key = `${network}:${kind}`;
  let coins: unknown[] = [];
  try {
    coins = kind === "new" ? await freshEvmCoins(network as EvmNetwork) : kind === "scan" ? await scanEvmCoins(network as EvmNetwork) : await trendingEvmCoins(network as EvmNetwork);
  } catch {
    coins = [];
  }
  const fresh = coins.length > 0;
  if (fresh) last.set(key, coins);
  else coins = last.get(key) ?? [];
  return Response.json(
    { coins },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        // A refused read (empty) is retried within seconds; a good list is shared for 20 s.
        "Cache-Control": fresh ? "public, s-maxage=20, stale-while-revalidate=120" : "public, s-maxage=5",
      },
    },
  );
}
