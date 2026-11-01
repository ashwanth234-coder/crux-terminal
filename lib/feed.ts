// The browser's end of the shared chart feed (crux-solver feedhub.ts): one WebSocket per tab, every chart and trade
// list on the page subscribed through it. When the socket drops it reconnects with exponential backoff (0.5 s
// doubling to 30 s, with jitter), and each subscription asks for only what it missed (`since` its newest candle), so
// a chart keeps its zoom and drawings across a reconnect.
import type { Address } from "viem";
import type { Candle } from "./candles";
import { RELAY_URL } from "./session";

/** A candle from the feed: the chart's candle plus the USDC bought and sold in it (for the flow studies). */
export type FeedCandle = Candle & { bought: number; sold: number };

/** A trade as the feed sends it (lib/tradeDecode PoolTrade with its amounts and block as decimal strings). */
export type FeedTrade = {
  side: "buy" | "sell";
  usdc: string;
  tokens: string;
  price: number;
  to: Address;
  viaIntent: boolean;
  venue: "uniswap-v2" | "uniswap-v3" | "batch-pool";
  batch?: number;
  txHash: `0x${string}`;
  blockNumber: string;
  logIndex: number;
  time: number;
};

/** A token transfer (or its auction's claim) as the feed sends it (hooks/useTokenTransfers TokenTransfer as JSON). */
export type FeedTransfer = {
  kind: "transfer" | "claim";
  from: Address;
  to: Address;
  value: string;
  txHash: `0x${string}`;
  blockNumber: string;
  logIndex: number;
  time: number;
};

type Row = [number, number, number, number, number, number, number, number, number];
const toCandle = (r: Row): FeedCandle => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5], trades: r[6], bought: r[7], sold: r[8] });

export type FeedFrame = {
  kind: "snap" | "tick" | "candle_replace";
  /** Drop candles from this time on, then append `candles`. On a fresh snap (no `since` was asked): replace them all. */
  from: number;
  fresh: boolean;
  candles: FeedCandle[];
  trades: FeedTrade[];
  /** A reorg's dropped trades, as lib/logs keys (txHash:logIndex). */
  removed: string[];
  /** The token's new transfers and claims, and a reorg's dropped ones (keys). */
  transfers: FeedTransfer[];
  removedTransfers: string[];
  interval: number;
  firstTime: number | null;
  /** Trades were missed (a long disconnect): reload the trade list. */
  gap: boolean;
};

export type FeedStatus = "connecting" | "live" | "reconnecting" | "unavailable";

/** What a subscription receives: the chart wants candles, the trade list trades, the holder list transfers. */
export type FeedWant = "candles" | "trades" | "transfers";

type Sub = {
  pair: Address;
  interval: number | "auto";
  want: FeedWant[];
  /** The newest candle time this subscriber holds, for a reconnect's backfill. */
  since: () => number | undefined;
  onFrame: (f: FeedFrame) => void;
  onStatus: (s: FeedStatus) => void;
};

declare global {
  interface Window {
    /** Overrides the feed's address (the test chart page points it at a local feed). */
    __CRUX_FEED_URL?: string;
  }
}

type Message = {
  t: string;
  id?: string;
  from?: number;
  candles?: Row[];
  trades?: FeedTrade[];
  removed?: string[];
  transfers?: FeedTransfer[];
  removedTransfers?: string[];
  interval?: number;
  firstTime?: number | null;
  gap?: boolean;
  error?: string;
};

const feedUrl = () => window.__CRUX_FEED_URL ?? `${RELAY_URL.replace(/^http/, "ws")}/v1/feed`;

class FeedSocket {
  private ws: WebSocket | null = null;
  private readonly subs = new Map<string, Sub>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  /** Subscriptions the server answered (a reconnect asks with `since`). */
  private readonly answered = new Set<string>();

