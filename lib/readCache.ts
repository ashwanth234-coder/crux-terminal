import { fallback, http, type Transport } from "viem";

/** The relay (crux-solver): api.cruxprotocol.xyz, or NEXT_PUBLIC_CRUX_RELAY. */
export const RELAY_URL = (process.env.NEXT_PUBLIC_CRUX_RELAY ?? "https://api.cruxprotocol.xyz").replace(/\/$/, "");

/**
 * Base Sepolia reads through the relay's shared cache (crux-solver rpccache.ts): every open page asking the same thing
 * (a launch list, a pool's reserves, an auction's state) is answered from one call to the node. JSON-RPC batches of
 * single calls (not multicalls, whose mix varies page to page and wouldn't match). Falls back to `direct` when the
 * cache is unreachable or doesn't serve a method; a revert is a revert, not a reason to ask twice.
 */
export function cachedReads(direct: Transport): Transport {
  return fallback([http(`${RELAY_URL}/v1/rpc`, { batch: { batchSize: 50, wait: 16 }, timeout: 10_000, retryCount: 0 }), direct]);
}
