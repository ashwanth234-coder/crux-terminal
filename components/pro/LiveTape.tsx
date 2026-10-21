"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useConnection } from "wagmi";
import { useAuctionBids } from "@/hooks/useAuctionBids";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLaunchMarket } from "@/hooks/useLaunchMarket";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { fmtTokens } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { priceUsd, type AuctionV2 } from "@/lib/launchV2";

const PAGE = 25;
/** Testnet trades are often cents: keep USDC to its 6 decimals (at least 2). */
const usd = (units: bigint) => `$${Number(formatUnits(units, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ago(now: number | null, t: number) {
  if (now === null) return "…";
  const s = Math.max(0, now - t);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function Wallet({ address, me, label }: { address: Address; me: Address | undefined; label?: string }) {
  const mine = me !== undefined && me.toLowerCase() === address.toLowerCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      {mine && <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />}
      <span className={`font-mono ${mine ? "text-chrome" : "text-muted"}`}>{mine ? "You" : (label ?? short(address))}</span>
    </span>
  );
}

/** A trade larger than this share of the pool's liquidity (both sides, as the token bar shows it) is a whale. */
const WHALE_SHARE_BPS = 500;

const TAGS = {
  whale: { label: "Whale", title: `Over ${WHALE_SHARE_BPS / 100}% of the pool's liquidity, measured against today's reserves` },
  // Placeholder: no smart-money classifier exists yet, so nothing passes "smart" and the tag never renders.
  smart: { label: "Smart", title: "Smart wallet" },
} as const;

/** A quiet marker beside the wallet, in the same voice as the Intent tag. */
function WalletTag({ kind }: { kind: keyof typeof TAGS }) {
  return (
    <span title={TAGS[kind].title} className="inline-flex items-center gap-1 rounded-[3px] border border-line-2 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-chrome/80">
      <span className={`h-[5px] w-[5px] rounded-full ${kind === "whale" ? "bg-chrome" : "border border-muted"}`} aria-hidden="true" />
      {TAGS[kind].label}
    </span>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-normal text-dim";
const td = "px-3 py-1.5 text-[12px]";

/**
 * The tape: what actually happened, newest first. Bids come from the auction's BidPlaced events; after
 * graduation, trades are every swap on the locked Uniswap V2 pool (the solver's swaps are intent fills).
 */
export function LiveTape({
  factory,
  id,
  auction,
  graduated,
  live,
  symbol,
}: {
  factory: Address;
  id: string;
  auction: AuctionV2;
  graduated: boolean;
  live: boolean;
  symbol: string;
}) {
  const { address } = useConnection();
  const now = useNow();
  const [tab, setTab] = useState<"trades" | "bids">(graduated ? "trades" : "bids");
  const [shown, setShown] = useState(PAGE);
  const bids = useAuctionBids(factory, auction, BigInt(id), live);
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, graduated);
  const market = useLaunchMarket(auction.token, auction.pair);
  // Pool liquidity = 2 × the USDC side; a whale trade is more than WHALE_SHARE_BPS of it.
  const isWhale = (usdc: bigint) =>
    market.reserves !== null && market.reserves.usdc > BigInt(0) && usdc * BigInt(10_000) > market.reserves.usdc * BigInt(2 * WHALE_SHARE_BPS);
  const noLimitAbove = auction.floorPrice * BigInt(1_000_000);

  // Newest first; a wallet's second and later bids are top-ups (they also replace its limit).
  const bidRows = (() => {
    const seen = new Set<string>();
    const rows = (bids.data?.events ?? []).map((e) => {
      const key = e.account.toLowerCase();
      const topUp = seen.has(key);
      seen.add(key);
      return { ...e, topUp };
    });
    return rows.reverse();
  })();
  const tradeRows = swaps.data?.trades ?? [];
  const active = tab === "trades" ? swaps : bids;
  const total = tab === "trades" ? tradeRows.length : bidRows.length;
  const truncated = tab === "trades" ? swaps.data?.truncated : bids.data?.truncated;

  return (
    <div className="flex h-full min-h-[inherit] flex-col">
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <div role="tablist" aria-label="Tape" className="flex gap-1">
          {(graduated ? (["trades", "bids"] as const) : (["bids"] as const)).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setShown(PAGE);
              }}
              className={`rounded-[4px] px-3 py-1 text-[12px] transition-colors ${tab === t ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
            >
              {t === "trades" ? "Trades" : graduated ? "Auction bids" : "Bids"}{" "}
              <span className="font-mono text-dim">{t === "trades" ? tradeRows.length : bidRows.length}</span>
            </button>
          ))}
        </div>
        <span className="text-[11px] text-dim">{live || graduated ? "Updates live" : "Final"} · Base Sepolia</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="sticky top-0 bg-void">
            {tab === "trades" ? (
              <tr className="border-b border-line">
                <th className={th}>Time</th>
                <th className={th}>Type</th>
                <th className={`${th} text-right`}>USDC</th>
                <th className={`${th} text-right`}>{symbol}</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={th}>Wallet</th>
              </tr>
            ) : (
              <tr className="border-b border-line">
                <th className={th}>Time</th>
                <th className={th}>Type</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Wallet total</th>
                <th className={`${th} text-right`}>Limit</th>
                <th className={th}>Wallet</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-line">
            {tab === "trades"
              ? tradeRows.slice(0, shown).map((t) => (
                  <tr key={`${t.txHash}-${t.time}-${t.usdc}`} className="hover:bg-white/[0.02]">
                    <td className={`${td} font-mono text-dim`}>
                      <a href={`${TESTNET_EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-chrome">
                        {ago(now, t.time)}
                      </a>
                    </td>
                    <td className={td}>
                      <span className={t.side === "buy" ? "text-up" : "text-down"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                      {t.viaIntent && <span className="ml-1.5 rounded-[3px] border border-line-2 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">Intent</span>}
                    </td>
                    <td className={`${td} text-right font-mono text-chrome/90`}>{usd(t.usdc)}</td>
                    <td className={`${td} text-right font-mono text-chrome/90`}>{fmtTokens(t.tokens)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{fmtTokenPrice(t.price)}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-2">
                        <Wallet address={t.to} me={address} label={t.viaIntent ? "Crux solver" : undefined} />
                        {isWhale(t.usdc) && <WalletTag kind="whale" />}
                      </span>
                    </td>
                  </tr>
                ))
              : bidRows.slice(0, shown).map((b) => (
                  <tr key={`${b.txHash}-${b.account}-${b.totalQuote}`} className="hover:bg-white/[0.02]">
                    <td className={`${td} font-mono text-dim`}>
                      <a href={`${TESTNET_EXPLORER}/tx/${b.txHash}`} target="_blank" rel="noopener noreferrer" className="hover:text-chrome">
                        {ago(now, b.time)}
                      </a>
                    </td>
                    <td className={`${td} text-chrome/90`}>{b.topUp ? "Top-up" : "Bid"}</td>
                    <td className={`${td} text-right font-mono text-chrome/90`}>{usd(b.quoteAdded)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{usd(b.totalQuote)}</td>
                    <td className={`${td} text-right font-mono text-muted`}>{b.maxPrice >= noLimitAbove ? "Any" : `$${priceUsd(b.maxPrice)}`}</td>
                    <td className={td}>
                      <Wallet address={b.account} me={address} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {active.isPending && <p className="px-3 py-6 text-center text-[12px] text-dim">Reading from Base Sepolia…</p>}
        {active.isError && !active.data && <p className="px-3 py-6 text-center text-[12px] text-dim">Couldn&apos;t read the chain. Retrying…</p>}
        {active.data && total === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-dim">
            {tab === "trades" ? "No trades in the pool yet." : "No bids yet. Every bid in the window will show here."}
          </p>
        )}
        {total > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="w-full border-t border-line py-2 text-[12px] text-muted transition-colors hover:text-chrome"
          >
            Show more (<span className="font-mono">{total - shown}</span>)
          </button>
        )}
      </div>
      {truncated && <p className="px-1 pt-1.5 text-[11px] text-dim">Only the last six days are shown.</p>}
    </div>
  );
}
