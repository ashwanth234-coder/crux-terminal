"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoinRail } from "@/components/coin/CoinRail";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { ChartGrid } from "@/components/chart/ChartGrid";
import { zeroAddress, type Address } from "viem";
import type { AuctionV2 } from "@/lib/launchV2";
import { explorer, poolStats, poolTrades, type CoinTrade, type PoolStats } from "@/lib/coinMarket";
import { fmtCompact, fmtPrice, type ChartNetwork } from "@/lib/solanaCoins";

export type CoinFacts = { symbol?: string; name?: string; icon?: string; price?: number; change24h?: number; mcap?: number; liquidity?: number };

/** The cookie /terminal reads to reopen the last coin a trader had open (app/terminal/route.ts). */
export const LAST_COIN_COOKIE = "crux_last_coin";

const CHAIN_LABEL: Record<ChartNetwork, string> = { solana: "Solana", bsc: "BNB Chain" };

const ago = (now: number, t: number) => {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  return s < 60 ? `${s}s` : s < 3_600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h` : `${Math.floor(s / 86_400)}d`;
};
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const amount = (n: number) => Intl.NumberFormat("en-US", { notation: n >= 1e6 ? "compact" : "standard", maximumFractionDigits: n >= 1 ? 2 : 6 }).format(n);
const usd = (n: number) => (n >= 1_000 ? fmtCompact(n) : `$${n.toFixed(2)}`);

function useNow(ms = 1_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The pro terminal for a Solana or BNB Chain coin: the same layout as a Crux launch's terminal.
 *
 *         coin bar (price, 5m/1h/6h/24h moves, market cap, liquidity, volume, buys/sells, age)
 *   lg+:  ┌───────────────┬────────────┐       phones: coin bar → chart → buy/sell → desk
 *         │ chart         │ buy / sell │
 *         ├───────────────┤            │
 *         │ desk (tabs)   │            │
 *         └───────────────┴────────────┘
 *   The desk: live trades (click a trader to see only theirs) and the coin's details.
 */
export function CoinTerminal({ network, token, coin, trade, path }: { network: ChartNetwork; token: string; coin: CoinFacts | null | undefined; trade: ReactNode; path: string }) {
  const stats = useQuery({ queryKey: ["coin-pool", network, token], queryFn: () => poolStats(network, token), refetchInterval: 20_000, staleTime: 10_000 });
  const pool = stats.data?.pool;
  const trades = useQuery({
    queryKey: ["coin-trades", network, pool],
    queryFn: () => poolTrades(network, pool!, token),
    enabled: Boolean(pool),
    // GeckoTerminal allows ~30 reads a minute per visitor: trades every 10 s, candles every 30 s.
    // The live feed (lib/coinFeed, via the chart) brings each trade as it lands; this only fills in history.
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  // Terminal in the nav reopens this coin next time.
  useEffect(() => {
    try {
      document.cookie = `${LAST_COIN_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=2592000; samesite=lax`;
    } catch {
      // Cookies off: Terminal opens the default coin instead.
    }
  }, [path]);

  const s = stats.data;
  const price = coin?.price ?? s?.price;
  const symbol = coin?.symbol || "…";
  // The Crux pro chart takes a launch's shape; for another chain's coin it needs only the supply (for market-cap
  // units) and when trading began. Its candles and trades come from the coin's own pool (`remote`).
  const mcap = coin?.mcap ?? s?.mcap;
  const supply = mcap !== undefined && price ? Math.round(mcap / price) : 0;
  const since = s?.createdAt ? Math.floor(s.createdAt / 1000) : 0;
  const auction = useMemo<AuctionV2>(
    () => ({
      token: token as Address,
      creator: zeroAddress,
      startTime: since,
      batchWindow: 0,
      status: 1,
      bidderCount: 0,
      settledAt: since,
      pair: zeroAddress,
      totalSupply: BigInt(supply) * BigInt("1000000000000000000"),
      saleSupply: BigInt(0),
      graduationTarget: BigInt(0),
      floorPrice: BigInt(0),
      maxAllocationPerWallet: BigInt(0),
      totalDeposits: BigInt(0),
      clearingPrice: BigInt(0),
    }),
    [token, since, supply],
  );
  const remote = useMemo(() => ({ network, token }), [network, token]);
  const now = useNow();

  return (
    <TerminalShell>
      <CoinBar network={network} token={token} coin={coin} price={price} stats={s ?? undefined} now={now} />
      <div className="flex min-h-0 flex-1 gap-px bg-line">
      {/* Every chain's coins, one click from each other (wide screens; phones use the header search). */}
      <div className="hidden w-[230px] shrink-0 xl:flex xl:flex-col">
        <CoinRail current={path} />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line max-lg:pb-6 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)_minmax(190px,30%)]">
        <section aria-label="Chart" className="bg-void p-1.5 max-lg:h-[72svh] max-lg:min-h-[460px] lg:col-start-1 lg:row-start-1 lg:min-h-0">
          <ChartGrid auction={auction} symbol={`$${coin?.symbol || "Coin"}`} name={coin?.name ?? null} factory={zeroAddress} id="0" external remote={remote} />
        </section>
        <aside aria-label="Buy and sell" className="bg-panel p-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          {trade}
          {s && <Flow stats={s} />}
        </aside>
        <section aria-label="Trades and details" className="min-h-[260px] bg-void p-3 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
          <Desk network={network} token={token} symbol={symbol} trades={trades.data ?? []} loading={stats.isLoading || trades.isLoading} busy={trades.isError && !trades.data} noPool={stats.data === null} now={now} stats={s ?? undefined} />
        </section>
      </div>
      </div>
    </TerminalShell>
  );
}

function CoinBar({ network, token, coin, price, stats, now }: { network: ChartNetwork; token: string; coin: CoinFacts | null | undefined; price?: number; stats?: PoolStats; now: number }) {
  const [copied, setCopied] = useState(false);
  const mcap = coin?.mcap ?? stats?.mcap;
  const liquidity = stats?.liquidity ?? coin?.liquidity;
  const moves: [string, number | undefined][] = [
    ["5m", stats?.change.m5],
    ["1h", stats?.change.h1],
    ["6h", stats?.change.h6],
    ["24h", stats?.change.h24 ?? coin?.change24h],
  ];
  return (
    <section aria-label="Coin" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
        {coin?.icon ? <img src={coin.icon} alt="" className="h-9 w-9 shrink-0 rounded-full" /> : <span className="h-9 w-9 shrink-0 rounded-full bg-line" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display-md text-[20px] leading-none text-chrome">${coin?.symbol || "…"}</h1>
            <span className="truncate text-[12.5px] text-muted">{coin?.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-[3px] border border-line-2 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
              {CHAIN_LABEL[network]}
              {stats?.venue ? ` · ${stats.venue}` : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(token).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1_200);
                });
              }}
              className="font-mono text-[10.5px] text-dim hover:text-chrome"
              title="Copy the coin's address"
            >
              {copied ? "copied ✓" : `${short(token)} ⧉`}
            </button>
          </div>
        </div>
      </div>
      <div className="font-mono text-[22px] text-chrome">{price !== undefined ? fmtPrice(price) : "…"}</div>
      <div className="flex gap-1.5">
        {moves.map(([label, v]) => (
          <span key={label} className="rounded-[4px] bg-panel-2 px-2 py-1 font-mono text-[11px]">
            <span className="text-dim">{label} </span>
            <span className={v === undefined ? "text-dim" : v >= 0 ? "text-up" : "text-down"}>{v === undefined ? "—" : pct(v)}</span>
          </span>
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
        <Stat label="MCap" value={mcap !== undefined ? fmtCompact(mcap) : "—"} />
        <Stat label="Liq" value={liquidity !== undefined ? fmtCompact(liquidity) : "—"} />
        <Stat label="Vol 24h" value={stats?.volume24h !== undefined ? fmtCompact(stats.volume24h) : "—"} />
        <Stat label="Age" value={stats?.createdAt ? ago(now, stats.createdAt) : "—"} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</dt>
      <dd className="text-chrome">{value}</dd>
    </div>
  );
}

/** The last 24 hours' buying against selling, under the Buy/Sell panel. */
function Flow({ stats }: { stats: PoolStats }) {
  const buys = stats.buys24h ?? 0;
  const sells = stats.sells24h ?? 0;
  const total = buys + sells;
  if (total === 0) return null;
  const share = (buys / total) * 100;
  return (
    <section aria-label="Last 24 hours" className="mt-3 rounded-xl border border-line p-4">
      <p className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Last 24 hours</p>
      <div className="mt-2 flex justify-between font-mono text-[12px]">
        <span className="text-up">{buys.toLocaleString("en-US")} buys</span>
        <span className="text-down">{sells.toLocaleString("en-US")} sells</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-down/60" aria-hidden="true">
        <div className="bg-up" style={{ width: `${share}%` }} />
      </div>
      {stats.volume1h !== undefined && <p className="mt-2 font-mono text-[11px] text-dim">Traded in the last hour: {fmtCompact(stats.volume1h)}</p>}
    </section>
  );
}

type Tab = "trades" | "details";
const th = "px-2 py-1.5 text-[10.5px] font-normal uppercase tracking-[0.12em] text-dim";
const td = "px-2 py-1.5 text-[12px]";

function Desk({
  network,
  token,
  symbol,
  trades,
  loading,
  busy,
  noPool,
  now,
  stats,
}: {
  network: ChartNetwork;
  token: string;
  symbol: string;
  trades: CoinTrade[];
  loading: boolean;
  /** The trades source is refusing for now (too many reads): retried by itself. */
  busy: boolean;
  noPool: boolean;
  now: number;
  stats?: PoolStats;
}) {
  const [tab, setTab] = useState<Tab>("trades");
  const [focus, setFocus] = useState<string | null>(null);
  const [bigOnly, setBigOnly] = useState(false);
  const x = explorer(network);
  const shown = useMemo(() => trades.filter((t) => (!focus || t.trader === focus) && (!bigOnly || t.usd >= 500)).slice(0, 100), [trades, focus, bigOnly]);
  const tabs: [Tab, string][] = [
    ["trades", "Trades"],
    ["details", "Details"],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Desk" className="flex gap-1 overflow-x-auto">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-[4px] px-3 py-1 text-[12px] transition-colors ${tab === t ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
            >
              {label}
              {t === "trades" && <span className="ml-1.5 font-mono text-dim">{trades.length}</span>}
            </button>
          ))}
        </div>
        {tab === "trades" && (
          <div className="flex shrink-0 items-center gap-3 text-[11px]">
            {focus && (
              <button type="button" onClick={() => setFocus(null)} className="rounded-[4px] bg-panel-2 px-2 py-0.5 font-mono text-chrome">
                {short(focus)} ✕
              </button>
            )}
            <label className="flex items-center gap-1.5 text-dim">
              <input type="checkbox" checked={bigOnly} onChange={(e) => setBigOnly(e.target.checked)} />
              $500+ only
            </label>
            <span className="hidden text-dim sm:inline">Updates live</span>
          </div>
        )}
      </div>

      {tab === "details" ? (
        <dl className="grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
          <Detail label="Coin address">
            <a href={x.token(token)} target="_blank" rel="noopener noreferrer" className="font-mono text-chrome hover:underline">
              {short(token)} ↗
            </a>
          </Detail>
          {stats?.pool && (
            <Detail label="Market">
              <a href={x.account(stats.pool)} target="_blank" rel="noopener noreferrer" className="font-mono text-chrome hover:underline">
                {stats.venue ?? "Pool"} · {short(stats.pool)} ↗
              </a>
            </Detail>
          )}
          <Detail label="Trading since">{stats?.createdAt ? new Date(stats.createdAt).toLocaleString() : "—"}</Detail>
          <Detail label="Money in the market">{stats?.liquidity !== undefined ? fmtCompact(stats.liquidity) : "—"}</Detail>
          <Detail label="Traded in 24 hours">{stats?.volume24h !== undefined ? fmtCompact(stats.volume24h) : "—"}</Detail>
          <Detail label="Chain">{CHAIN_LABEL[network]}</Detail>
        </dl>
      ) : noPool ? (
        <p className="px-2 py-4 text-[12.5px] text-dim">This coin has no market yet, so there are no trades to show.</p>
      ) : loading ? (
        <p className="px-2 py-4 text-[12.5px] text-dim">Reading the latest trades…</p>
      ) : busy ? (
        <p className="px-2 py-4 text-[12.5px] text-dim">Trades are busy for a moment. Trying again…</p>
      ) : shown.length === 0 ? (
        <p className="px-2 py-4 text-[12.5px] text-dim">No trades to show{focus || bigOnly ? " with this filter" : " yet"}.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[560px] text-left">
            <caption className="sr-only">Latest trades</caption>
            <thead className="sticky top-0 bg-void">
              <tr className="border-b border-line">
                <th scope="col" className={th}>Age</th>
                <th scope="col" className={th}>Side</th>
                <th scope="col" className={`${th} text-right`}>USD</th>
                <th scope="col" className={`${th} text-right`}>${symbol}</th>
                <th scope="col" className={`${th} text-right`}>Price</th>
                <th scope="col" className={th}>Trader</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {shown.map((t) => (
                <tr key={t.id} className={`border-b border-line/60 ${t.side === "buy" ? "hover:bg-up/[0.04]" : "hover:bg-down/[0.04]"}`}>
                  <td className={`${td} text-dim`}>{ago(now, t.time)}</td>
                  <td className={`${td} ${t.side === "buy" ? "text-up" : "text-down"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                  <td className={`${td} text-right ${t.usd >= 500 ? "font-semibold" : ""} ${t.side === "buy" ? "text-up" : "text-down"}`}>{usd(t.usd)}</td>
                  <td className={`${td} text-right text-muted`}>{amount(t.amount)}</td>
                  <td className={`${td} text-right text-chrome`}>{fmtPrice(t.price)}</td>
                  <td className={td}>
                    <button type="button" onClick={() => setFocus(focus === t.trader ? null : t.trader)} className="text-muted hover:text-chrome" title="Only this trader's trades">
                      {short(t.trader)}
                    </button>
                    <a href={x.tx(t.tx)} target="_blank" rel="noopener noreferrer" className="ml-2 text-dim hover:text-chrome" aria-label="Open the trade">
                      ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5">
      <dt className="text-dim">{label}</dt>
      <dd className="text-right text-chrome">{children}</dd>
    </div>
  );
}
