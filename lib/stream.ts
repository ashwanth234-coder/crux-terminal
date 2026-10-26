"use client";

import { createPublicClient, webSocket, type Address, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";

/**
 * Live log streaming over a websocket (eth_subscribe "logs"): the moment a contract emits anything, the matching
 * query is refetched, so a trade shows on the chart and tape within a block instead of at the next poll. Polling
 * stays on underneath, so a dropped socket only means updates arrive at the polling pace. Off when the site reads a
 * custom RPC (a local fork), where the public socket would watch the wrong chain.
 */
const WSS = process.env.NEXT_PUBLIC_BASE_SEPOLIA_WSS ?? "wss://base-sepolia-rpc.publicnode.com";
const OFF = Boolean(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC) || process.env.NEXT_PUBLIC_STREAM === "off";

let client: PublicClient | null = null;

/** Calls `onLogs` (coalesced, and repeated once after the scanner's lag) whenever any of `addresses` emits a log. Returns the unwatch. */
export function watchLogsOf(addresses: Address[], onLogs: () => void): () => void {
  if (OFF || typeof window === "undefined" || addresses.length === 0) return () => {};
  try {
    client ??= createPublicClient({ chain: baseSepolia, transport: webSocket(WSS, { retryCount: 5, retryDelay: 2_000 }) }) as PublicClient;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unwatch = client.watchEvent({
      address: addresses,
      onLogs: () => {
        if (timer) return;
        // Once right away, and once more after the log scanner's two-block lag has passed.
        timer = setTimeout(() => {
          timer = null;
          onLogs();
          setTimeout(onLogs, 700);
        }, 250);
      },
      // A socket error leaves polling to carry on.
      onError: () => {},
    });
    return () => {
      if (timer) clearTimeout(timer);
      unwatch();
    };
  } catch {
    return () => {};
  }
}
