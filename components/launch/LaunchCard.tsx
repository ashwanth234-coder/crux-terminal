"use client";

import Link from "next/link";
import { ArrowUpRight } from "@/components/ui/Button";
import type { LaunchSummary } from "@/hooks/useLaunches";
import { fmtUsdc, formatRemaining, impliedMarketCap, impliedPrice, type Phase } from "@/lib/launch";

const BADGE: Record<Phase, { label: string; className: string; dot: string }> = {
  open: { label: "Live", className: "border-acid/50 text-chrome", dot: "bg-acid" },
  closed: { label: "Awaiting settlement", className: "border-line-2 text-chrome/80", dot: "bg-chrome/60" },
  settled: { label: "Settled", className: "border-line-2 text-chrome/80", dot: "bg-chrome/60" },
  graduated: { label: "Graduated", className: "border-acid bg-acid text-void", dot: "bg-void" },
  cancelled: { label: "Cancelled", className: "border-line text-dim", dot: "bg-dim" },
};

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/** Identity first, then the one price everyone pays, then how far the auction has come. */
export function LaunchCard({ launch, phase, now }: { launch: LaunchSummary; phase: Phase; now: number | null }) {
  const { auction, id } = launch;
  const badge = BADGE[phase];
  const ticker = launch.symbol ?? `#${id}`;
  const raised = auction.graduationTarget > BigInt(0) ? Number((auction.totalDeposits * BigInt(10000)) / auction.graduationTarget) / 10_000 : 0;
  const price = impliedPrice(auction.totalDeposits, launch.saleSupply);
  const cap = impliedMarketCap(auction.totalDeposits);
  const left = now === null ? auction.batchWindow : auction.startTime + auction.batchWindow - now;
  const elapsed = 1 - Math.max(0, left) / auction.batchWindow;
  const priceLabel = phase === "graduated" ? "Clearing price" : phase === "open" ? "Clearing price so far" : "Uniform price";

  return (
    <Link
      href={`/launch/${id}`}
      className="group flex h-full flex-col rounded-2xl border border-line bg-panel p-5 transition-colors duration-200 hover:border-line-2 focus-visible:border-acid/60"
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
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      {/* The one price every buyer pays */}
      <div className="mt-6">
        <p className="text-[12px] text-muted">{priceLabel}</p>
        {phase !== "cancelled" && price ? (
          <p className="mt-1 truncate font-mono text-[22px] leading-tight text-chrome">${price}</p>
        ) : (
          <p className="mt-1 text-[19px] leading-tight text-chrome/70">{phase === "cancelled" ? "None: target missed" : "No bids yet"}</p>
        )}
        <p className="mt-1 text-[12px] text-muted">
          Market cap <span className="font-mono text-chrome/85">{phase === "cancelled" || !cap ? "—" : cap}</span>
          <span className="text-dim"> at this price</span>
        </p>
      </div>

      {/* Progress: the sealed window, then the raise */}
      <div className="mt-6 space-y-4 border-t border-line pt-4">
        {phase === "open" && (
          <div>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-muted">Sealed window</span>
              <span className="font-mono text-acid" role="timer">
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
            <Bar value={raised} className={phase === "cancelled" ? "bg-down/60" : "bg-acid"} />
          </div>
        </div>
      </div>

      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[12.5px] text-chrome/75 transition-colors group-hover:text-chrome">
        {phase === "open" ? "Deposit" : phase === "closed" ? "Settle" : "View auction"} <ArrowUpRight />
      </span>
    </Link>
  );
}
