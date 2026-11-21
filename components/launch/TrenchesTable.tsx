"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { freshBnbCoins } from "@/lib/coinMarket";
import { fmtCompact, freshSolanaCoins, type FreshCoin } from "@/lib/solanaCoins";

const age = (ms: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3_600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h` : `${Math.floor(s / 86_400)}d`;
};

/** The warning signs on a fresh coin, worst first, in plain words (empty when none are known). */
export function warnings(c: FreshCoin): string[] {
  const w: string[] = [];
  if (c.mintOff === false) w.push("More can be printed");
  if (c.freezeOff === false) w.push("Coins can be frozen");
  if ((c.creatorLaunches ?? 0) >= 20) w.push(`Creator launched ${c.creatorLaunches!.toLocaleString("en-US")} coins`);
  if ((c.creatorPct ?? 0) >= 10) w.push(`Creator holds ${c.creatorPct!.toFixed(0)}%`);
  // Every coin scores "low" in its first minutes (too few trades to judge), so only an older coin is flagged.
  if (c.organic === "low" && Date.now() - c.createdAt > 15 * 60_000) w.push("Mostly bot trading");
  return w;
}

/**
 * Discover's Trenches tab: the newest Solana and BNB Chain coins and Crux's own Base launches, refreshed every 10-20 s, with what tells a runner from a rug (age,
 * money in the pool, holders, the last five minutes' buys and sells, and the warning signs). The left side of the
 * "barbell": fast, small, risky; pair it with the creator-sell alert on the coin's page.
 */
type Chain = "all" | "sol" | "bnb" | "base";
/** A Crux launch on Base, as /api/launches lists it (lib/launchFeed.ts). */
type FeedRow = { version: number; auctionId: number; token: string; name: string; symbol: string; startTime: number; raised: string; totalSupply: string; priceUsd?: number; creatorVestingDays: number; metadata: { image: string | null } };
type Row = {
  key: string;
  chain: "sol" | "bnb" | "base";
  href: string;
  symbol: string;
  name: string;
  icon?: string;
  createdAt: number;
  mcap?: number;
  liquidity?: number;
  holders?: number;
  buys5m?: number;
  sells5m?: number;
  /** null: not known for this chain's coins (no warning-sign data), so nothing is claimed either way. */
  warnings: string[] | null;
};

export function TrenchesTable() {
  const [chain, setChain] = useState<Chain>("all");
  const sol = useQuery({ queryKey: ["solana-fresh"], queryFn: () => freshSolanaCoins(), refetchInterval: 10_000, staleTime: 5_000, enabled: chain === "all" || chain === "sol" });
  // GeckoTerminal allows ~30 reads a minute per visitor: two pages every 20 s.
  const bnb = useQuery({ queryKey: ["bnb-fresh"], queryFn: () => freshBnbCoins(), refetchInterval: 20_000, staleTime: 10_000, enabled: chain === "all" || chain === "bnb" });
  // Base: Crux's own launches (the same cached list as search and the terminal's rail).
  const base = useQuery({
    queryKey: ["launch-feed"],
    queryFn: async () => {
      const r = await fetch("/api/launches");
      if (!r.ok) throw new Error(`launches ${r.status}`);
      return ((await r.json()) as { launches: FeedRow[] }).launches;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: chain === "all" || chain === "base",
  });
  const solRows: Row[] = (sol.data ?? []).map((c) => ({
    key: `sol:${c.mint}`,
    chain: "sol",
    href: `/sol/${c.mint}`,
    symbol: c.symbol,
    name: c.name,
    icon: c.icon,
    createdAt: c.createdAt,
    mcap: c.mcap,
    liquidity: c.liquidity,
    holders: c.holders,
    buys5m: c.buys5m,
    sells5m: c.sells5m,
    warnings: warnings(c),
  }));
  const bnbRows: Row[] = (bnb.data ?? []).map((c) => ({
    key: `bnb:${c.address}`,
    chain: "bnb",
    href: `/bnb/${c.address}`,
    symbol: c.symbol,
    name: c.name,
    icon: c.icon,
    createdAt: c.createdAt,
    mcap: c.mcap,
    liquidity: c.liquidity,
    buys5m: c.buys5m,
    sells5m: c.sells5m,
    warnings: null,
  }));
  const baseRows: Row[] = (base.data ?? [])
    .filter((c) => c.version === 9)
    .map((c) => {
      const mcap = (c.priceUsd ?? 0) * Number(c.totalSupply);
      return {
        key: `base:${c.token}`,
        chain: "base" as const,
        href: `/launch/v9/${c.auctionId}`,
        symbol: c.symbol || "TOKEN",
        name: c.name,
        icon: c.metadata.image ?? undefined,
        createdAt: c.startTime * 1000,
        mcap: mcap > 0 ? mcap : undefined,
        // On its curve, the money in it is what buyers paid in.
        liquidity: Number(c.raised),
        // What Crux knows for sure about its own launches: whether the creator's coins are locked.
        warnings: c.creatorVestingDays === 0 ? ["Creator can sell at once"] : null,
      };
    });
  const pick = { all: [...solRows, ...bnbRows, ...baseRows], sol: solRows, bnb: bnbRows, base: baseRows }[chain];
  const rows = [...pick].sort((a, b) => b.createdAt - a.createdAt);
  const loading = ((chain === "all" || chain === "sol") && sol.isLoading) || ((chain === "all" || chain === "bnb") && bnb.isLoading) || ((chain === "all" || chain === "base") && base.isLoading);
  const q = { isLoading: loading && rows.length === 0 };
  const chips: [Chain, string][] = [
    ["all", "All"],
    ["sol", "Solana"],
    ["bnb", "BNB Chain"],
    ["base", "Base"],
  ];
  return (
    <>
    <div className="mt-6 flex gap-1" role="group" aria-label="Which coins">
      {chips.map(([c, label]) => (
        <button
          key={c}
          type="button"
          aria-pressed={chain === c}
          onClick={() => setChain(c)}
          className={`rounded-[4px] px-3 py-1 text-[12px] transition-colors ${chain === c ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
        >
          {label}
        </button>
      ))}
    </div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-dim">
            <th className="px-4 py-3 font-normal">Coin</th>
            <th className="px-3 py-3 text-right font-normal">Age</th>
            <th className="px-3 py-3 text-right font-normal">Market cap</th>
            <th className="px-3 py-3 text-right font-normal">Liquidity</th>
            <th className="px-3 py-3 text-right font-normal">Holders</th>
            <th className="px-3 py-3 text-right font-normal">5m buys / sells</th>
            <th className="px-4 py-3 font-normal">Watch out</th>
          </tr>
        </thead>
        <tbody>
          {q.isLoading && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-dim">
                Loading the newest coins…
              </td>
            </tr>
          )}
          {!q.isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-dim">
                Nothing new with real money in it right now. This refreshes every 10 seconds.
              </td>
            </tr>
          )}
          {rows.map((c) => {
            const w = c.warnings;
            return (
              <tr key={c.key} className="border-b border-line/60 last:border-0 hover:bg-tint/[0.03]">
                <td className="px-4 py-2.5">
                  <Link href={c.href} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
                    {c.icon ? <img src={c.icon} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-line" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="text-chrome">${c.symbol}</span> <span className="text-dim">{c.name.slice(0, 22)}</span>
                    </span>
                    <span className="rounded-[3px] border border-line-2 px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-dim">{c.chain === "sol" ? "SOL" : c.chain === "bnb" ? "BNB" : "BASE"}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{age(c.createdAt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-chrome">{c.mcap !== undefined ? fmtCompact(c.mcap) : "…"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{c.liquidity !== undefined ? fmtCompact(c.liquidity) : "…"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{c.holders ?? "—"}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className="text-up">{c.buys5m ?? 0}</span>
                  <span className="text-dim"> / </span>
                  <span className="text-down">{c.sells5m ?? 0}</span>
                </td>
                <td className="px-4 py-2.5 text-[11.5px]">{w === null ? <span className="text-dim">Not checked yet</span> : w.length ? <span className="text-signal">{w.join(" · ")}</span> : <span className="text-up">No warning signs</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-dim">
        Fresh coins are risky: most go to zero. On a coin&rsquo;s page, turn on &ldquo;Notify me when the creator sells&rdquo;.
      </p>
    </div>
    </>
  );
}
