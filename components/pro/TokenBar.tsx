"use client";

import { useState, type ReactNode } from "react";
import { formatUnits, parseAbi, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";
import { TokenAvatar } from "@/components/pro/TokenAvatar";
import { TokenInfo } from "@/components/pro/TokenInfo";
import { VestingBadge } from "@/components/ui/VestingBadge";
import { AntiSniperBadge } from "@/components/ui/AntiSniperBadge";
import { useAntiSniperSeconds } from "@/hooks/useAntiSniper";
import { useCreatorVestingDays } from "@/hooks/useCreatorVesting";
import { batchFactory } from "@/lib/intents";
import { useNow } from "@/hooks/useLaunchAuction";
import { useLaunchMarket } from "@/hooks/useLaunchMarket";
import { useLedger } from "@/hooks/useLedger";
import { isSystem } from "@/lib/holders";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import { useTokenMeta } from "@/hooks/useTokenMeta";
import { TESTNET } from "@/lib/chains";
import { formatRemaining } from "@/lib/launch";
import { fmtTokenPrice } from "@/lib/launchTrade";
import { PRICE_DECIMALS, fmtUsdcExact, graduationNeeds, marketCapUsd, priceUsd, type AuctionV2, type BatchVersion, type PhaseV2 } from "@/lib/launchV2";
import { priceChange, usdAmount } from "@/lib/orderflow";
import { SITE_URL } from "@/lib/site";
import { launchKey, useWatchlist } from "@/lib/watchlist";
import type { Key } from "@/lib/i18n";
import { useT } from "@/providers/I18nProvider";

/** A phase label ("Graduated", "Live"…) in the chosen language; one without a translation stays as it is. */
function phaseLabel(t: ReturnType<typeof useT>, label: string) {
  const key = `phase.${label}` as Key;
  const out = t(key);
  return out === key ? label : out;
}

export type PhaseStatus = { label: string; tone: string; dot: string };

const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
const lpAbi = parseAbi(["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const usdSmall = (v: number) => (v < 1_000 ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : usdCompact.format(v));
const FRAMES = [
  { label: "5M", seconds: 300 },
  { label: "1H", seconds: 3_600 },
  { label: "4H", seconds: 14_400 },
] as const;

function pctText(p: number) {
  return `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) >= 100 ? 0 : 2)}%`;
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" title={hint}>
      <span className="text-[10.5px] uppercase tracking-[0.14em] text-dim">{label}</span>
      <span className="font-mono text-[13px] text-chrome">{children}</span>
    </span>
  );
}

function IconButton({ label, onClick, href, pressed, children }: { label: string; onClick?: () => void; href?: string; pressed?: boolean; children: ReactNode }) {
  const cls = `grid h-8 w-8 shrink-0 place-items-center rounded-[4px] border transition-colors ${
    pressed ? "border-signal/60 text-signal" : "border-line-2 text-muted hover:border-chrome/50 hover:text-chrome"
  }`;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed} title={label} className={cls}>
      {children}
    </button>
  );
}

