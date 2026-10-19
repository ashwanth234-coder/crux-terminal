"use client";

import Link from "next/link";
import { ArrowUpRight } from "@/components/ui/Button";
import type { LaunchSummary } from "@/hooks/useLaunches";
import { fmtUsdc, formatRemaining, impliedPrice, type Phase } from "@/lib/launch";

const BADGE: Record<Phase, { label: string; className: string; dot: string }> = {
  open: { label: "Live", className: "border-acid/50 text-chrome", dot: "animate-pulse-soft bg-acid" },
  closed: { label: "Awaiting settlement", className: "border-line-2 text-chrome/80", dot: "bg-chrome/60" },
  settled: { label: "Settled", className: "border-line-2 text-chrome/80", dot: "bg-chrome/60" },
  graduated: { label: "Graduated", className: "border-acid bg-acid text-void", dot: "bg-void" },
  cancelled: { label: "Cancelled", className: "border-line text-dim", dot: "bg-dim" },
};

export function LaunchCard({ launch, phase, now }: { launch: LaunchSummary; phase: Phase; now: number | null }) {
  const { auction, id } = launch;
  const badge = BADGE[phase];
  const symbol = launch.symbol ? `$${launch.symbol}` : "Token";
  const raised = auction.graduationTarget > BigInt(0) ? Number((auction.totalDeposits * BigInt(10000)) / auction.graduationTarget) / 10_000 : 0;
  const price = impliedPrice(auction.totalDeposits, launch.saleSupply);
  const left = now === null ? auction.batchWindow : auction.startTime + auction.batchWindow - now;

  return (
    <Link
      href={`/launch/${id}`}
      className="group panel-sheen flex h-full flex-col rounded-2xl border border-line bg-void p-5 transition-colors duration-300 hover:border-line-2 focus-visible:border-acid/60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.18em] text-dim">#{id}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.14em] ${badge.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      <h2 className="mt-5 truncate font-display-md text-[26px] leading-none text-chrome">
        {symbol}
        {launch.name && <span className="text-steel"> {launch.name}</span>}
      </h2>

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
          <span className="text-muted">Raised</span>
          <span className="font-mono tabular-nums text-muted">{(raised * 100).toFixed(0)}%</span>
        </div>
        <p className="mt-1.5 font-mono text-[14px] tabular-nums text-chrome">
          ${fmtUsdc(auction.totalDeposits)} <span className="text-[12px] text-dim">/ ${fmtUsdc(auction.graduationTarget)}</span>
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className={`h-full rounded-full ${phase === "cancelled" ? "bg-down/60" : "bg-acid"}`}
            style={{ width: `${Math.min(100, Math.max(0, raised * 100))}%` }}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[11.5px]">
        <div className="min-w-0">
          <dt className="text-muted">Uniform price</dt>
          <dd className="mt-1 truncate font-mono tabular-nums text-chrome">{phase === "cancelled" ? "—" : price ? `$${price}` : "No bids yet"}</dd>
        </div>
        <div>
          <dt className="text-muted">{phase === "open" ? "Closes in" : "Window"}</dt>
          <dd className={`mt-1 font-mono tabular-nums ${phase === "open" ? "text-acid" : "text-chrome/70"}`} role={phase === "open" ? "timer" : undefined}>
            {phase === "open" ? formatRemaining(left) : auction.batchWindow >= 3600 ? `${auction.batchWindow / 3600}h sale · closed` : `${auction.batchWindow}s batch · closed`}
          </dd>
        </div>
      </dl>

      <span className="mt-5 inline-flex items-center gap-1.5 text-[12px] text-chrome/70 transition-colors group-hover:text-chrome">
        {phase === "open" ? "Deposit" : phase === "closed" ? "Settle" : "View auction"} <ArrowUpRight />
      </span>
    </Link>
  );
}
