"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { applyFrame, feedSocket, feedStatusOf, joinFeed, watchFeedStatus, type FeedCandle, type FeedFrame, type FeedStatus, type FeedWant } from "@/lib/feed";

/** How long a chart keeps showing the feed's candles while its socket reconnects, before it reads the chain itself. */
export const FEED_GRACE_MS = 20_000;

/**
 * A pool's candles from the shared feed at `interval` ("auto": the server picks, as autoInterval does), kept current
 * by its frames. `pair` null: off. Status "unavailable" means the feed doesn't serve this pool (yet): use the chain.
 * `usable`: the candles can be drawn, live or through a brief reconnect (FEED_GRACE_MS), which then backfills them, so
 * the chart doesn't switch sources and flicker on a dropped socket.
 */
export function useFeedCandles(pair: Address | null, interval: number | "auto") {
  const [state, setState] = useState<{ key: string; candles: FeedCandle[]; interval: number; firstTime: number | null; status: FeedStatus } | null>(null);
  const key = `${pair}:${interval}`;
  const held = useRef<FeedCandle[]>([]);
  useEffect(() => {
    if (!pair) return;
    held.current = [];
    return feedSocket().subscribe({
      pair,
      interval,
      want: ["candles"],
      since: () => held.current.at(-1)?.time,
      onFrame: (f: FeedFrame) => {
        held.current = applyFrame(held.current, f);
        const candles = held.current;
        setState((s) => ({ key, candles, interval: f.interval || (s?.interval ?? 0), firstTime: f.firstTime ?? s?.firstTime ?? null, status: "live" }));
      },
      onStatus: (status) => setState((s) => (s && s.key === key ? { ...s, status } : { key, candles: [], interval: 0, firstTime: null, status })),
    });
  }, [pair, interval, key]);
  const s = state?.key === key ? state : null;
  const status = (pair ? (s?.status ?? "connecting") : "unavailable") as FeedStatus;
  // The grace period runs from when the socket dropped.
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "reconnecting") return;
    const t = setTimeout(() => setExpired(key), FEED_GRACE_MS);
    return () => {
      clearTimeout(t);
      setExpired(null);
    };
  }, [status, key]);
  const usable = Boolean(s && s.candles.length > 0 && s.interval > 0 && (status === "live" || (status === "reconnecting" && expired !== key)));
  return { candles: s?.candles ?? null, interval: s?.interval || null, firstTime: s?.firstTime ?? null, status, usable };
}

/**
 * Joins the page's one feed subscription for `address` (a pool or its token) while mounted: `onFrame` gets every
 * frame. Returns the subscription's status ("live" means the page needn't read the chain for it).
 */
export function useFeedJoin(address: Address | null, want: FeedWant, onFrame: (f: FeedFrame) => void): FeedStatus {
  const handler = useRef(onFrame);
  useEffect(() => {
    handler.current = onFrame;
  });
  useEffect(() => (address ? joinFeed(address, want, (f) => handler.current(f)) : undefined), [address, want]);
  const status = useSyncExternalStore(
    (l) => (address ? watchFeedStatus(address, want, l) : () => {}),
    () => (address ? feedStatusOf(address, want) : "unavailable"),
    () => "connecting" as FeedStatus,
  );
  return status;
}
