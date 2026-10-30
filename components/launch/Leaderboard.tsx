"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { fmtTokenPrice } from "@/lib/launchTrade";
import type { CoinRow, TraderRank } from "@/lib/leaderboard";

type Boards = { minLiquidityUsd: number; counted: number; coins: CoinRow[]; traders: TraderRank[] };
type Tab = "coins" | "traders" | "rwa";

const TABS: { id: Tab; label: string }[] = [
  { id: "coins", label: "Memecoins" },
  { id: "traders", label: "Smart Money" },
  { id: "rwa", label: "RWA" },
];

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const money = (v: number) => (Math.abs(v) < 1_000 ? `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}` : compact.format(v));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const th = "py-2.5 pr-4 text-left font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-dim";
const td = "py-3 pr-4 text-[13px]";

/**
 * Discover's leaderboards: the top Crux memecoins by market cap and the wallets with the best PnL across them, both
 * counting only markets above the liquidity floor (from /api/leaderboard). RWA markets are planned, not live.
 */
export function Leaderboard() {
  const [tab, setTab] = useState<Tab>("coins");
  const q = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("leaderboard unavailable");
      return (await res.json()) as Boards;
    },
    refetchInterval: 60_000,
  });
  const floor = q.data?.minLiquidityUsd;

  return (
    <section aria-labelledby="boards-title" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
        <div>
          <h2 id="boards-title" className="font-display-md text-[22px] text-chrome">
            Leaderboards
          </h2>
          <p className="mt-1 text-[12.5px] text-dim">
            Top 10 · markets with at least {floor !== undefined ? money(floor) : "…"} of liquidity count
            {floor !== undefined && floor < 1_000 ? " (testnet floor; $1,000 on mainnet)" : ""}, so dust pools and dust trades can&apos;t rank.
          </p>
        </div>
        <div role="tablist" aria-label="Leaderboard" className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`h-8 rounded-[4px] border px-3 text-[12.5px] transition-colors ${tab === t.id ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
            >
              {t.label}
              {t.id === "rwa" && <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">Planned</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        {tab === "rwa" ? (
          <p className="py-8 text-[13.5px] text-muted">
            Real-world-asset markets (tokenised yield paired with launch liquidity) are planned, not live. Nothing ranks here until they are.
          </p>
        ) : q.isLoading ? (
          <p className="py-8 text-[13px] text-dim">Reading the markets…</p>
        ) : q.isError || !q.data ? (
          <p className="py-8 text-[13px] text-dim">The leaderboards couldn&apos;t be read just now. They retry every minute.</p>
        ) : tab === "coins" ? (
          q.data.coins.length === 0 ? (
            <p className="py-8 text-[13px] text-dim">No market has reached the liquidity floor yet.</p>
          ) : (
            <table className="w-full min-w-[640px]">
              <caption className="sr-only">Top Crux memecoins by market cap</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={th}>#</th>
                  <th scope="col" className={th}>Token</th>
                  <th scope="col" className={`${th} text-right`}>Market cap</th>
                  <th scope="col" className={`${th} text-right`}>Price</th>
                  <th scope="col" className={`${th} text-right`}>Since launch</th>
                  <th scope="col" className={`${th} text-right`}>Vol 24h</th>
                  <th scope="col" className={`${th} text-right`}>Liquidity</th>
                </tr>
              </thead>
              <tbody>
                {q.data.coins.map((c, i) => (
                  <tr key={c.token} className="border-b border-line/70 hover:bg-tint/[0.02]">
                    <td className={`${td} font-mono text-dim`}>{i + 1}</td>
                    <td className={td}>
                      <Link href={c.href} className="font-medium text-chrome hover:underline">
                        ${c.symbol}
                      </Link>{" "}
                      <span className="text-[12px] text-dim">{c.name}</span>
                    </td>
                    <td className={`${td} text-right font-mono text-chrome`}>{money(c.marketCapUsd)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{fmtTokenPrice(c.priceUsd)}</td>
                    <SinceLaunch ratio={c.sinceLaunch} />
                    <td className={`${td} text-right font-mono text-muted`}>{money(c.volume24hUsd)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{money(c.liquidityUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : q.data.traders.length === 0 ? (
          <p className="py-8 text-[13px] text-dim">No trades in counted markets yet.</p>
        ) : (
          <table className="w-full min-w-[640px]">
            <caption className="sr-only">Wallets with the best PnL across counted Crux markets</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>#</th>
                <th scope="col" className={th}>Wallet</th>
                <th scope="col" className={`${th} text-right`}>PnL</th>
                <th scope="col" className={`${th} text-right`}>Realized</th>
                <th scope="col" className={`${th} text-right`}>Bought</th>
                <th scope="col" className={`${th} text-right`}>Trades</th>
                <th scope="col" className={th}>Markets</th>
              </tr>
            </thead>
            <tbody>
              {q.data.traders.map((t, i) => (
                <tr key={t.address} className="border-b border-line/70 hover:bg-tint/[0.02]">
                  <td className={`${td} font-mono text-dim`}>{i + 1}</td>
                  <td className={td}>
                    <a href={`${TESTNET_EXPLORER}/address/${t.address}`} target="_blank" rel="noopener noreferrer" className="font-mono text-chrome hover:underline">
                      {short(t.address)} ↗
                    </a>
                  </td>
                  <td className={`${td} text-right font-mono ${t.pnlUsd >= 0 ? "text-up" : "text-down"}`}>{money(t.pnlUsd)}</td>
                  <td className={`${td} text-right font-mono text-muted`}>{money(t.realizedUsd)}</td>
                  <td className={`${td} text-right font-mono text-muted`}>{money(t.boughtUsd)}</td>
                  <td className={`${td} text-right font-mono text-muted`}>{t.trades}</td>
                  <td className={`${td} text-[12px] text-muted`}>{t.markets.slice(0, 3).map((m) => `$${m}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Price since the auction's clearing price; a move under 0.05% reads as flat. */
function SinceLaunch({ ratio }: { ratio: number | null }) {
  const pct = ratio === null ? null : (ratio - 1) * 100;
  const flat = pct !== null && Math.abs(pct) < 0.05;
  return (
    <td className={`${td} text-right font-mono ${pct === null || flat ? "text-dim" : pct > 0 ? "text-up" : "text-down"}`}>
      {pct === null ? "—" : flat ? "0.0%" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
    </td>
  );
}
