import { isAddress } from "viem";
import type { CommandChain } from "@/lib/commandIntent";
import { bnbCoin, chainOf0x, searchBaseCoins, searchBnbCoins } from "@/lib/bnbCoins";
import { isSolanaAddress, searchSolanaCoins, solanaCoin } from "@/lib/solanaCoins";

/** A coin a command names, found on one chain. `crux`: a Crux launch (it trades through Crux's own router on Base). */
export type FoundCoin = { chain: CommandChain; address: string; symbol: string; name: string; price?: number; liquidity?: number; crux?: boolean };

/** What the command bar needs from the launch feed (the header search's list). */
export type LaunchLite = { token: string; symbol: string; name: string };

const same = (a: string, b: string) => a.trim().replace(/^\$/, "").toLowerCase() === b.trim().replace(/^\$/, "").toLowerCase();

/**
 * The coins a command's word could mean, best first: an address is looked up where it lives; a ticker is matched
 * exactly (never "starts with", so "BONK" can't land on "BONKFAKE") across Crux's launches, Solana (Jupiter, verified
 * or liquid only), Base and BNB Chain (DexScreener, $50k+ liquidity only). Crux launches first, then the deepest.
 * `chain` keeps only that chain's coins. Empty: nothing safe matched.
 */
export async function findCoins(query: string, chain: CommandChain | undefined, launches: LaunchLite[]): Promise<FoundCoin[]> {
  const q = query.trim();
  const keep = (c: FoundCoin) => !chain || c.chain === chain;

  if (isAddress(q, { strict: false })) {
    const launch = launches.find((l) => l.token.toLowerCase() === q.toLowerCase());
    if (launch) return ([{ chain: "base", address: launch.token, symbol: launch.symbol, name: launch.name, crux: true }] as FoundCoin[]).filter(keep);
    const where = chain === "base" || chain === "bnb" ? chain : await chainOf0x(q);
    const c = await bnbCoin(q, where === "bnb" ? "bsc" : "base");
    return [{ chain: where, address: q, symbol: c?.symbol ?? "COIN", name: c?.name ?? "", price: c?.price, liquidity: c?.liquidity }].filter(keep);
  }
  if (isSolanaAddress(q)) {
    const c = await solanaCoin(q).catch(() => null);
    return [{ chain: "solana" as const, address: q, symbol: c?.symbol ?? "COIN", name: c?.name ?? "", price: c?.price, liquidity: c?.liquidity }].filter(keep);
  }

  const [sol, base, bnb] = await Promise.all([
    !chain || chain === "solana" ? searchSolanaCoins(q, 8).catch(() => []) : [],
    !chain || chain === "base" ? searchBaseCoins(q, 6).catch(() => []) : [],
    !chain || chain === "bnb" ? searchBnbCoins(q, 6).catch(() => []) : [],
  ]);
  const cruxSet = new Set(launches.map((l) => l.token.toLowerCase()));
  const found: FoundCoin[] = [
    ...launches.filter((l) => same(l.symbol, q)).map((l) => ({ chain: "base" as const, address: l.token, symbol: l.symbol, name: l.name, crux: true })),
    ...sol.filter((c) => same(c.symbol, q)).map((c) => ({ chain: "solana" as const, address: c.mint, symbol: c.symbol, name: c.name, price: c.price, liquidity: c.liquidity })),
    ...base.filter((c) => same(c.symbol, q) && !cruxSet.has(c.address.toLowerCase())).map((c) => ({ chain: "base" as const, address: c.address, symbol: c.symbol, name: c.name, price: c.price, liquidity: c.liquidity })),
    ...bnb.filter((c) => same(c.symbol, q)).map((c) => ({ chain: "bnb" as const, address: c.address, symbol: c.symbol, name: c.name, price: c.price, liquidity: c.liquidity })),
  ];
  return rankCoins(found.filter(keep));
}

/** Crux launches first, then the deepest market. Pure, for tests. */
export function rankCoins(list: FoundCoin[]): FoundCoin[] {
  return [...list].sort((a, b) => Number(!!b.crux) - Number(!!a.crux) || (b.liquidity ?? 0) - (a.liquidity ?? 0));
}

export const CHAIN_NAME: Record<CommandChain, string> = { base: "Base", solana: "Solana", bnb: "BNB Chain" };
