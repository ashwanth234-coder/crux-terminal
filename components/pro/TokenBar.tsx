"use client";

import { useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLaunchMarket } from "@/hooks/useLaunchMarket";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { fmtUsdc, formatRemaining } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, marketCapUsd, priceUsd, type AuctionV2, type BatchVersion, type PhaseV2 } from "@/lib/launchV2";
import { priceChange, usdAmount } from "@/lib/orderflow";
import { SITE_URL } from "@/lib/site";

export type PhaseStatus = { label: string; tone: string; dot: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const FRAMES = [
  { label: "5M", seconds: 300 },
  { label: "1H", seconds: 3_600 },
  { label: "4H", seconds: 14_400 },
  { label: "1D", seconds: 86_400 },
] as const;

/** Price change over 5M / 1H / 4H / 1D, from executed pool trades (see lib/orderflow priceChange). */
function Changes({ changes }: { changes: { label: string; pct: number | null }[] }) {
  return (
    <ul aria-label="Price change" className="flex items-center gap-1.5" title="Last trade versus the last trade before each window (the clearing price if none)">
      {changes.map((c) => {
        const tone = c.pct === null || Math.abs(c.pct) < 0.005 ? "text-muted" : c.pct > 0 ? "text-up" : "text-down";
        return (
          <li key={c.label} className="flex items-baseline gap-1.5 rounded-[3px] border border-line px-1.5 py-1 font-mono text-[10.5px] leading-none">
            <span className="text-dim">{c.label}</span>
            <span className={tone}>{c.pct === null ? "—" : `${c.pct > 0 ? "+" : ""}${c.pct.toFixed(Math.abs(c.pct) >= 100 ? 0 : 2)}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Metric({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-[11px] text-dim">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[13.5px] text-chrome">{children}</p>
    </div>
  );
}

function IconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const cls =
    "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 text-muted transition-colors hover:border-chrome/60 hover:text-chrome";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      {children}
    </button>
  );
}

/**
 * The terminal's header strip: ticker, phase, the live price (projected clearing price during the auction,
 * the locked pool's mid price after graduation), market cap, the countdown, and the degen essentials:
 * copy the contract address in one tap and share the launch on X.
 */
export function TokenBar({
  auction,
  symbol,
  name,
  status,
  phase,
  indicativePrice,
  version,
  id,
}: {
  auction: AuctionV2;
  symbol: string | null;
  name: string | null;
  status: PhaseStatus;
  phase: PhaseV2;
  indicativePrice: bigint | null;
  version: BatchVersion;
  id: string;
}) {
  const now = useNow();
  const market = useLaunchMarket(auction.token, auction.pair);
  const [copied, setCopied] = useState(false);
  const ticker = symbol ? `$${symbol}` : "Token";
  const graduated = phase === "graduated";
  // Same query (and cache) as the tape's trades: no extra reads for the 24h figure.
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, graduated);
  const volume24h =
    swaps.data && now !== null ? swaps.data.trades.filter((t) => t.time >= now - 86_400).reduce((sum, t) => sum + t.usdc, BigInt(0)) : null;
  const openPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const changes =
    graduated && swaps.data && now !== null
      ? FRAMES.map((f) => ({ label: f.label, pct: priceChange(swaps.data.trades, now, f.seconds, openPrice) }))
      : null;

  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(auction.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address stays visible and selectable.
    }
  };

  const link = `${SITE_URL}/launch/v${version}/${id}`;
  const shareText = graduated ? `Trading ${ticker} via CRUX intent routing` : `Auction live for ${ticker} on CRUX`;
  const shareHref = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`;

  // Price: after graduation the pool's mid price; before, the contract's projected clearing price.
  const price = graduated ? (market.price !== null ? fmtTokenPrice(market.price) : "…") : indicativePrice !== null ? `$${priceUsd(indicativePrice)}` : "—";
  const mcap = graduated
    ? market.price !== null
      ? usdCompact.format(market.price * (Number(auction.totalSupply) / 1e18))
      : "…"
    : indicativePrice !== null && phase !== "cancelled"
      ? marketCapUsd(indicativePrice, auction.totalSupply)
      : "—";
  const opensIn = now === null ? null : auction.startTime - now;
  const closesIn = now === null ? null : auction.startTime + auction.batchWindow - now;

  return (
    <div className="border-b border-line bg-void">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="font-display text-[22px] leading-none text-bright [font-stretch:108%]">
            {ticker}
            {name && <span className="ml-2 text-[15px] text-steel">{name}</span>}
          </h1>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${status.tone}`}>
            <span className={`h-[5px] w-[5px] rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
        </div>

        {/* Live numbers */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:items-center sm:gap-8">
          <Metric label={graduated ? "Pool price" : "Projected clearing"} hint={graduated ? "Mid price of the locked Uniswap V2 pool" : "From the contract's own clearing search"}>
            {price}
          </Metric>
          <Metric label="Market cap">{mcap}</Metric>
          {graduated && (
            <Metric label="24H volume" hint="USDC traded through the locked pool in the last 24 hours, intent fills included">
              {volume24h !== null ? usdAmount(volume24h) : swaps.isError ? "—" : "…"}
            </Metric>
          )}
          {graduated ? (
            <Metric label="Pool liquidity" hint="Both sides of the locked pool, in USDC">
              {market.reserves ? usdCompact.format((Number(market.reserves.usdc) / 1e6) * 2) : "…"}
            </Metric>
          ) : (
            <Metric label="Bids / target">
              ${fmtUsdc(auction.totalDeposits)} / ${fmtUsdc(auction.graduationTarget)}
            </Metric>
          )}
          {phase === "scheduled" && opensIn !== null && <Metric label="Opens in">{formatRemaining(opensIn)}</Metric>}
          {phase === "open" && closesIn !== null && <Metric label="Window closes">{formatRemaining(closesIn)}</Metric>}
        </div>
        {changes && <Changes changes={changes} />}

        {/* Contract + share */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <a
            href={`${TESTNET_EXPLORER}/token/${auction.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[4px] border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted transition-colors hover:text-chrome"
            title="Contract on Basescan"
          >
            CA {short(auction.token)}
          </a>
          <IconButton label={copied ? "Copied" : "Copy contract address"} onClick={() => void copyCa()}>
            {copied ? (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-signal" aria-hidden="true">
                <path d="m3.5 8.2 2.8 2.8 6.2-6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            )}
          </IconButton>
          <IconButton label="Share on X" href={shareHref}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
}
