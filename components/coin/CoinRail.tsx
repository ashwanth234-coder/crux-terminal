"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { freshBnbCoins } from "@/lib/coinMarket";
import { fmtCompact, freshSolanaCoins, solanaCoins, SOLANA_MAJORS } from "@/lib/solanaCoins";

type Chain = "all" | "sol" | "bnb";
type Item = { key: string; href: string; chain: "sol" | "bnb"; symbol: string; icon?: string; mcap?: number; change?: number; createdAt?: number };

/** BNB Chain's big coins, always listed. */
const BNB_MAJORS: Item[] = [
  { key: "bnb:cake", href: "/bnb/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", chain: "bnb", symbol: "CAKE" },
  { key: "bnb:btcb", href: "/bnb/0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", chain: "bnb", symbol: "BTCB" },
  { key: "bnb:eth", href: "/bnb/0x2170Ed0880ac9A755fd29B2688956BD959F933F8", chain: "bnb", symbol: "ETH" },
];

const age = (ms: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3_600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h` : `${Math.floor(s / 86_400)}d`;
};

/**
 * The terminal's coin list, every chain in one place: big coins first, then the newest. Clicking one switches the
 * terminal to it (same layout whichever chain it's on), so one terminal trades them all from the one Crux account.
 */
export function CoinRail({ current }: { current: string }) {
  const [chain, setChain] = useState<Chain>("all");
  const majors = useQuery({ queryKey: ["solana-majors"], queryFn: () => solanaCoins(SOLANA_MAJORS), refetchInterval: 60_000, staleTime: 30_000 });
  const sol = useQuery({ queryKey: ["solana-fresh"], queryFn: () => freshSolanaCoins(), refetchInterval: 15_000, staleTime: 5_000, enabled: chain !== "bnb" });
  const bnb = useQuery({ queryKey: ["bnb-fresh"], queryFn: () => freshBnbCoins(), refetchInterval: 30_000, staleTime: 10_000, enabled: chain !== "sol" });

  const big: Item[] = [
    ...(chain === "bnb" ? [] : (majors.data ?? []).map((c) => ({ key: `sol:${c.mint}`, href: `/sol/${c.mint}`, chain: "sol" as const, symbol: c.symbol, icon: c.icon, mcap: c.mcap, change: c.change24h }))),
    ...(chain === "sol" ? [] : BNB_MAJORS),
  ];
  const fresh: Item[] = [
    ...(chain === "bnb" ? [] : (sol.data ?? []).slice(0, 25).map((c) => ({ key: `sol:${c.mint}`, href: `/sol/${c.mint}`, chain: "sol" as const, symbol: c.symbol, icon: c.icon, mcap: c.mcap, createdAt: c.createdAt }))),
    ...(chain === "sol" ? [] : (bnb.data ?? []).slice(0, 25).map((c) => ({ key: `bnb:${c.address}`, href: `/bnb/${c.address}`, chain: "bnb" as const, symbol: c.symbol, icon: c.icon, mcap: c.mcap, createdAt: c.createdAt }))),
  ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const chips: [Chain, string][] = [
    ["all", "All"],
    ["sol", "Solana"],
    ["bnb", "BNB"],
  ];
  return (
    <nav aria-label="Coins" className="flex min-h-0 flex-col bg-void">
      <div className="flex gap-1 border-b border-line p-2">
        {chips.map(([c, label]) => (
          <button
            key={c}
            type="button"
            aria-pressed={chain === c}
            onClick={() => setChain(c)}
            className={`flex-1 rounded-[4px] px-2 py-1 text-[11.5px] transition-colors ${chain === c ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Group title="Big coins" items={big} current={current} />
        <Group title="Newest" items={fresh} current={current} empty="Loading the newest coins…" />
      </div>
    </nav>
  );
}

function Group({ title, items, current, empty }: { title: string; items: Item[]; current: string; empty?: string }) {
  return (
    <section>
      <h2 className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.14em] text-dim">{title}</h2>
      {items.length === 0 && empty && <p className="px-3 py-2 text-[11.5px] text-dim">{empty}</p>}
      <ul>
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
                <span className="font-mono text-[9px] uppercase text-dim">{c.chain === "sol" ? "SOL" : "BNB"}</span>
                <span className="w-12 text-right font-mono text-[11px]">
                  {c.change !== undefined ? (
                    <span className={c.change >= 0 ? "text-up" : "text-down"}>
                      {c.change >= 0 ? "+" : ""}
                      {c.change.toFixed(1)}%
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
    </section>
  );
}
