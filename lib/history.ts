import type { Address, Hex } from "viem";
import type { PoolTrade } from "./tradeDecode";
import type { TokenTransfer } from "../hooks/useTokenTransfers";

/**
 * A graduated launch's whole history, from the Crux relay's indexer (crux-solver history.ts): its pool's trades and
 * its token's transfers back to its launch. The terminal starts from this and reads only the newer blocks itself, so
 * a chart, its holders and its PnL don't stop at the log scanner's three-day window. Null when the relay doesn't have
 * it yet (a brand-new launch still being read back), and the scanner's own window is used instead.
 */
const RELAY = (process.env.NEXT_PUBLIC_CRUX_RELAY ?? "https://api.cruxprotocol.xyz").replace(/\/$/, "");
/** Off when the terminal reads a custom RPC (a local fork), whose history the relay doesn't have. */
const OFF = Boolean(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC) || process.env.NEXT_PUBLIC_HISTORY === "off";

type Json = {
  scannedTo: string;
  trades: (Omit<PoolTrade, "usdc" | "tokens" | "blockNumber"> & { usdc: string; tokens: string; blockNumber: string })[];
  transfers: { kind: "transfer" | "claim"; from: Address; to: Address; value: string; txHash: Hex; blockNumber: string; logIndex: number; time: number }[];
};

export type History = { scannedTo: bigint; trades: PoolTrade[]; transfers: TokenTransfer[] };

// One request per launch per page view, shared by the chart, tape, holders and PnL (both its token and pair key it).
const loads = new Map<string, Promise<History | null>>();

export function loadHistory(address: Address): Promise<History | null> {
  if (OFF) return Promise.resolve(null);
  const key = address.toLowerCase();
  let p = loads.get(key);
  if (!p) {
    p = fetch(`${RELAY}/v1/history/${address}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const j = (await res.json()) as Json;
        return {
          scannedTo: BigInt(j.scannedTo),
          trades: j.trades.map((t) => ({ ...t, usdc: BigInt(t.usdc), tokens: BigInt(t.tokens), blockNumber: BigInt(t.blockNumber) })),
          transfers: j.transfers.map((t) => ({ ...t, value: BigInt(t.value), blockNumber: BigInt(t.blockNumber) })),
        };
      })
      .catch(() => null);
    // A miss (still being read, or offline) is tried again on the next page view, not cached for good.
    p.then((h) => {
      if (!h) loads.delete(key);
    });
    loads.set(key, p);
  }
  return p;
}
