"use client";

import { useState, type ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { TokenAvatar } from "@/components/pro/TokenAvatar";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { useLedger } from "@/hooks/useLedger";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { compactZeros } from "@/lib/priceText";
import { FACTORY_V9, type PhaseV9 } from "@/lib/v9";
import type { AuctionV2 } from "@/lib/launchV2";

const PRICE_TEXT = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const PHASE: Record<PhaseV9, { label: string; tone: string; dot: string }> = {
  opening: { label: "Fair opening", tone: "border-signal/60 text-signal", dot: "bg-signal" },
  curve: { label: "On its curve", tone: "border-up/50 text-up", dot: "bg-up" },
  graduating: { label: "Graduating", tone: "border-signal/60 text-signal", dot: "bg-signal" },
  graduated: { label: "On Uniswap", tone: "border-up/50 text-up", dot: "bg-up" },
};

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" title={hint}>
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-dim">{label}</span>
      <span className="font-mono text-[13px] text-chrome">{children}</span>
    </span>
  );
}

const ageText = (s: number) => (s < 3_600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3_600)}h ${Math.floor((s % 3_600) / 60)}m` : `${Math.floor(s / 86_400)}d`);

/**
 * The terminal's token bar for a launch: who it is, where it trades (fair opening, curve, Uniswap), its price and market
 * cap, liquidity, holders, the creator's vesting, and its contract address to copy.
 */
export function V9TokenBar({
  id,
  auction,
  symbol,
  name,
  phase,
  price,
  realUsdc,
  threshold,
  poolUsdc,
  vestingSeconds,
  openingLeft,
  now,
}: {
  id: bigint;
  auction: AuctionV2;
  symbol: string;
  name: string | null;
  phase: PhaseV9;
  price: number;
  realUsdc: bigint;
  threshold: bigint;
  /** The pool's USDC side once graduated (liquidity is twice it). */
  poolUsdc: bigint | null;
  vestingSeconds: number;
  openingLeft: number;
  now: number;
}) {
  const meta = useTokenMeta(auction.token);
  const { holders } = useLedger(FACTORY_V9, id.toString(), auction);
  const [copied, setCopied] = useState(false);
  const supply = Number(formatUnits(auction.totalSupply, 18));
  const mcap = price * supply;
  const p = PHASE[phase];
  const graduated = phase === "graduated";
  const progress = graduated ? 100 : threshold > BigInt(0) ? Math.min(100, Number((realUsdc * BigInt(10_000)) / threshold) / 100) : 0;
  const copy = (a: Address) =>
    void navigator.clipboard?.writeText(a).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    });

  return (
    <div className="border-b border-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenAvatar token={auction.token} image={meta.image} symbol={symbol} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[20px] leading-none text-bright">${symbol}</h1>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${p.tone}`}>
                <span className={`h-[5px] w-[5px] rounded-full ${p.dot}`} aria-hidden="true" />
                {p.label}
                {phase === "opening" && ` · ${openingLeft}s`}
              </span>
              {/* The launch's safety terms, as badges a buyer sees first. */}
              <span
                title={vestingSeconds === 0 ? "The creator unlocked their 2.4% at launch: they can sell straight away" : "The creator's 2.4% of supply unlocks gradually over this period"}
                className={`inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${vestingSeconds === 0 ? "border-down/60 text-down" : "border-up/50 text-up"}`}
              >
                {vestingSeconds === 0 ? "Creator unlocked" : `Creator locked ${Math.round(vestingSeconds / 86_400)}d`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
              {name && <span className="truncate">{name}</span>}
              <button type="button" onClick={() => copy(auction.token)} className="font-mono text-dim hover:text-chrome" title={`Copy ${auction.token}`}>
                {copied ? "Copied" : `${auction.token.slice(0, 6)}…${auction.token.slice(-4)}`}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-dim">Price</span>
          <span className="font-mono text-[22px] leading-none text-bright">{price > 0 ? `$${compactZeros(PRICE_TEXT.format(price))}` : "…"}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat label="MCap" hint="Price × total supply">
            {mcap > 0 ? usdCompact.format(mcap) : "…"}
          </Stat>
          {graduated ? (
            <Stat label="Liq" hint="Both sides of the Uniswap pool, in USDC">
              {poolUsdc !== null ? usdCompact.format((Number(poolUsdc) / 1e6) * 2) : "…"}
            </Stat>
          ) : (
            <Stat label="Raised" hint="USDC on the curve; it graduates to Uniswap at the target">
              ${(Number(realUsdc) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} / ${(Number(threshold) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Stat>
          )}
          <Stat label="Holders" hint="Wallets holding it (pools and Crux contracts left out)">
            {holders ? holders.length : "…"}
          </Stat>
          {graduated && (
            <Stat label="LP burned" hint="At graduation the pool's liquidity tokens go to 0x…dEaD">
              100%
            </Stat>
          )}
          <Stat label="Creator" hint="The creator's 2.4% of supply">
            {vestingSeconds === 0 ? "unlocked" : `vests ${Math.round(vestingSeconds / 86_400)}d`}
          </Stat>
          {auction.settledAt > 0 && <Stat label="Age">{ageText(Math.max(0, now - auction.settledAt))}</Stat>}
        </div>

        <div className="flex items-center gap-1.5 sm:ml-auto">
          <a
            href={`https://x.com/search?q=${encodeURIComponent(`$${symbol} OR ${auction.token}`)}&f=live`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-[4px] border border-line-2 px-2.5 text-[11.5px] uppercase tracking-[0.12em] text-muted hover:border-chrome/50 hover:text-chrome"
          >
            Search X
          </a>
          <a
            href={`${TESTNET_EXPLORER}/token/${auction.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-[4px] border border-line-2 px-2.5 text-[11.5px] uppercase tracking-[0.12em] text-muted hover:border-chrome/50 hover:text-chrome"
          >
            Explorer
          </a>
        </div>
      </div>
      {!graduated && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-line" aria-label={`${progress.toFixed(0)}% of the way to graduation`}>
          <div className="h-full bg-up transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {phase === "opening" && (
        <p className="mt-3 rounded-[4px] border border-signal/40 bg-signal/[0.06] px-3 py-2 text-[12.5px] text-chrome">
          <span className="font-mono text-signal">Fair opening · {openingLeft}s left.</span> Everyone who buys now, the creator included, pays the
          same price, and the tokens are shared in proportion to what each put in, so bots can&apos;t snipe the first block. Trading on the curve
          starts when the timer ends.
        </p>
      )}
    </div>
  );
}
