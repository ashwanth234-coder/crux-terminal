/**
 * The live trade feed for Solana, BNB Chain and Base coins (crux-solver coinfeed.ts): one WebSocket per page, a subscription
 * per coin, trades pushed as they land. Reconnects by itself and resubscribes.
 */
import { RELAY_URL } from "@/lib/readCache";
import type { CoinTrade } from "@/lib/coinMarket";
import type { ChartNetwork } from "@/lib/solanaCoins";

type Listener = (trades: CoinTrade[]) => void;
/** How current a coin's feed is (BNB Chain and Base say it; Solana doesn't yet). */
export type FeedState = "live" | "delayed" | "reconnecting" | "catching_up";
export type FeedStatus = { state: FeedState; lagMs: number | null };
type StatusListener = (s: FeedStatus) => void;
const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Map<string, Set<StatusListener>>();
let ws: WebSocket | null = null;
let retry = 0;
// EVM addresses in any letter case are the same coin (the server answers in lower case).
const keyOf = (chain: ChartNetwork, coin: string) => `${chain}:${chain === "solana" ? coin : coin.toLowerCase()}`;
const subMsg = (t: "sub" | "unsub", key: string) => {
  const [chain, coin] = key.split(/:(.+)/);
  return JSON.stringify({ t, chain, coin });
};

function connect() {
  if (ws || typeof window === "undefined") return;
  const s = new WebSocket(`${RELAY_URL.replace(/^http/, "ws")}/v1/coinfeed`);
  ws = s;
  s.onopen = () => {
    retry = 0;
    for (const key of listeners.keys()) s.send(subMsg("sub", key));
  };
  s.onmessage = (m) => {
    const j = JSON.parse(String(m.data)) as { t: string; chain: ChartNetwork; coin: string; trades?: CoinTrade[]; state?: FeedState; lagMs?: number | null };
    if (j.t === "status" && j.state) {
      for (const l of statusListeners.get(keyOf(j.chain, j.coin)) ?? []) l({ state: j.state, lagMs: j.lagMs ?? null });
      return;
    }
    if (j.t !== "trades" || !j.trades) return;
    for (const l of listeners.get(keyOf(j.chain, j.coin)) ?? []) l(j.trades);
  };
  s.onclose = () => {
    ws = null;
    // Until it's back, every coin that said how current it is says it's reconnecting.
    for (const set of statusListeners.values()) for (const l of set) l({ state: "reconnecting", lagMs: null });
    if (listeners.size === 0) return;
    setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++));
  };
  s.onerror = () => s.close();
}

/** Calls `on` with each batch of new trades on the coin's market. Returns the unsubscribe. */
export function watchCoinTrades(chain: ChartNetwork, coin: string, on: Listener, onStatus?: StatusListener): () => void {
  const key = keyOf(chain, coin);
  if (onStatus) {
    if (!statusListeners.has(key)) statusListeners.set(key, new Set());
    statusListeners.get(key)!.add(onStatus);
  }
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
    if (ws?.readyState === WebSocket.OPEN) ws.send(subMsg("sub", key));
  }
  set.add(on);
  connect();
  return () => {
    if (onStatus) {
      statusListeners.get(key)?.delete(onStatus);
      if (statusListeners.get(key)?.size === 0) statusListeners.delete(key);
    }
    set!.delete(on);
    if (set!.size > 0) return;
    listeners.delete(key);
    if (ws?.readyState === WebSocket.OPEN) ws.send(subMsg("unsub", key));
    if (listeners.size === 0) ws?.close();
  };
}
