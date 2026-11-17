"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fmtCompact, fmtPrice, SOLANA_MAJORS, solanaCoins } from "@/lib/solanaCoins";

/**
 * Discover's Majors tab: deep-liquidity coins for size traders (the right side of the "barbell"), live price, 24h move,
 * market cap and liquidity; each row opens the coin's page. Lower fee (0.15%) than fresh launches.
 */
export function MajorsTable() {
  const q = useQuery({ queryKey: ["solana-majors"], queryFn: () => solanaCoins(SOLANA_MAJORS), refetchInterval: 30_000, staleTime: 15_000 });
  const rows = q.data ?? [];
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
          {q.isLoading && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-dim">
                Loading prices…
              </td>
            </tr>
          )}
          {!q.isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-dim">
                Prices are busy right now. They&rsquo;ll be back in a moment.
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr key={c.mint} className="border-b border-line/60 last:border-0 hover:bg-tint/[0.03]">
              <td className="px-4 py-3">
                <Link href={`/sol/${c.mint}`} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
                  {c.icon ? <img src={c.icon} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-line" aria-hidden="true" />}
                  <span>
                    <span className="text-chrome">${c.symbol}</span> <span className="text-dim">{c.name}</span>
                  </span>
                  <span className="rounded border border-line px-1.5 py-px text-[9.5px] uppercase tracking-[0.1em] text-muted">Solana</span>
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
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-dim">Majors trade at a 0.15% fee. Base majors are on the Markets page.</p>
    </div>
  );
}
