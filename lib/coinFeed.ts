/**
 * The live trade feed for Solana, BNB Chain and Base coins (crux-solver coinfeed.ts): one WebSocket per page, a subscription
 * per coin, trades pushed as they land. Reconnects by itself and resubscribes.
 */
import { RELAY_URL } from "@/lib/readCache";
import type { CoinTrade } from "@/lib/coinMarket";
import type { ChartNetwork } from "@/lib/solanaCoins";

type Listener = (trades: CoinTrade[]) => void;
const listeners = new Map<string, Set<Listener>>();
let ws: WebSocket | null = null;
let retry = 0;
const keyOf = (chain: ChartNetwork, coin: string) => `${chain}:${chain === "bsc" ? coin.toLowerCase() : coin}`;
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
    const j = JSON.parse(String(m.data)) as { t: string; chain: ChartNetwork; coin: string; trades?: CoinTrade[] };
    if (j.t !== "trades" || !j.trades) return;
    for (const l of listeners.get(keyOf(j.chain, j.coin)) ?? []) l(j.trades);
  };
  s.onclose = () => {
    ws = null;
    if (listeners.size === 0) return;
    setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++));
  };
  s.onerror = () => s.close();
}

/** Calls `on` with each batch of new trades on the coin's market. Returns the unsubscribe. */
export function watchCoinTrades(chain: ChartNetwork, coin: string, on: Listener): () => void {
  const key = keyOf(chain, coin);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
    if (ws?.readyState === WebSocket.OPEN) ws.send(subMsg("sub", key));
  }
  set.add(on);
  connect();
  return () => {
    set!.delete(on);
    if (set!.size > 0) return;
    listeners.delete(key);
    if (ws?.readyState === WebSocket.OPEN) ws.send(subMsg("unsub", key));
    if (listeners.size === 0) ws?.close();
  };
}
