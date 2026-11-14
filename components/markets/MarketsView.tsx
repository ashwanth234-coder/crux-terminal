"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { Shell } from "@/components/launch/LaunchView";
import { KineticLoader } from "@/components/ui/Modal";
import { TESTNET_USDC } from "@/lib/intents";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { CURATED_MARKETS, fetchMarkets, WETH, type TrendingRow } from "@/lib/markets";
import { NETWORK_NAME } from "@/lib/network";

type Tab = "launches" | "markets" | "trending";
const TABS: { id: Tab; label: string; note: string }[] = [
  { id: "launches", label: "Crux launches", note: "Fair-launched on Crux: one clearing price, LP burned." },
  { id: "markets", label: "Markets", note: "Established tokens your Crux account trades through the Crux solver." },
  { id: "trending", label: "Trending", note: `The busiest ${NETWORK_NAME} pools in the last hour.` },
];

type FeedLaunch = { key: string; version: number; auctionId: number; token: Address; name: string; symbol: string; phase: string; clearingPriceUsd: number | null };

const QUOTES = new Set([TESTNET_USDC.toLowerCase(), WETH.toLowerCase()]);
const fmtUsd = (v: number) => (v >= 1 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${v.toPrecision(3)}`);
const th = "px-3 py-2.5 text-left font-mono text-[10.5px] font-normal uppercase tracking-[0.14em] text-dim";
const td = "px-3 py-3 align-middle";

/** /markets: everything the terminal can trade, in three lists, so a trader finds a token without knowing its address. */
export function MarketsView() {
  const [tab, setTab] = useState<Tab>("markets");
  const markets = useQuery({ queryKey: ["crux-markets"], queryFn: fetchMarkets, staleTime: 30_000, refetchInterval: 30_000 });
  const launches = useQuery({
    queryKey: ["feed-launches"],
    staleTime: 60_000,
    queryFn: async () => ((await (await fetch("/api/launches")).json()) as { launches?: FeedLaunch[] }).launches ?? [],
    enabled: tab === "launches",
  });

  return (
    <Shell mode="live">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] text-chrome">Markets</h1>
        <p className="max-w-[36rem] text-[14px] leading-relaxed text-muted">Crux launches, the established tokens your Crux account can trade, and what is moving on {NETWORK_NAME} right now. Testnet tokens only.</p>
      </div>

      <div role="tablist" aria-label="Lists" className="mt-8 flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors ${tab === t.id ? "border-chrome text-chrome" : "border-transparent text-muted hover:text-chrome"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-dim">{TABS.find((t) => t.id === tab)!.note}</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        {tab === "markets" && (
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="border-b border-line">
              <tr>
                <th className={th}>Token</th>
                <th className={th}>Price</th>
                <th className={th}>Route</th>
                <th className={th}>From your Crux account</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {CURATED_MARKETS.map((m) => {
                const live = markets.data?.curated.find((c) => c.token.toLowerCase() === m.token.toLowerCase());
                const per = live ? Number(live.tokensPerUsdc) / 10 ** m.decimals : 0;
                const status = !live ? null : live.buyable && live.sellable ? "on" : "pending";
                return (
                  <tr key={m.token} className="border-b border-line last:border-0">
                    <td className={td}>
                      <span className="text-chrome">${m.symbol}</span> <span className="text-dim">{m.name}</span>
                      {m.note && <span className="ml-2 rounded-[3px] border border-dashed border-line-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{m.note}</span>}
                    </td>
                    <td className={`${td} font-mono tabular-nums text-chrome`}>{per > 0 ? fmtUsd(1 / per) : markets.isLoading ? "…" : "—"}</td>
                    <td className={`${td} text-muted`}>Uniswap V3 · {m.tokens.length - 1} hop{m.tokens.length > 2 ? "s" : ""}</td>
                    <td className={td}>
                      {status === "on" ? (
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-up">Buy and sell, no gas</span>
                      ) : status === "pending" ? (
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-dim">Registration pending</span>
                      ) : (
                        <span className="text-dim">…</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      <Link href={`/terminal/${m.token}`} className="text-chrome underline decoration-line-2 underline-offset-2 hover:decoration-chrome">
                        Trade
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "trending" &&
          (markets.isLoading ? (
            <Loading text="Reading the last hour of swaps…" />
          ) : !markets.data?.trending || markets.data.trending.rows.length === 0 ? (
            <p className="px-4 py-8 text-[13px] text-muted">The relay hasn&apos;t counted any swaps yet. It reads the last hour as it starts; check back in a minute.</p>
          ) : (
            <table className="w-full min-w-[620px] text-[13px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Pair</th>
                  <th className={th}>Venue</th>
                  <th className={`${th} text-right`}>Swaps, last hour</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {markets.data.trending.rows.map((r) => (
                  <TrendingLine key={r.pool} r={r} />
                ))}
              </tbody>
            </table>
          ))}

        {tab === "launches" &&
          (launches.isLoading ? (
            <Loading text="Reading Crux launches…" />
          ) : (
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Token</th>
                  <th className={th}>Phase</th>
                  <th className={th}>Clearing price</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {(launches.data ?? []).slice(0, 30).map((l) => (
                  <tr key={l.key} className="border-b border-line last:border-0">
                    <td className={td}>
                      <span className="text-chrome">${l.symbol}</span> <span className="text-dim">{l.name}</span>
                    </td>
                    <td className={`${td} capitalize text-muted`}>{l.phase}</td>
                    <td className={`${td} font-mono tabular-nums text-muted`}>{l.clearingPriceUsd ? fmtTokenPrice(l.clearingPriceUsd) : "—"}</td>
                    <td className={`${td} text-right`}>
                      <Link href={`/launch/v${l.version}/${l.auctionId}`} className="text-chrome underline decoration-line-2 underline-offset-2 hover:decoration-chrome">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
      {tab === "trending" && markets.data?.trending && (
        <p className="mt-3 font-mono text-[11px] text-dim">
          Counted to block {Number(markets.data.trending.head).toLocaleString("en-US")} · {Number(markets.data.trending.windowBlocks).toLocaleString("en-US")} blocks of 200 ms. Only pools on the official Uniswap factories open in the terminal.
        </p>
      )}
    </Shell>
  );
}

function TrendingLine({ r }: { r: TrendingRow }) {
  // The token being traded is the side that isn't USDC or WETH (or WETH itself against USDC).
  const base = QUOTES.has(r.token0.address.toLowerCase()) && !QUOTES.has(r.token1.address.toLowerCase()) ? r.token1 : r.token0;
  const quote = base === r.token0 ? r.token1 : r.token0;
  return (
    <tr className="border-b border-line last:border-0">
      <td className={td}>
        <span className="text-chrome">{base.symbol}</span> <span className="text-dim">/ {quote.symbol}</span>
      </td>
      <td className={`${td} text-muted`}>
        {r.official ? `Uniswap ${r.dex.toUpperCase()}` : "Unofficial DEX"}
        {r.dex === "v3" ? ` · ${r.fee / 10_000}%` : ""}
      </td>
      <td className={`${td} text-right font-mono tabular-nums text-chrome`}>{r.swaps}</td>
      <td className={`${td} text-right`}>
        {r.official ? (
          <Link href={`/terminal/${getAddress(base.address)}`} className="text-chrome underline decoration-line-2 underline-offset-2 hover:decoration-chrome">
            Open
          </Link>
        ) : (
          <span className="text-[12px] text-dim" title="Crux only routes through official Uniswap pools.">
            Not tradable here
          </span>
        )}
      </td>
    </tr>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-3 px-4 py-8 text-[13px] text-muted">
      <KineticLoader className="text-chrome" /> {text}
    </p>
  );
}