const Icon = {
  copy: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-signal" aria-hidden="true">
      <path d="m3.5 8.2 2.8 2.8 6.2-6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  star: (filled: boolean) => (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 7.2v3.6M8 5.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
    </svg>
  ),
  farcaster: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M3.2 2.5h9.6v1.7l.9 1v8.3h-2.6V8.6a3.1 3.1 0 0 0-6.2 0v4.9H2.3V5.2l.9-1V2.5Z" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.6 3.8 2.6 6.2S9.8 12.5 8 14.2C6.2 12.5 5.4 10.4 5.4 8S6.2 3.5 8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M8 2v8M4.8 5 8 1.8 11.2 5M3 9v4.2h10V9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * The terminal's header, as dense as a pro DEX terminal but every number real: identity (logo, ticker, chain,
 * status, one-tap contract copy), price with its 24h change, and the MCAP · LIQ · VOL 24H · LP BURNED strip.
 * Actions: watchlist, token info, the creator's socials, share.
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
  const t = useT();
  const now = useNow();
  const market = useLaunchMarket(auction.token, auction.pair);
  const meta = useTokenMeta(auction.token);
  const watch = useWatchlist();
  const key = launchKey(version, id);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState(false);
  const ticker = symbol ? `$${symbol}` : "Token";
  const graduated = phase === "graduated";
  const hasPool = graduated && auction.pair !== zeroAddress;

  // Same query (and cache) as the tape's trades: no extra reads for the 24h figures.
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, graduated);
  const openPrice = Number(formatUnits(auction.clearingPrice, PRICE_DECIMALS));
  const volume24h = swaps.data && now !== null ? swaps.data.trades.filter((t) => t.time >= now - 86_400).reduce((s, t) => s + t.usdc, BigInt(0)) : null;
  const change24h = graduated && swaps.data && now !== null ? priceChange(swaps.data.trades, now, 86_400, openPrice) : null;
  const changes = graduated && swaps.data && now !== null ? FRAMES.map((f) => ({ label: f.label, pct: priceChange(swaps.data.trades, now, f.seconds, openPrice) })) : null;
  // Fees locked: Uniswap V2 keeps 0.3% of every swap's input in the pool, and with the LP burned nobody can withdraw
  // it. A buy's input is its USDC; a sell's is worth its USDC out / 0.997. Batch-pool fills pay no pool fee.
  const feesLocked = swaps.data
    ? swaps.data.trades
        .filter((t) => t.venue === "uniswap-v2")
        .reduce((s, t) => s + (Number(t.usdc) / 1e6) * (t.side === "buy" ? 0.003 : 0.003 / 0.997), 0)
    : null;

  // LP burned: the share of the pool's LP tokens at 0x…dEaD and 0x0 (also shown, with detail, in the trust radar).
  const lp = useReadContracts({
    contracts: [
      { address: auction.pair, abi: lpAbi, functionName: "totalSupply", chainId: TESTNET.id },
      { address: auction.pair, abi: lpAbi, functionName: "balanceOf", args: [DEAD], chainId: TESTNET.id },
      { address: auction.pair, abi: lpAbi, functionName: "balanceOf", args: [zeroAddress], chainId: TESTNET.id },
    ],
    query: { enabled: hasPool, staleTime: 60_000 },
  });
  const [lpTotal, lpDead, lpZero] = (lp.data ?? []).map((r) => r?.result as bigint | undefined);
  const lpBurnedPct = lpTotal && lpTotal > BigInt(0) && lpDead !== undefined ? Number(((lpDead + (lpZero ?? BigInt(0))) * BigInt(10_000)) / lpTotal) / 100 : null;

  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(auction.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address stays visible in Token info and selectable.
    }
  };

  const link = `${SITE_URL}/launch/v${version}/${id}`;
  const shareText = graduated ? `Trading ${ticker} via CRUX intent routing` : `Auction live for ${ticker} on CRUX`;
  const shareHref = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`;

  const priceLabel = graduated ? t("stat.price") : t("stat.projected");
  const price = graduated ? (market.price !== null ? fmtTokenPrice(market.price) : "…") : indicativePrice !== null ? `$${priceUsd(indicativePrice)}` : "—";
  const supply = Number(auction.totalSupply) / 1e18;
  const mcap = graduated
    ? market.price !== null
      ? usdSmall(market.price * supply)
      : "…"
    : indicativePrice !== null && phase !== "cancelled"
      ? marketCapUsd(indicativePrice, auction.totalSupply)
      : "—";
  const opensIn = now === null ? null : auction.startTime - now;
  const closesIn = now === null ? null : auction.startTime + auction.batchWindow - now;
  const starred = watch.has(key);
  const vestDays = useCreatorVestingDays(batchFactory(version), BigInt(id), version);
  // Holders and how concentrated they are, from the same ledger as the Holders tab (protocol addresses left out).
  const { holders } = useLedger(batchFactory(version) ?? zeroAddress, id, auction);
  const people = holders?.filter((h) => !isSystem(h)) ?? null;
  const top10Pct = people ? people.slice(0, 10).reduce((sum, h) => sum + h.pct, 0) : null;
  const antiSniper = useAntiSniperSeconds(batchFactory(version), BigInt(id), version);

  return (
    <div className="border-b border-line bg-void">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-5">
        <TokenAvatar token={auction.token} image={meta.image} symbol={ticker} size={52} />

        <div className="min-w-0 flex-1">
          {/* Identity */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="font-display-md text-[24px] leading-none text-bright">{ticker}</h1>
            <button
              type="button"
              onClick={() => void copyCa()}
              aria-label={copied ? "Contract address copied" : "Copy contract address"}
              title={copied ? "Copied" : `Copy contract address ${auction.token}`}
              className="grid h-6 w-6 place-items-center rounded-[3px] text-muted transition-colors hover:text-chrome"
            >
              {copied ? Icon.check : Icon.copy}
            </button>
            <span className="whitespace-nowrap rounded-[3px] border border-line px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] text-muted">
              {t("stat.pair")}
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${status.tone}`}>
              <span className={`h-[5px] w-[5px] rounded-full ${status.dot}`} aria-hidden="true" />
              {phaseLabel(t, status.label)}
            </span>
            <VestingBadge days={vestDays} />
            <AntiSniperBadge seconds={antiSniper} />
          </div>
          {name && <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-muted">{name}</p>}

          {/* Price */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-dim">{priceLabel}</span>
            <span className="font-mono text-[22px] leading-none text-bright">{price}</span>
            {change24h !== null && (
              <span
                title="Last trade versus the last trade 24 hours ago (the clearing price if the pool is younger)"
                className={`whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 font-mono text-[12px] ${
                  change24h > 0.005 ? "border-up/40 text-up" : change24h < -0.005 ? "border-down/40 text-down" : "border-line text-muted"
                }`}
              >
                {pctText(change24h)} <span className="text-dim">24h</span>
              </span>
            )}
            {phase === "scheduled" && opensIn !== null && <Stat label={t("stat.opensIn")}>{formatRemaining(opensIn)}</Stat>}
            {phase === "open" && closesIn !== null && <Stat label={t("stat.closesIn")}>{formatRemaining(closesIn)}</Stat>}
            {graduated && now !== null && auction.settledAt > 0 && (
              <Stat label={t("stat.age")} hint={`Trading since ${new Date(auction.settledAt * 1000).toLocaleString()}`}>
                {formatRemaining(Math.max(0, now - auction.settledAt))}
              </Stat>
            )}
          </div>

          {/* Stats strip */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Stat label={t("stat.mcap")} hint="Price × total supply">
              {mcap}
            </Stat>
            {graduated ? (
              <>
                <Stat label={t("stat.liq")} hint="Both sides of the locked pool, in USDC">
                  {market.reserves ? usdSmall((Number(market.reserves.usdc) / 1e6) * 2) : "…"}
                </Stat>
                <Stat label={t("stat.vol24h")} hint="USDC traded through the locked pool in the last 24 hours, intent fills included">
                  {volume24h !== null ? usdAmount(volume24h) : swaps.isError ? "—" : "…"}
                </Stat>
                <Stat label={t("stat.holders")} hint="Wallets holding the token, from its transfers (pools, the auction and Crux contracts left out)">
                  {people ? people.length.toLocaleString("en-US") : "…"}
                </Stat>
                <Stat label={t("stat.top10")} hint="Share of total supply held by the ten largest holders (pools and protocol contracts left out)">
                  <span className={top10Pct !== null && top10Pct > 50 ? "text-down" : top10Pct !== null && top10Pct > 25 ? "text-[#ffd166]" : ""}>
                    {top10Pct !== null ? `${top10Pct.toFixed(top10Pct >= 10 ? 1 : 2)}%` : "…"}
                  </span>
                </Stat>
                <Stat label={t("stat.lpBurned")} hint="Share of the pool's LP tokens held by 0x…dEaD (and Uniswap's 1,000 at 0x0), read live">
                  {lpBurnedPct !== null ? `${lpBurnedPct.toFixed(lpBurnedPct >= 99.995 ? 0 : 2)}%` : "…"}
                </Stat>
                {lpBurnedPct !== null && lpBurnedPct >= 99 && (
                  <Stat
                    label={t("stat.feesLocked")}
                    hint="The 0.3% Uniswap fee on every swap stays in the pool. Its LP is burned, so these fees can never be withdrawn: they deepen the pool for good"
                  >
                    {feesLocked === null ? "…" : feesLocked > 0 && feesLocked < 0.01 ? `$${feesLocked.toPrecision(2)}` : usdSmall(feesLocked)}
                  </Stat>
                )}
              </>
            ) : (
              <>
                <Stat label={t("stat.bids")}>
                  ${fmtUsdcExact(auction.totalDeposits)} / ${fmtUsdcExact(graduationNeeds(auction))}
                </Stat>
                <Stat label="LP" hint="At graduation the factory mints the pool's LP straight to 0x…dEaD">
                  {phase === "cancelled" ? "no pool" : "burns at graduation"}
                </Stat>
              </>
            )}
          </div>

          {changes && (
            <ul aria-label="Price change" className="mt-2 flex flex-wrap items-center gap-1.5">
              {changes.map((c) => {
                const tone = c.pct === null || Math.abs(c.pct) < 0.005 ? "text-muted" : c.pct > 0 ? "text-up" : "text-down";
                return (
                  <li key={c.label} className="flex items-baseline gap-1.5 rounded-[3px] border border-line px-1.5 py-1 font-mono text-[10.5px] leading-none">
                    <span className="text-dim">{c.label}</span>
                    <span className={tone}>{c.pct === null ? "—" : pctText(c.pct)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Actions: their own row on phones, so the identity column keeps its width */}
        <div className="flex basis-full flex-wrap items-center gap-1.5 sm:ml-auto sm:basis-auto">
          <IconButton label={starred ? "Remove from watchlist" : "Add to watchlist"} pressed={starred} onClick={() => watch.toggle(key)}>
            {Icon.star(starred)}
          </IconButton>
          <button
            type="button"
            onClick={() => setInfo(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-line-2 px-2.5 text-[11.5px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-chrome/50 hover:text-chrome"
          >
            {Icon.info} Token info
          </button>
          {meta.links.x && (
            <IconButton label="X profile" href={meta.links.x}>
              {Icon.x}
            </IconButton>
          )}
          {meta.links.farcaster && (
            <IconButton label="Farcaster profile" href={meta.links.farcaster}>
              {Icon.farcaster}
            </IconButton>
          )}
          {meta.links.website && (
            <IconButton label="Website" href={meta.links.website}>
              {Icon.web}
            </IconButton>
          )}
          <IconButton label="Share on X" href={shareHref}>
            {Icon.share}
          </IconButton>
        </div>
      </div>

      <TokenInfo open={info} onClose={() => setInfo(false)} auction={auction} meta={meta} symbol={ticker} name={name} version={version} id={id} vestDays={vestDays} />
    </div>
  );
}
