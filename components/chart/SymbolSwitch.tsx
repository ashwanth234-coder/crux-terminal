"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { PHASE, search, type Hit } from "@/components/site/TokenSearch";
import { RELAY_URL } from "@/lib/readCache";
import { Popover, Tool } from "./ui";
import { NETWORK_NAME } from "@/lib/network";

/** The relay's curated markets (Way C: deep-liquidity tokens Crux can fill) and the busiest official pools. */
type Markets = {
  curated: { symbol: string; token: string; decimals: number; buyable: boolean; note: string | null; tokensPerUsdc: string }[];
  trending: { rows: { pool: string; token0: { address: string; symbol: string }; token1: { address: string; symbol: string }; swaps: number; official: boolean }[] } | null;
};
const USDC_LIKE = /^USDC/i;

/**
 * The chart's symbol button, as on a trading terminal: two tabs. 🔥 Launches: every Crux launch (live openings and
 * trading tokens; live ones first when the box is empty). 🏛️ Markets: curated deep-liquidity tokens and the busiest
 * official Base Sepolia pools. Any Base Sepolia token also opens by its address.
 */
export function SymbolSwitch({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [wanted, setWanted] = useState(false);
  const [tab, setTab] = useState<"launches" | "markets">("launches");
  const feed = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: Hit[] }).launches;
    },
    enabled: wanted,
    staleTime: 60_000,
  });
  const markets = useQuery({
    queryKey: ["relay-markets"],
    queryFn: async () => {
      const r = await fetch(`${RELAY_URL}/v1/markets`);
      if (!r.ok) throw new Error(`markets ${r.status}`);
      return (await r.json()) as Markets;
    },
    enabled: wanted && tab === "markets",
    staleTime: 60_000,
  });
  const text = q.trim();
  const direct = isAddress(text, { strict: false });
  const launches = feed.data ?? [];
  // Empty box: live openings first, then trading tokens.
  const hits = direct
    ? []
    : text
      ? search(launches, text)
      : [...launches.filter((l) => l.phase === "open" || l.phase === "scheduled"), ...launches.filter((l) => l.phase === "graduated")].slice(0, 10);
  const match = (s: string) => !text || s.toLowerCase().includes(text.toLowerCase());
  const curated = (markets.data?.curated ?? []).filter((m) => match(m.symbol));
  const seen = new Set(curated.map((m) => m.token.toLowerCase()));
  const pools: { address: string; symbol: string }[] = [];
  for (const r of markets.data?.trending?.rows ?? []) {
    if (!r.official) continue;
    // The pool's non-dollar side (or its non-WETH side against WETH).
    const t = USDC_LIKE.test(r.token0.symbol) || r.token0.symbol === "WETH" ? r.token1 : r.token0;
    if (USDC_LIKE.test(t.symbol) || seen.has(t.address.toLowerCase()) || !match(t.symbol)) continue;
    seen.add(t.address.toLowerCase());
    pools.push(t);
    if (pools.length === 8) break;
  }

  const tabButton = (id: "launches" | "markets", label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`h-7 rounded-[3px] text-[12px] transition-colors ${tab === id ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/50" : "text-muted hover:text-chrome"}`}
    >
      {label}
    </button>
  );

  return (
    <Popover
      width="w-80"
      button={(open, toggle) => (
        <Tool
          label="Change symbol"
          active={open}
          onClick={() => {
            setWanted(true);
            toggle();
          }}
          className="px-2"
        >
          <span className="flex items-center gap-1 font-sans text-[12.5px] font-semibold text-chrome">
            {symbol}
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-dim" aria-hidden="true">
              <path d="m2 3.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
        </Tool>
      )}
    >
      {(close) => {
        const go = (href: string) => {
          close();
          setQ("");
          router.push(href);
        };
        const row = "flex w-full items-baseline justify-between gap-3 rounded-[3px] px-2 py-1.5 text-left hover:bg-tint/[0.05]";
        const firstMarket = curated[0]?.token ?? pools[0]?.address;
        return (
          <div className="flex flex-col gap-1 p-1">
            <div role="tablist" aria-label="Tokens" className="grid grid-cols-2 gap-1 rounded-[4px] bg-void/60 p-0.5">
              {tabButton("launches", "🔥 Launches")}
              {tabButton("markets", "🏛️ Markets")}
            </div>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (direct) go(`/token/${text}`);
                else if (tab === "launches" && hits[0]) go(`/launch/v${hits[0].version}/${hits[0].auctionId}`);
                else if (tab === "markets" && firstMarket) go(`/token/${firstMarket}`);
              }}
            >
              <label htmlFor="chart-symbol-search" className="sr-only">
                Ticker, name or 0x address
              </label>
              <input
                id="chart-symbol-search"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker, name or 0x address"
                className="w-full rounded-[4px] border border-line bg-void px-2 py-1.5 text-[12.5px] text-chrome outline-none placeholder:text-dim focus:border-line-2"
              />
            </form>
            {direct ? (
              <button type="button" onClick={() => go(`/token/${text}`)} className="rounded-[3px] px-2 py-1.5 text-left text-[12px] text-chrome hover:bg-tint/[0.05]">
                Open {text.slice(0, 6)}…{text.slice(-4)}
              </button>
            ) : tab === "launches" ? (
              <>
                {!text && <p className="px-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-dim">Live fair launches, then trading</p>}
                {feed.isLoading ? (
                  <p className="px-2 py-1.5 text-[12px] text-dim">Loading launches…</p>
                ) : hits.length === 0 ? (
                  <p className="px-2 py-1.5 text-[12px] text-dim">{text ? "No Crux launch matches. Paste a token address to open any token." : "No launches yet."}</p>
                ) : (
                  <ul className="flex flex-col">
                    {hits.map((h) => (
                      <li key={h.key}>
                        <button type="button" onClick={() => go(`/launch/v${h.version}/${h.auctionId}`)} className={row}>
                          <span className="min-w-0 truncate text-[12.5px] text-chrome">
                            ${h.symbol} <span className="text-dim">{h.name}</span>
                          </span>
                          <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${h.phase === "open" ? "text-signal" : "text-dim"}`}>
                            {PHASE[h.phase] ?? h.phase}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : markets.isLoading ? (
              <p className="px-2 py-1.5 text-[12px] text-dim">Loading markets…</p>
            ) : markets.isError ? (
              <p className="px-2 py-1.5 text-[12px] text-dim">Markets are unavailable right now. Paste a token address to open any token.</p>
            ) : (
              <>
                {curated.length > 0 && <p className="px-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-dim">Deep liquidity · Crux fills</p>}
                <ul className="flex flex-col">
                  {curated.map((m) => {
                    const perUsdc = Number(m.tokensPerUsdc) / 10 ** m.decimals;
                    return (
                      <li key={m.token}>
                        <button type="button" onClick={() => go(`/token/${m.token}`)} className={row}>
                          <span className="min-w-0 truncate text-[12.5px] text-chrome">
                            {m.symbol} {m.note && <span className="text-dim">· {m.note}</span>}
                          </span>
                          <span className="shrink-0 font-mono text-[10.5px] text-muted">
                            {perUsdc > 0 ? `$${(1 / perUsdc).toLocaleString("en-US", { maximumSignificantDigits: 5 })}` : "—"}
                            {!m.buyable && <span className="ml-1.5 text-dim">soon</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {pools.length > 0 && <p className="px-1.5 pt-1 text-[10px] uppercase tracking-[0.14em] text-dim">Busiest {NETWORK_NAME} pools</p>}
                <ul className="flex flex-col">
                  {pools.map((t) => (
                    <li key={t.address}>
                      <button type="button" onClick={() => go(`/token/${t.address}`)} className={row}>
                        <span className="min-w-0 truncate text-[12.5px] text-chrome">{t.symbol}</span>
                        <span className="shrink-0 font-mono text-[10px] text-dim">
                          {t.address.slice(0, 6)}…{t.address.slice(-4)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {curated.length === 0 && pools.length === 0 && <p className="px-2 py-1.5 text-[12px] text-dim">No market matches.</p>}
              </>
            )}
          </div>
        );
      }}
    </Popover>
  );
}
