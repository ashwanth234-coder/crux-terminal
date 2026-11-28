import { getAddress, isAddress, type Address } from "viem";
import { RELAY_URL } from "./readCache.ts";

/** Native USDC on Base: a dollar coin's pool pairs it with this. */
export const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** One set of Crux V4 launch contracts and what its pools are priced in. */
export type V4Contracts = { quote: "ETH" | "USDC"; factory: Address; hook: Address; locker: Address; rewards: Address };

/** Whether an address could be a dollar coin: 5afe at the end and sorting after USDC (its pool's other coin). */
export const maybeDollarCoin = (coin: string) => /^0x[0-9a-fA-F]{36}5afe$/i.test(coin) && BigInt(coin) > BigInt(BASE_USDC);

let cached: { at: number; value: Promise<V4Contracts | null> } | null = null;

/**
 * The dollar-coin contracts (USDC-paired launches), as the server's /v1/health names them once they're deployed and
 * launches are on; null until then, and when the server can't be reached (read again a minute later).
 */
export function dollarCoins(): Promise<V4Contracts | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = fetch(`${RELAY_URL}/v1/health`, { signal: AbortSignal.timeout(5_000) })
    .then((r) => r.json() as Promise<{ dollarCoins?: Record<string, unknown> | null }>)
    .then((h) => {
      const d = h.dollarCoins;
      const a = (k: string) => (d && typeof d[k] === "string" && isAddress(d[k] as string) ? getAddress(d[k] as string) : null);
      const [factory, hook, locker, rewards] = [a("factory"), a("hook"), a("locker"), a("rewards")];
      return factory && hook && locker && rewards ? { quote: "USDC" as const, factory, hook, locker, rewards } : null;
    })
    .catch(() => null);
  cached = { at: Date.now(), value };
  return value;
}