  subscribe(sub: Sub): () => void {
    const id = `s${++this.next}`;
    this.subs.set(id, sub);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(id, sub, false);
      sub.onStatus("connecting");
    } else {
      sub.onStatus(this.attempt > 0 ? "reconnecting" : "connecting");
      this.connect();
    }
    return () => {
      this.subs.delete(id);
      this.answered.delete(id);
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: "unsub", id }));
    };
  }

  private send(id: string, sub: Sub, resume: boolean) {
    const since = resume ? sub.since() : undefined;
    // v: 2: the server batches this page's frames into one message per flush and sends each subscription only what
    // it wants (a hot launch's cost is one socket write per page per frame).
    this.ws?.send(JSON.stringify({ t: "sub", id, pair: sub.pair, interval: sub.interval, v: 2, want: sub.want, ...(since !== undefined ? { since } : {}) }));
  }

  private connect() {
    if (this.ws || this.timer) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(feedUrl());
    } catch {
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      for (const [id, sub] of this.subs) this.send(id, sub, this.answered.has(id));
    };
    ws.onmessage = (e) => this.onMessage(String(e.data));
    ws.onclose = () => {
      this.ws = null;
      for (const sub of this.subs.values()) sub.onStatus("reconnecting");
      if (this.subs.size > 0) this.retry();
    };
    ws.onerror = () => ws.close();
  }

  private retry() {
    if (this.timer) return;
    const delay = Math.min(30_000, 500 * 2 ** this.attempt) * (0.75 + Math.random() * 0.5);
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private onMessage(raw: string) {
    let m: Message & { frames?: Message[] };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === "batch") for (const f of m.frames ?? []) this.onFrame(f);
    else this.onFrame(m);
  }

  private onFrame(m: Message) {
    const sub = m.id ? this.subs.get(m.id) : undefined;
    if (!sub || !m.id) return;
    if (m.t === "error") {
      sub.onStatus("unavailable");
      return;
    }
    if (m.t !== "snap" && m.t !== "tick" && m.t !== "candle_replace") return;
    const fresh = m.t === "snap" && !this.answered.has(m.id);
    if (m.t === "snap") this.answered.add(m.id);
    sub.onFrame({
      kind: m.t,
      from: m.from ?? 0,
      fresh,
      candles: (m.candles ?? []).map(toCandle),
      trades: m.trades ?? [],
      removed: m.removed ?? [],
      transfers: m.transfers ?? [],
      removedTransfers: m.removedTransfers ?? [],
      interval: m.interval ?? (typeof sub.interval === "number" ? sub.interval : 0),
      firstTime: m.firstTime ?? null,
      gap: Boolean(m.gap),
    });
    if (m.t === "snap") sub.onStatus("live");
  }
}

let socket: FeedSocket | null = null;
/** The page's one feed socket (browser only). */
export function feedSocket(): FeedSocket {
  return (socket ??= new FeedSocket());
}

/** Applies a frame to a candle list: everything from `from` on is replaced by the frame's candles. */
export function applyFrame(candles: FeedCandle[], f: FeedFrame): FeedCandle[] {
  if (f.fresh) return f.candles;
  let cut = candles.length;
  while (cut > 0 && candles[cut - 1].time >= f.from) cut--;
  return cut === candles.length && f.candles.length === 0 ? candles : [...candles.slice(0, cut), ...f.candles];
}

/**
 * One subscription per address (a pool, or its token) and kind of data however many readers on the page: each frame
 * goes to every reader, and its status (live, reconnecting, …) can be watched. `want`: the trade list joins a pool for
 * its trades, the holder list its token for transfers.
 */
const joins = new Map<string, { handlers: Set<(f: FeedFrame) => void>; stop: () => void }>();
const statuses = new Map<string, FeedStatus>();
const watchers = new Map<string, Set<() => void>>();

const joinKey = (address: Address, want: FeedWant) => `${address.toLowerCase()}:${want}`;

export function joinFeed(address: Address, want: FeedWant, onFrame: (f: FeedFrame) => void): () => void {
  const k = joinKey(address, want);
  let j = joins.get(k);
  if (!j) {
    const handlers = new Set<(f: FeedFrame) => void>();
    const stop = feedSocket().subscribe({
      pair: address,
      interval: 86_400,
      want: [want],
      // A reconnect asks for the last day's trades and transfers; readers skip the ones they hold.
      since: () => Math.floor(Date.now() / 1000) - 86_400,
      onFrame: (f) => handlers.forEach((h) => h(f)),
      onStatus: (s) => {
        statuses.set(k, s);
        watchers.get(k)?.forEach((w) => w());
      },
    });
    joins.set(k, (j = { handlers, stop }));
  }
  const entry = j;
  entry.handlers.add(onFrame);
  return () => {
    entry.handlers.delete(onFrame);
    if (entry.handlers.size > 0) return;
    entry.stop();
    joins.delete(k);
    statuses.delete(k);
  };
}

export function watchFeedStatus(address: Address, want: FeedWant, onChange: () => void): () => void {
  const k = joinKey(address, want);
  if (!watchers.has(k)) watchers.set(k, new Set());
  watchers.get(k)!.add(onChange);
  return () => watchers.get(k)?.delete(onChange);
}
export const feedStatusOf = (address: Address, want: FeedWant): FeedStatus => statuses.get(joinKey(address, want)) ?? "connecting";
