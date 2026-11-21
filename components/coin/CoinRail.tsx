"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BNB_MAJORS, bnbMajors, freshBnbCoins, trendingBnbCoins, type MajorCoin } from "@/lib/coinMarket";
import { fmtCompact, freshSolanaCoins, solanaCoins, SOLANA_MAJORS_LISTED, trendingSolanaCoins } from "@/lib/solanaCoins";

type Chain = "all" | "sol" | "bnb" | "base";
type Category = "trending" | "new" | "gainers" | "top";
type Item = { key: string; href: string; chain: "sol" | "bnb" | "base"; symbol: string; icon?: string; mcap?: number; change?: number; createdAt?: number };

const CATEGORIES: [Category, string][] = [
  ["trending", "🔥 Trending"],
  ["new", "New"],
  ["gainers", "Gainers"],
  ["top", "Top"],
];

const CHAINS: [Chain, string][] = [
  ["all", "All"],
  ["sol", "Solana"],
  ["bnb", "BNB"],
  ["base", "Base"],
];

/** A Crux launch on Base, as /api/launches lists it (lib/launchFeed.ts). */
type FeedRow = { version: number; auctionId: number; symbol: string; phase: string; startTime: number; raised: string; totalSupply: string; priceUsd?: number; metadata: { image: string | null } };

