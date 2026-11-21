import { createPublicClient, erc20Abi, fallback, formatUnits, http, parseAbi, zeroAddress, type Address } from "viem";
import { cruxBatchFactoryAbi, factoryV4Abi, factoryV6Abi } from "@/contracts/abis/batchAuction";
import { BASE_RPCS } from "./network.ts";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { FACTORY_V2, FACTORY_V3, FACTORY_V4, FACTORY_V5, FACTORY_V6, FACTORY_V7, FACTORY_V8 } from "@/lib/intents";
import { PRICE_DECIMALS, V2_VESTING_DAYS, phaseV2, toAuctionV2, type PhaseV2 } from "@/lib/launchV2";
import { SITE_URL } from "@/lib/site";
import { parseTokenMeta, tokenMetaAbi, type TokenMeta } from "@/lib/tokenMeta";
import { NETWORK } from "./network.ts";
import { FACTORY_V9, V9_ON, curvePrice, curveV9Abi, factoryV9Abi } from "@/lib/v9";

/**
 * Every Crux launch, read straight from the batch factories on Base Sepolia: what /api/launches and
 * /tokenlist.json publish for indexers, terminals and wallets. Server-side only.
 */

const client = createPublicClient({
  chain: NETWORK.chain,
  transport: fallback(BASE_RPCS.map((u) => http(u, { timeout: 8_000 }))),
});

export type FeedLaunch = {
  /** "v3#0": factory version and auction id. */
  key: string;
  version: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  auctionId: number;
  token: Address;
  name: string;
  symbol: string;
  decimals: 18;
  creator: Address;
  /** V9 adds "curve": trading on its bonding curve, before graduation. */
  phase: PhaseV2 | "curve";
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
  /** V9: the price now (curve or pool), USD per token. */
  priceUsd?: number;
  urls: { terminal: string; token: string; pool: string | null };
};

async function factoryLaunches(factory: Address, version: 2 | 3 | 4 | 5 | 6 | 7 | 8, now: number): Promise<FeedLaunch[]> {
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
  // V6 / V7: the creator's anti-sniper choice, as the window it fixed at creation (0 = off).
  const protection =
    version >= 6
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
        version >= 6 ? (protection && protection[i].status === "success" ? Number(protection[i].result as bigint) : 0) : version === 5 ? 86_400 : 0,
      metadata: parseTokenMeta(uri),
      urls: {
        terminal: `${SITE_URL}/launch/v${version}/${id}`,
        token: `${TESTNET_EXPLORER}/token/${a.token}`,
        pool: graduated ? `${TESTNET_EXPLORER}/address/${a.pair}` : null,
      },
    };
  });
}

const pairAbi = parseAbi(["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"]);

/**
 * V9 launches (bonding curve, then Uniswap): what Base mainnet has. "raised" is the USDC on the curve, "graduationTarget"
 * its threshold, "startTime" its launch time; "priceUsd" the price now.
 */
async function v9Launches(): Promise<FeedLaunch[]> {
  const count = Number(await client.readContract({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount" }));
  if (count === 0) return [];
  const ids = Array.from({ length: count }, (_, i) => i);
  const launches = (await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [BigInt(id)] }) as const),
  })) as { token: Address; curve: Address; pair: Address; creator: Address }[];
  const PER = 10;
  const reads = await client.multicall({
    contracts: launches.flatMap((l) => [
      { address: l.token, abi: erc20Abi, functionName: "name" } as const,
      { address: l.token, abi: erc20Abi, functionName: "symbol" } as const,
      { address: l.token, abi: tokenMetaAbi, functionName: "metadataURI" } as const,
      { address: l.token, abi: erc20Abi, functionName: "totalSupply" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "graduated" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "realUsdc" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "threshold" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "spotPrice" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "launchedAt" } as const,
      { address: l.curve, abi: curveV9Abi, functionName: "creatorVesting" } as const,
    ]),
  });
  const r = (i: number, k: number) => (reads[i * PER + k]?.status === "success" ? reads[i * PER + k].result : undefined);
  const grads = launches.map((_, i) => r(i, 4) === true);
  const pools = await client.multicall({
    contracts: launches.flatMap((l, i) =>
      grads[i] && l.pair !== zeroAddress
        ? [{ address: l.pair, abi: pairAbi, functionName: "getReserves" } as const, { address: l.pair, abi: pairAbi, functionName: "token0" } as const]
        : [],
    ),
  });
  let pi = 0;
  return launches.map((l, i) => {
    const graduated = grads[i] && l.pair !== zeroAddress;
    let price = curvePrice((r(i, 7) as bigint | undefined) ?? BigInt(0));
    if (graduated) {
      const res = pools[pi++]?.result as readonly [bigint, bigint, number] | undefined;
      const t0 = pools[pi++]?.result as Address | undefined;
      if (res && t0) {
        const [tok, usd] = t0.toLowerCase() === l.token.toLowerCase() ? [res[0], res[1]] : [res[1], res[0]];
        price = tok > BigInt(0) ? Number(formatUnits(usd, 6)) / Number(formatUnits(tok, 18)) : 0;
      }
    }
    const launchedAt = Number((r(i, 8) as bigint | undefined) ?? BigInt(0));
    return {
      key: `v9#${i}`,
      version: 9 as const,
      auctionId: i,
      token: l.token,
      name: (r(i, 0) as string | undefined) ?? "",
      symbol: (r(i, 1) as string | undefined) ?? "",
      decimals: 18 as const,
      creator: l.creator,
      phase: graduated ? ("graduated" as const) : ("curve" as const),
      startTime: launchedAt,
      closesAt: launchedAt,
      graduationTarget: formatUnits((r(i, 6) as bigint | undefined) ?? BigInt(0), 6),
      raised: formatUnits((r(i, 5) as bigint | undefined) ?? BigInt(0), 6),
      clearingPriceUsd: null,
      totalSupply: formatUnits((r(i, 3) as bigint | undefined) ?? BigInt(0), 18),
      pool: graduated ? l.pair : null,
      lpBurned: graduated,
      creatorVestingDays: Number((r(i, 9) as bigint | undefined) ?? BigInt(0)) / 86_400,
      graduatedAt: null,
      antiSniperSeconds: 0,
      metadata: parseTokenMeta(r(i, 2) as string | undefined),
      priceUsd: price,
      urls: {
        terminal: `${SITE_URL}/launch/v9/${i}`,
        token: `${TESTNET_EXPLORER}/token/${l.token}`,
        pool: graduated ? `${TESTNET_EXPLORER}/address/${l.pair}` : null,
      },
    };
  });
}

/** Newest first, V9 before V7 before V6 before V5 before V4 before V3 before V2. */
export async function readLaunches(now = Math.floor(Date.now() / 1000)): Promise<FeedLaunch[]> {
  const sets = await Promise.all([
    V9_ON ? v9Launches() : [],
    FACTORY_V7 ? factoryLaunches(FACTORY_V7, 7, now) : [],
    FACTORY_V8 ? factoryLaunches(FACTORY_V8, 8, now) : [],
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
