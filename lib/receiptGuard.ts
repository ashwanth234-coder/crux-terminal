import type { Address } from "viem";
import { isAddress40, receiptFor, type RewardsFile } from "./v4receipt.ts";

/** At most `limit` hits per key in any `windowMs`. Returns true when the hit is allowed. */
export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now, maxKeys = 5_000) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.delete(key);
    hits.set(key, recent);
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
    return true;
  };
}

export type ReceiptParams = { ok: true; coin: Address; wallet: Address } | { ok: false; status: 400; message: string };

/** The route's query: both must be 0x + 40 hex, nothing else is read from it. */
export function parseReceiptParams(q: URLSearchParams): ReceiptParams {
  const coin = q.get("coin");
  const wallet = q.get("wallet");
  if (!isAddress40(coin) || !isAddress40(wallet)) return { ok: false, status: 400, message: "coin and wallet must be 0x addresses" };
  return { ok: true, coin, wallet };
}

/**
 * True when no receipt can exist for this wallet, known from the posted list and the creator alone: there is a list
 * (or none yet), the wallet has no line in it and it isn't the coin's creator. The route answers 404 before any log work.
 */
export function noReceiptPossible(file: RewardsFile | null, wallet: string, creator: string | null): boolean {
  if (receiptFor(file, wallet)) return false;
  if (creator && creator.toLowerCase() === wallet.toLowerCase()) return false;
  return true;
}
