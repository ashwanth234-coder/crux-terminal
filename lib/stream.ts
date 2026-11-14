"use client";

import { createPublicClient, webSocket, type Address, type PublicClient } from "viem";
import { NETWORK } from "./network.ts";

/**
 * Live log streaming over a websocket (eth_subscribe "logs"): the moment a contract emits anything, the matching
 * query is refetched, so a trade shows on the chart and tape within a block instead of at the next poll. Polling
 * stays on underneath, so a dropped socket only means updates arrive at the polling pace. Off when the site reads a
 * custom RPC (a local fork), where the public socket would watch the wrong chain.
 */
const WSS = process.env.NEXT_PUBLIC_BASE_SEPOLIA_WSS ?? "wss://base-sepolia-rpc.publicnode.com";
const OFF = Boolean(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC) || process.env.NEXT_PUBLIC_STREAM === "off";

let client: PublicClient | null = null;

/**
 * Base mainnet still streams 200 ms preconfirmations as Flashblocks until its Denim upgrade; set
 * NEXT_PUBLIC_BASE_FLASHBLOCKS=1 there. Base Sepolia (and mainnet after Denim) seals a canonical block every 200 ms, so
 * plain `newHeads` is already that fast.
 */
const HEADS = process.env.NEXT_PUBLIC_BASE_FLASHBLOCKS === "1" ? "newFlashblocks" : "newHeads";

/** Calls `onHead` at most once per `minMs` as new blocks arrive. Returns the unwatch; a dropped socket only stops it. */
export function watchHeads(onHead: () => void, minMs = 1_000): () => void {
  if (OFF || typeof window === "undefined") return () => {};
  try {
    client ??= createPublicClient({ chain: NETWORK.chain, transport: webSocket(WSS, { retryCount: 5, retryDelay: 2_000 }) }) as PublicClient;
    let last = 0;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const transport = client.transport as unknown as {
      subscribe: (a: { params: [string]; onData: () => void; onError: () => void }) => Promise<{ unsubscribe: () => Promise<unknown> }>;
    };
    void transport
      .subscribe({
        params: [HEADS],
        onData: () => {
          const now = Date.now();
          if (now - last < minMs) return;
          last = now;
          onHead();
        },
        onError: () => {},
      })
      .then((s) => {
        stop = () => void s.unsubscribe().catch(() => {});
        if (cancelled) stop();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  } catch {
    return () => {};
  }
}

/** Calls `onLogs` (coalesced, and repeated once after the scanner's lag) whenever any of `addresses` emits a log. Returns the unwatch. */
export function watchLogsOf(addresses: Address[], onLogs: () => void): () => void {
  if (OFF || typeof window === "undefined" || addresses.length === 0) return () => {};
  try {
    client ??= createPublicClient({ chain: NETWORK.chain, transport: webSocket(WSS, { retryCount: 5, retryDelay: 2_000 }) }) as PublicClient;
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
