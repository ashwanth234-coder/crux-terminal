"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { bnbMajors } from "@/lib/coinMarket";
import { fmtCompact, fmtPrice, SOLANA_MAJORS_LISTED, solanaCoins } from "@/lib/solanaCoins";

type Row = { key: string; href: string; chain: string; symbol: string; name: string; icon?: string; price?: number; change24h?: number; mcap?: number; liquidity?: number };

/** Discover's Majors tab: the big Solana and BNB Chain coins, live price, 24h move, market cap and liquidity (every 30 s). */
export function MajorsTable() {
  const sol = useQuery({ queryKey: ["solana-majors"], queryFn: () => solanaCoins(SOLANA_MAJORS_LISTED), refetchInterval: 30_000, staleTime: 15_000 });
  const bnb = useQuery({ queryKey: ["bnb-majors"], queryFn: bnbMajors, refetchInterval: 30_000, staleTime: 15_000 });
  const rows: Row[] = [
    ...(sol.data ?? []).map((c) => ({ ...c, key: `sol:${c.mint}`, href: `/sol/${c.mint}`, chain: "Solana" })),
    ...(bnb.data ?? []).map((c) => ({ ...c, key: `bnb:${c.address}`, href: `/bnb/${c.address}`, chain: "BNB" })),
  ].sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
  const loading = sol.isLoading && bnb.isLoading;
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-dim">
            <th className="px-4 py-3 font-normal">Coin</th>
            <th className="px-4 py-3 text-right font-normal">Price</th>
            <th className="px-4 py-3 text-right font-normal">24h</th>
            <th className="px-4 py-3 text-right font-normal">Market cap</th>
            <th className="px-4 py-3 text-right font-normal">Liquidity</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-dim">
                Loading prices…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-dim">
                Prices are busy. Back in a moment.
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr key={c.key} className="border-b border-line/60 last:border-0 hover:bg-tint/[0.03]">
              <td className="px-4 py-3">
                <Link href={c.href} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
                  {c.icon ? <img src={c.icon} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-line" aria-hidden="true" />}
                  <span>
                    <span className="text-chrome">${c.symbol}</span> <span className="text-dim">{c.name}</span>
                  </span>
                  <span className="rounded border border-line px-1.5 py-px text-[9.5px] uppercase tracking-[0.1em] text-muted">{c.chain}</span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-mono text-chrome">{c.price !== undefined ? fmtPrice(c.price) : "…"}</td>
              <td className={`px-4 py-3 text-right font-mono ${(c.change24h ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                {c.change24h !== undefined ? `${c.change24h >= 0 ? "+" : ""}${c.change24h.toFixed(2)}%` : "…"}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">{c.mcap !== undefined ? fmtCompact(c.mcap) : "…"}</td>
              <td className="px-4 py-3 text-right font-mono text-muted">{c.liquidity !== undefined ? fmtCompact(c.liquidity) : "…"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
