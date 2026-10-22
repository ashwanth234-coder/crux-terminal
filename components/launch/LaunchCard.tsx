"use client";

import Link from "next/link";
import { VestingBadge } from "@/components/ui/VestingBadge";
import { useCreatorVestingDays } from "@/hooks/useCreatorVesting";
import { batchFactory } from "@/lib/intents";
import { ArrowUpRight } from "@/components/ui/Button";
import type { LaunchSummary } from "@/hooks/useLaunches";
import { fmtUsdc, formatRemaining, type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";

const BADGE: Record<Phase, { label: string; className: string; dot: string }> = {
  scheduled: { label: "Scheduled", className: "border-line-2 text-chrome/80", dot: "bg-muted" },
  // Orange means bidding is open right now; nothing else on the card is orange.
  open: { label: "Live", className: "border-signal/60 text-chrome", dot: "bg-signal" },
  closed: { label: "Awaiting settlement", className: "border-line-2 text-chrome/80", dot: "bg-muted" },
  settled: { label: "Settled", className: "border-line-2 text-chrome/80", dot: "bg-muted" },
  graduated: { label: "Graduated", className: "border-chrome/40 text-chrome", dot: "bg-chrome" },
  cancelled: { label: "Cancelled", className: "border-dashed border-line-2 text-dim", dot: "border border-dim" },
};

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-px overflow-hidden bg-line" aria-hidden="true">
      <div className={`h-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/** Identity first, then the one price everyone pays, then how far the auction has come. */
export function LaunchCard({ launch, phase, now }: { launch: LaunchSummary; phase: Phase; now: number | null }) {
  const { auction, id } = launch;
  const vestDays = useCreatorVestingDays(launch.version >= 2 ? batchFactory(launch.version as 2 | 3 | 4) : null, id, launch.version);
  const badge = BADGE[phase];
  const ticker = launch.symbol ?? `#${id}`;
  const raised = auction.graduationTarget > BigInt(0) ? Number((auction.totalDeposits * BigInt(10000)) / auction.graduationTarget) / 10_000 : 0;
  const d = describeLaunch(launch, now);
  const price = d.price;
  const cap = d.marketCap;
  const left = d.closesIn;
  const elapsed = 1 - Math.max(0, left) / auction.batchWindow;
  const priceLabel = d.priceLabel;

  return (
    <Link
      href={launch.href}
      className="group flex h-full flex-col rounded-md border border-line bg-void p-5 transition-colors duration-200 hover:border-line-2 hover:bg-panel/60 focus-visible:border-signal/60"
    >
      {/* Identity */}
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-2 bg-void font-mono text-[12px] text-chrome" aria-hidden="true">
          {ticker.replace("#", "").slice(0, 3)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-medium leading-tight text-chrome">${ticker}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {launch.name ?? "Unnamed token"} <span className="font-mono text-dim">· #{id}</span>
            {launch.version >= 2 && <span className="text-dim"> · LP locked</span>}
          </p>
          {launch.version >= 2 && <VestingBadge days={vestDays} className="mt-1.5" />}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] font-mono text-[9.5px] uppercase leading-none tracking-[0.16em] ${badge.className}`}>
          <span className={`h-[5px] w-[5px] rounded-full ${badge.dot}`} aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      {/* The one price every buyer pays */}
      <div className="mt-6">
        <p className="text-[12px] text-muted">{priceLabel}</p>
        {phase !== "cancelled" && price ? (
          <p className="mt-1 truncate font-mono text-[22px] leading-tight text-chrome">{price}</p>
        ) : (
          <p className="mt-1 text-[19px] leading-tight text-chrome/70">{phase === "cancelled" ? "None: target missed" : "No bids yet"}</p>
        )}
        <p className="mt-1 text-[12px] text-muted">
          Market cap <span className="font-mono text-chrome/85">{phase === "cancelled" || !cap ? "—" : cap}</span>
          <span className="text-dim"> at this price</span>
        </p>
      </div>

      {/* Progress: the batch window, then the raise */}
      <div className="mt-6 space-y-4 border-t border-line pt-4">
        {phase === "scheduled" && (
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-muted">Deposits open in</span>
            <span className="font-mono text-chrome" role="timer">
              {formatRemaining(d.opensIn)}
            </span>
          </div>
        )}
        {phase === "open" && (
          <div>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-muted">Batch window</span>
              <span className="font-mono text-signal" role="timer">
                {formatRemaining(left)}
              </span>
            </div>
            <div className="mt-2">
              <Bar value={elapsed} className="bg-chrome/50" />
            </div>
          </div>
        )}
        <div>
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="text-muted">
              Raised <span className="font-mono text-chrome/85">${fmtUsdc(auction.totalDeposits)}</span>
              <span className="text-dim"> / ${fmtUsdc(auction.graduationTarget)}</span>
            </span>
            <span className="font-mono text-muted">{(raised * 100).toFixed(0)}%</span>
          </div>
          <div className="mt-2">
            <Bar value={raised} className={phase === "cancelled" ? "bg-dim" : phase === "open" ? "bg-signal" : "bg-chrome/70"} />
          </div>
        </div>
      </div>

      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[12.5px] text-chrome/75 transition-colors group-hover:text-chrome">
        {phase === "open" ? "Bid" : phase === "closed" ? "Settle" : "View auction"} <ArrowUpRight />
      </span>
    </Link>
  );
}
