import { createPublicClient, erc20Abi, formatUnits, http, zeroAddress, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { cruxBatchFactoryAbi, factoryV4Abi, factoryV6Abi } from "@/contracts/abis/batchAuction";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6 } from "@/lib/intents";
import { PRICE_DECIMALS, V2_VESTING_DAYS, phaseV2, toAuctionV2, type PhaseV2 } from "@/lib/launchV2";
import { SITE_URL } from "@/lib/site";
import { parseTokenMeta, tokenMetaAbi, type TokenMeta } from "@/lib/tokenMeta";

/**
 * Every Crux launch, read straight from the batch factories on Base Sepolia: what /api/launches and
 * /tokenlist.json publish for indexers, terminals and wallets. Server-side only.
 */

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://base-sepolia-rpc.publicnode.com", { timeout: 8_000 }),
});

export type FeedLaunch = {
  /** "v3#0": factory version and auction id. */
  key: string;
  version: 2 | 3 | 4 | 5 | 6;
  auctionId: number;
  token: Address;
  name: string;
  symbol: string;
  decimals: 18;
  creator: Address;
  phase: PhaseV2;
  /** Unix seconds. */
  startTime: number;
  closesAt: number;
  /** Test USDC, as decimal strings (6 decimals). */
  graduationTarget: string;
  raised: string;
  /** USD per token at the batch's uniform clearing price, once graduated. */
  clearingPriceUsd: number | null;
  totalSupply: string;
  /** The locked Uniswap V2 pool (token / test USDC), once graduated; its LP tokens are burned. */
  pool: Address | null;
  lpBurned: boolean;
  /** 30, or 0 when the creator chose an instant unlock (V4). */
  creatorVestingDays: number;
  /** Unix seconds the auction graduated (its pool opened), or null. */
  graduatedAt: number | null;
  /**
   * Seconds of one-price batch trading after graduation (anti-sniper): 0 when the creator turned it off (V6) and for
   * V2–V4 launches, which open on Uniswap at graduation; 86400 on V5.
   */
  antiSniperSeconds: number;
  metadata: TokenMeta;
  urls: { terminal: string; token: string; pool: string | null };
};

async function factoryLaunches(factory: Address, version: 2 | 3 | 4 | 5 | 6, now: number): Promise<FeedLaunch[]> {
  const f = { address: factory, abi: cruxBatchFactoryAbi } as const;
  const count = Number(await client.readContract({ ...f, functionName: "auctionCount" }));
  if (count === 0) return [];
  const ids = Array.from({ length: count }, (_, i) => i);
  const auctions = await client.multicall({
    contracts: ids.map((id) => ({ ...f, functionName: "getAuction" as const, args: [BigInt(id)] as const })),
  });
  const found = ids.flatMap((id, i) => {
    const r = auctions[i];
    return r.status === "success" ? [{ id, a: toAuctionV2(r.result) }] : [];
  });
  // V4–V6 launches each carry the creator's vesting choice; V2/V3 always vest over 30 days.
  const vesting =
    version >= 4
      ? await client.multicall({
          contracts: found.map(({ id }) => ({ address: factory, abi: factoryV4Abi, functionName: "creatorVestingDuration" as const, args: [BigInt(id)] as const })),
        })
      : null;
  // V6: the creator's anti-sniper choice, as the window it fixed at creation (0 = off).
  const protection =
    version === 6
      ? await client.multicall({
          contracts: found.map(({ id }) => ({ address: factory, abi: factoryV6Abi, functionName: "batchProtection" as const, args: [BigInt(id)] as const })),
        })
      : null;
  const meta = await client.multicall({
    contracts: found.flatMap(({ a }) => [
      { address: a.token, abi: erc20Abi, functionName: "name" as const },
      { address: a.token, abi: erc20Abi, functionName: "symbol" as const },
      { address: a.token, abi: tokenMetaAbi, functionName: "metadataURI" as const },
    ]),
  });
  return found.map(({ id, a }, i) => {
    const [name, symbol, uri] = meta.slice(i * 3, i * 3 + 3).map((r) => (r.status === "success" ? (r.result as string) : undefined));
    const phase = phaseV2(a, now);
    const graduated = phase === "graduated" && a.pair !== zeroAddress;
    return {
      key: `v${version}#${id}`,
      version,
      auctionId: id,
      token: a.token,
      name: name ?? "",
      symbol: symbol ?? "",
      decimals: 18,
      creator: a.creator,
      phase,
      startTime: a.startTime,
      closesAt: a.startTime + a.batchWindow,
      graduationTarget: formatUnits(a.graduationTarget, 6),
      raised: formatUnits(a.totalDeposits, 6),
      clearingPriceUsd: graduated ? Number(formatUnits(a.clearingPrice, PRICE_DECIMALS)) : null,
      totalSupply: formatUnits(a.totalSupply, 18),
      pool: graduated ? a.pair : null,
      lpBurned: graduated,
      creatorVestingDays:
        vesting && vesting[i].status === "success" ? Number(vesting[i].result as bigint) / 86_400 : V2_VESTING_DAYS,
      graduatedAt: graduated && a.settledAt > 0 ? a.settledAt : null,
      antiSniperSeconds:
        version === 6 ? (protection && protection[i].status === "success" ? Number(protection[i].result as bigint) : 0) : version === 5 ? 86_400 : 0,
      metadata: parseTokenMeta(uri),
      urls: {
        terminal: `${SITE_URL}/launch/v${version}/${id}`,
        token: `${TESTNET_EXPLORER}/token/${a.token}`,
        pool: graduated ? `${TESTNET_EXPLORER}/address/${a.pair}` : null,
      },
    };
  });
}

/** Newest first, V6 before V5 before V4 before V3 before V2. */
export async function readLaunches(now = Math.floor(Date.now() / 1000)): Promise<FeedLaunch[]> {
  const sets = await Promise.all([
    FACTORY_V6 ? factoryLaunches(FACTORY_V6, 6, now) : [],
    FACTORY_V5 ? factoryLaunches(FACTORY_V5, 5, now) : [],
    FACTORY_V4 ? factoryLaunches(FACTORY_V4, 4, now) : [],
    FACTORY_V3 ? factoryLaunches(FACTORY_V3, 3, now) : [],
    FACTORY_V2 ? factoryLaunches(FACTORY_V2, 2, now) : [],
  ]);
  return sets.flatMap((s) => [...s].reverse());
}

/** Public, cacheable JSON for a feed route: CDN-cached (a minute by default), any origin may read it. */
export function feedResponse(body: unknown, status = 200, maxAgeSeconds = 60) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200 ? `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}` : "no-store",
    },
  });
}