const age = (ms: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3_600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h` : `${Math.floor(s / 86_400)}d`;
};

/** Takes turns from each list, so "All" shows every chain near the top instead of one chain's whole list first. */
const interleave = <T,>(...lists: T[][]) =>
  Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) => lists.map((l) => l[i]))
    .flat()
    .filter((x): x is T => x !== undefined);

/**
 * The terminal's coin list, every chain in one place, by category: Trending (most traded this hour), New (seconds
 * old), Gainers (biggest movers this hour) and Top (the big coins). No stablecoins. Clicking one switches the terminal.
 */
export function CoinRail({ current }: { current: string }) {
  const [chain, setChain] = useState<Chain>("all");
  const [cat, setCat] = useState<Category>("trending");
  const wantSol = chain === "all" || chain === "sol";
  const wantBnb = chain === "all" || chain === "bnb";
  const wantBase = chain === "all" || chain === "base";
  const hot = cat === "trending" || cat === "gainers";

  const solTop = useQuery({ queryKey: ["solana-majors"], queryFn: () => solanaCoins(SOLANA_MAJORS_LISTED), refetchInterval: 30_000, staleTime: 15_000, enabled: cat === "top" && wantSol });
  const bnbTop = useQuery({ queryKey: ["bnb-majors"], queryFn: bnbMajors, refetchInterval: 30_000, staleTime: 15_000, enabled: cat === "top" && wantBnb });
  const solNew = useQuery({ queryKey: ["solana-fresh"], queryFn: () => freshSolanaCoins(), refetchInterval: 15_000, staleTime: 5_000, enabled: cat === "new" && wantSol });
  const bnbNew = useQuery({ queryKey: ["bnb-fresh"], queryFn: () => freshBnbCoins(), refetchInterval: 30_000, staleTime: 10_000, enabled: cat === "new" && wantBnb });
  const solHot = useQuery({ queryKey: ["solana-trending"], queryFn: () => trendingSolanaCoins(), refetchInterval: 30_000, staleTime: 15_000, enabled: hot && wantSol });
  // Crux's own launches on Base (shared with the search box: the same cached list).
  const baseFeed = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: FeedRow[] }).launches;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: wantBase,
  });
  const bnbHot = useQuery({ queryKey: ["bnb-trending"], queryFn: trendingBnbCoins, refetchInterval: 60_000, staleTime: 30_000, enabled: hot && wantBnb });

  const sol = (c: { mint: string; symbol: string; icon?: string; mcap?: number }, extra: Partial<Item> = {}): Item => ({ key: `sol:${c.mint}`, href: `/sol/${c.mint}`, chain: "sol", symbol: c.symbol, icon: c.icon, mcap: c.mcap, ...extra });
  const bnb = (c: { address: string; symbol: string; icon?: string; mcap?: number }, extra: Partial<Item> = {}): Item => ({ key: `bnb:${c.address}`, href: `/bnb/${c.address}`, chain: "bnb", symbol: c.symbol, icon: c.icon, mcap: c.mcap, ...extra });

  const baseLaunches = (wantBase ? (baseFeed.data ?? []) : []).filter((c) => c.version === 9);
  const baseItem = (c: FeedRow, extra: Partial<Item> = {}): Item => {
    const mcap = (c.priceUsd ?? 0) * Number(c.totalSupply);
    return { key: `base:${c.auctionId}`, href: `/launch/v9/${c.auctionId}`, chain: "base", symbol: c.symbol || "TOKEN", icon: c.metadata.image ?? undefined, mcap: mcap > 0 ? mcap : undefined, ...extra };
  };
  const baseLoading = wantBase && baseFeed.isLoading;

  let items: Item[] = [];
  let loading = false;
  if (cat === "top") {
    const s = wantSol ? (solTop.data ?? []).map((c) => sol(c, { change: c.change24h })) : [];
    const b = wantBnb ? (bnbTop.data ?? BNB_MAJORS.map((m): MajorCoin => ({ ...m, name: m.symbol }))).map((c) => bnb(c, { change: c.change24h })) : [];
    const ba = baseLaunches.map((c) => baseItem(c));
    items = [...s, ...b, ...ba].sort((x, y) => (y.mcap ?? 0) - (x.mcap ?? 0));
    loading = (wantSol && solTop.isLoading) || baseLoading;
  } else if (cat === "new") {
    const s = wantSol ? (solNew.data ?? []).slice(0, 30).map((c) => sol(c, { createdAt: c.createdAt })) : [];
    const b = wantBnb ? (bnbNew.data ?? []).slice(0, 30).map((c) => bnb(c, { createdAt: c.createdAt })) : [];
    const ba = baseLaunches.map((c) => baseItem(c, { createdAt: c.startTime * 1000 }));
    items = [...s, ...b, ...ba].sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
    loading = (wantSol && solNew.isLoading) || (wantBnb && bnbNew.isLoading) || baseLoading;
  } else {
    const s = wantSol ? (solHot.data ?? []).map((c) => sol(c, { change: c.change1h })) : [];
    const b = wantBnb ? (bnbHot.data ?? []).map((c) => bnb(c, { change: c.change1h })) : [];
    // Base launches have no hourly change yet: Trending lists them by money raised (with their market cap); Gainers
    // leaves them out.
    const ba = cat === "gainers" ? [] : [...baseLaunches].sort((x, y) => Number(y.raised) - Number(x.raised)).map((c) => baseItem(c));
    items = cat === "gainers" ? [...s, ...b].filter((c) => (c.change ?? 0) > 0).sort((x, y) => (y.change ?? 0) - (x.change ?? 0)) : interleave(s, b, ba);
    loading = (wantSol && solHot.isLoading) || (wantBnb && bnbHot.isLoading) || baseLoading;
  }

  const chip = (on: boolean) => `rounded-[4px] px-2 py-1 text-[11.5px] transition-colors ${on ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`;
  return (
    <nav aria-label="Coins" className="flex min-h-0 flex-col bg-void">
      <div className="flex gap-1 border-b border-line p-2">
        {CHAINS.map(([c, label]) => (
          <button key={c} type="button" aria-pressed={chain === c} onClick={() => setChain(c)} className={`flex-1 ${chip(chain === c)}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tablist" aria-label="Category" className="flex flex-wrap gap-1 border-b border-line p-2">
        {CATEGORIES.map(([c, label]) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <List items={items} current={current} empty={loading ? "Loading…" : "Nothing here right now."} />
      </div>
    </nav>
  );
}

function List({ items, current, empty }: { items: Item[]; current: string; empty: string }) {
  if (items.length === 0) return <p className="px-3 py-3 text-[11.5px] text-dim">{empty}</p>;
  return (
    <ul className="py-1">
      {items.map((c) => {
        const on = c.href.toLowerCase() === current.toLowerCase();
        return (
          <li key={c.key}>
            <Link
              href={c.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] ${on ? "bg-panel-2 text-chrome" : "text-muted hover:bg-tint/[0.04] hover:text-chrome"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
              {c.icon ? <img src={c.icon} alt="" className="h-5 w-5 shrink-0 rounded-full" /> : <span className="h-5 w-5 shrink-0 rounded-full bg-line" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">${c.symbol}</span>
              <span className="font-mono text-[9px] uppercase text-dim">{c.chain === "sol" ? "SOL" : c.chain === "bnb" ? "BNB" : "BASE"}</span>
              <span className="w-12 text-right font-mono text-[11px]">
                {c.change !== undefined ? (
                  <span className={c.change >= 0 ? "text-up" : "text-down"}>
                    {c.change >= 0 ? "+" : ""}
                    {Math.abs(c.change) >= 100 ? Math.round(c.change) : c.change.toFixed(1)}%
                  </span>
                ) : c.createdAt ? (
                  <span className="text-dim">{age(c.createdAt)}</span>
                ) : c.mcap !== undefined ? (
                  <span className="text-dim">{fmtCompact(c.mcap)}</span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
