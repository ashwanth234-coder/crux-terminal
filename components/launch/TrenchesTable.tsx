"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
 * Discover's Trenches tab: the newest Solana coins, refreshed every 10 s, with what tells a runner from a rug (age,
 * money in the pool, holders, the last five minutes' buys and sells, and the warning signs). The left side of the
 * "barbell": fast, small, risky; pair it with the creator-sell alert on the coin's page.
 */
export function TrenchesTable() {
  const q = useQuery({ queryKey: ["solana-fresh"], queryFn: () => freshSolanaCoins(), refetchInterval: 10_000, staleTime: 5_000 });
  const rows = q.data ?? [];
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-line">
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
            const w = warnings(c);
            return (
              <tr key={c.mint} className="border-b border-line/60 last:border-0 hover:bg-tint/[0.03]">
                <td className="px-4 py-2.5">
                  <Link href={`/sol/${c.mint}`} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
                    {c.icon ? <img src={c.icon} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-line" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="text-chrome">${c.symbol}</span> <span className="text-dim">{c.name.slice(0, 22)}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{age(c.createdAt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-chrome">{c.mcap !== undefined ? fmtCompact(c.mcap) : "…"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{c.liquidity !== undefined ? fmtCompact(c.liquidity) : "…"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted">{c.holders ?? "…"}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className="text-up">{c.buys5m ?? 0}</span>
                  <span className="text-dim"> / </span>
                  <span className="text-down">{c.sells5m ?? 0}</span>
                </td>
                <td className="px-4 py-2.5 text-[11.5px]">{w.length ? <span className="text-signal">{w.join(" · ")}</span> : <span className="text-up">No warning signs</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-dim">
        Fresh coins are risky: most go to zero. On a coin&rsquo;s page, turn on &ldquo;Notify me when the creator sells&rdquo;.
      </p>
    </div>
  );
}
