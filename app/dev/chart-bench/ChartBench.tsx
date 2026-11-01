"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { ChartGrid } from "@/components/chart/ChartGrid";
import type { LogScan } from "@/lib/logs";
import { PRICE_DECIMALS, type AuctionV2 } from "@/lib/launchV2";
import type { PoolTrade } from "@/lib/tradeDecode";

const PAIR = "0x00000000000000000000000000000000000c4a27" as Address;
const TOKEN = "0x00000000000000000000000000000000000c4a28" as Address;
const TRADER = "0x00000000000000000000000000000000000c4a29" as Address;
const HASH = `0x${"ab".repeat(32)}` as Hex;
const SUPPLY = BigInt(10) ** BigInt(27);
// Far past any real head, so the chart's own poll returns the seeded scan untouched (lib/logs scanLogs).
const SCANNED_TO = BigInt(10) ** BigInt(15);

/** Deterministic pseudo-random numbers (mulberry32), so the tests see the same chart every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Walk = { price: number; block: bigint; rand: () => number };
function trade(w: Walk, time: number): PoolTrade {
  // A memecoin-shaped walk: small steps, the odd large one, drifting up.
  const step = (w.rand() - 0.48) * (w.rand() < 0.02 ? 0.25 : 0.02);
  w.price = Math.max(1e-9, w.price * (1 + step));
  const usdc = BigInt(Math.round((5 + w.rand() * w.rand() * 2_000) * 1e6));
  w.block += BigInt(1);
  return {
    side: step >= 0 ? "buy" : "sell",
    usdc,
    tokens: BigInt(Math.round((Number(usdc) / 1e6 / w.price) * 1e6)) * BigInt(10) ** BigInt(12),
    price: w.price,
    to: TRADER,
    viaIntent: w.rand() < 0.3,
    venue: "uniswap-v2",
    txHash: HASH,
    blockNumber: w.block,
    logIndex: 0,
    time,
  };
}

type Stats = { frames: number[]; longTasks: number[] };
declare global {
  interface Window {
    __bench?: {
      trades(): number;
      append(n: number): void;
      stream(perSecond: number): void;
      reset(): void;
      summary(): { frames: number; p50: number; p95: number; p99: number; max: number; over50: number; longTasks: number; longTaskMs: number; trades: number };
    };
  }
}

/**
 * Query string: trades (history size, default 5,000), hours (span, default 24), rate (trades a second streamed in,
 * default 0), seed. window.__bench reports frame times and long tasks for the load test. feed (a ws:// address): no
 * seeded trades; the chart takes everything from that shared feed (crux-solver feed-sim-server.ts in e2e/feed.spec).
 */
export function ChartBench() {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [auction, setAuction] = useState<AuctionV2 | null>(null);
  const [feedMode, setFeedMode] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const feedUrl = q.get("feed");
    if (feedUrl) window.__CRUX_FEED_URL = feedUrl;
    const n = feedUrl ? 0 : Math.max(0, Number(q.get("trades") ?? 5_000));
    const hours = Math.max(0.01, Number(q.get("hours") ?? 24));
    const rate = Math.max(0, Number(q.get("rate") ?? 0));
    const now = Math.floor(Date.now() / 1000);
    const start = now - Math.round(hours * 3_600);
    const walk: Walk = { price: 0.00002, block: BigInt(1_000), rand: rng(Number(q.get("seed") ?? 7)) };
    const open = walk.price;
    const items: PoolTrade[] = [];
    for (let i = 0; i < n; i++) items.push(trade(walk, start + Math.floor(((i + walk.rand()) / Math.max(1, n)) * (now - start))));
    const key = ["pool-swaps", PAIR];
    const scan = (list: PoolTrade[]): LogScan<PoolTrade> => ({ items: list, floor: BigInt(0), scannedTo: SCANNED_TO, truncated: false, windowBlocks: SCANNED_TO });
    qc.setQueryData(key, scan(items));

    const stats: Stats = { frames: [], longTasks: [] };
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      stats.frames.push(t - last);
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => stats.longTasks.push(e.duration)));
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      // No long-task timing in this browser: frame times still work.
    }
    const append = (count: number) => {
      const prev = qc.getQueryData<LogScan<PoolTrade>>(key);
      const t = Math.floor(Date.now() / 1000);
      const more = Array.from({ length: count }, () => trade(walk, t));
      qc.setQueryData(key, scan([...(prev?.items ?? []), ...more]));
    };
    // New trades land in 100 ms batches, as a busy pool's logs reach the page block by block.
    let streamTimer: ReturnType<typeof setInterval> | null = null;
    const stream = (perSecond: number) => {
      if (streamTimer) clearInterval(streamTimer);
      streamTimer = null;
      if (perSecond <= 0) return;
      let owed = 0;
      streamTimer = setInterval(() => {
        owed += perSecond / 10;
        const whole = Math.floor(owed);
        owed -= whole;
        if (whole > 0) append(whole);
      }, 100);
    };
    const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
    window.__bench = {
      trades: () => qc.getQueryData<LogScan<PoolTrade>>(key)?.items.length ?? 0,
      append,
      stream,
      reset: () => {
        stats.frames = [];
        stats.longTasks = [];
      },
      summary: () => {
        const f = [...stats.frames].sort((a, b) => a - b);
        const r = (v: number) => Math.round(v * 10) / 10;
        return {
          frames: f.length,
          p50: r(pct(f, 0.5)),
          p95: r(pct(f, 0.95)),
          p99: r(pct(f, 0.99)),
          max: r(f[f.length - 1] ?? 0),
          over50: f.filter((v) => v > 50).length,
          longTasks: stats.longTasks.length,
          longTaskMs: Math.round(stats.longTasks.reduce((s, v) => s + v, 0)),
          trades: qc.getQueryData<LogScan<PoolTrade>>(key)?.items.length ?? 0,
        };
      },
    };
    stream(rate);

    // Seeded before the chart mounts, so its first read finds the trades. One-time setup from the URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuction({
      token: TOKEN,
      creator: TRADER,
      startTime: start - 600,
      batchWindow: 300,
      status: 1,
      bidderCount: 1,
      settledAt: start,
      pair: PAIR,
      totalSupply: SUPPLY,
      saleSupply: SUPPLY / BigInt(2),
      graduationTarget: BigInt(10_000e6),
      floorPrice: BigInt(0),
      maxAllocationPerWallet: SUPPLY,
      totalDeposits: BigInt(10_000e6),
      clearingPrice: BigInt(Math.round(open * 1e9)) * BigInt(10) ** BigInt(PRICE_DECIMALS - 9),
    });
    setFeedMode(Boolean(feedUrl));
    setReady(true);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (streamTimer) clearInterval(streamTimer);
      delete window.__bench;
    };
  }, [qc]);

  return (
    <main className="flex h-svh flex-col bg-void p-1.5">
      {ready && auction ? (
        <ChartGrid auction={auction} symbol="$BENCH" name="Chart bench" factory={"0x0000000000000000000000000000000000000000"} id="0" external={!feedMode} />
      ) : (
        <p className="p-4 text-[12px] text-dim">Seeding trades…</p>
      )}
    </main>
  );
}
