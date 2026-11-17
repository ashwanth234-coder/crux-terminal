"use client";

import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/launch/LaunchView";
import { SolanaChart } from "@/components/solana/SolanaChart";
import { SolanaTradePanel } from "@/components/solana/SolanaTrade";
import { fmtCompact, fmtPrice, solanaCoin } from "@/lib/solanaCoins";

/** /sol/[mint]: a Solana coin, traded from the one Crux account (plan phase D). Chart left, Buy/Sell right. */
export function SolanaCoinPage({ mint }: { mint: string }) {
  const coin = useQuery({ queryKey: ["solana-coin", mint], queryFn: () => solanaCoin(mint), refetchInterval: 30_000 });
  const c = coin.data;
  const change = c?.change24h;
  return (
    <Shell mode="live">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- token icons come from any host */}
            {c?.icon ? <img src={c.icon} alt="" className="h-10 w-10 rounded-full" /> : <span className="h-10 w-10 rounded-full bg-line" aria-hidden="true" />}
            <div>
              <h1 className="text-[20px] text-chrome">
                ${c?.symbol || "…"} <span className="text-[13px] text-dim">{c?.name}</span>
              </h1>
              <span className="rounded border border-line px-1.5 py-px text-[9.5px] uppercase tracking-[0.1em] text-muted">Solana</span>
            </div>
          </div>
          <div className="font-mono text-[22px] text-chrome">{c?.price !== undefined ? fmtPrice(c.price) : "…"}</div>
          {change !== undefined && (
            <div className={`font-mono text-[13px] ${change >= 0 ? "text-up" : "text-down"}`}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}% 24h
            </div>
          )}
          <dl className="flex gap-5 text-[12px]">
            {c?.mcap !== undefined && (
              <div>
                <dt className="text-dim">Market cap</dt>
                <dd className="font-mono text-chrome">{fmtCompact(c.mcap)}</dd>
              </div>
            )}
            {c?.liquidity !== undefined && (
              <div>
                <dt className="text-dim">Liquidity</dt>
                <dd className="font-mono text-chrome">{fmtCompact(c.liquidity)}</dd>
              </div>
            )}
          </dl>
        </header>
        {coin.data === null && <p className="text-[13px] text-down">This coin isn&rsquo;t listed on Solana&rsquo;s exchanges, so it can&rsquo;t be traded here.</p>}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <SolanaChart mint={mint} />
          <SolanaTradePanel mint={mint} />
        </div>
      </div>
    </Shell>
  );
}
