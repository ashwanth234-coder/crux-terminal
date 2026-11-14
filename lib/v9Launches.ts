import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { parseTokenMeta, tokenMetaAbi, type TokenMeta } from "@/lib/tokenMeta";
import { FACTORY_V9, V9_ON, factoryV9Abi } from "@/lib/v9";
import { NETWORK } from "./network.ts";

/**
 * Every V9 launch's ticker and metadata, read from CruxFactoryV9 on Base Sepolia (server side): what the anti-copycat
 * check compares a new launch against. Empty while V9 is off. A V9 launch is never cancelled, so its ticker, artwork
 * and X account stay taken for good (as a graduated V8 token's do).
 */
const client = createPublicClient({
  chain: NETWORK.chain,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://base-sepolia-rpc.publicnode.com", { timeout: 8_000 }),
});

export type V9GuardLaunch = { id: number; token: Address; symbol: string; metadata: TokenMeta };

export async function readV9Launches(): Promise<V9GuardLaunch[]> {
  if (!V9_ON) return [];
  const count = Number(await client.readContract({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "launchCount" }));
  if (count === 0) return [];
  const ids = Array.from({ length: count }, (_, i) => BigInt(i));
  const launches = await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ address: FACTORY_V9, abi: factoryV9Abi, functionName: "getLaunch", args: [id] }) as const),
  });
  const tokens = launches.map((l) => (l as { token: Address }).token);
  const meta = await client.multicall({
    allowFailure: true,
    contracts: tokens.flatMap((t) => [
      { address: t, abi: erc20Abi, functionName: "symbol" } as const,
      { address: t, abi: tokenMetaAbi, functionName: "metadataURI" } as const,
    ]),
  });
  return tokens.map((token, i) => ({
    id: i,
    token,
    symbol: (meta[i * 2]?.result as string | undefined) ?? "",
    metadata: parseTokenMeta(meta[i * 2 + 1]?.result as string | undefined),
  }));
}
