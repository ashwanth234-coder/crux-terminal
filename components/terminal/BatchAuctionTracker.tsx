"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/ui/Button";
import { useAllLaunches, type LaunchSummary } from "@/hooks/useLaunches";
import { useNow } from "@/hooks/useLaunchAuction";
import { FACTORY, FACTORY_V2, FACTORY_V3 } from "@/lib/intents";
import { fmtUsdc, formatRemaining, type Phase } from "@/lib/launch";
import { describeLaunch } from "@/lib/launchSummary";

const STATUS: Record<Phase, string> = {
  scheduled: "Scheduled",
  open: "Deposits open",
  closed: "Awaiting settlement",
  settled: "Settled",
  graduated: "Graduated",
  cancelled: "Cancelled · refunds open",
};

function Latest({ launch, now }: { launch: LaunchSummary; now: number | null }) {
  const { auction } = launch;
  const d = describeLaunch(launch, now);
  const phase = d.phase;
  return (
    <Link href={launch.href} className="block px-5 py-5 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-baseline justify-between gap-4">
        <p className="truncate text-[17px] text-chrome">
          {launch.symbol ? `$${launch.symbol}` : `Auction #${launch.id}`}
          {launch.name && <span className="text-steel"> {launch.name}</span>}
        </p>
        <span className={`shrink-0 text-[12px] ${phase === "graduated" || phase === "open" ? "text-acid" : "text-muted"}`}>
          {phase === "open" ? `Closes in ${formatRemaining(d.closesIn)}` : phase === "scheduled" ? `Opens in ${formatRemaining(d.opensIn)}` : STATUS[phase]}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-[12px]">
        <div>
          <dt className="text-muted">Raised</dt>
          <dd className="mt-1 font-mono text-[13px] text-chrome">
            ${fmtUsdc(auction.totalDeposits)} <span className="text-dim">/ ${fmtUsdc(auction.graduationTarget)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">{d.priceLabel}</dt>
          <dd className="mt-1 truncate font-mono text-[13px] text-chrome">{phase === "cancelled" ? "None" : (d.price ?? "No bids yet")}</dd>
        </div>
      </dl>
    </Link>
  );
}

/**
 * The newest real launch on the deployed CruxFactory (Base Sepolia): what the
 * batch auction actually did, in place of a simulated order stream.
 */
export function BatchAuctionTracker() {
  const now = useNow();
  const { launches, loading, error } = useAllLaunches(FACTORY, FACTORY_V2, FACTORY_V3);
  const latest = launches[0];

  return (
    <section aria-labelledby="latest-launch" className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 id="latest-launch" className="text-[13.5px] font-medium text-chrome">
          Latest launch
        </h3>
        <span className="text-[11.5px] text-muted">Base Sepolia testnet</span>
      </div>

      {!FACTORY && !FACTORY_V2 && !FACTORY_V3 ? (
        <p className="px-5 py-6 text-[13px] text-muted">No factory is configured for this build.</p>
      ) : loading ? (
        <div className="space-y-2.5 px-5 py-6" aria-busy="true" aria-label="Reading launches">
          <span className="block h-4 w-40 rounded bg-line" />
          <span className="block h-3 w-56 rounded bg-line/70" />
        </div>
      ) : error && !latest ? (
        <p role="status" className="px-5 py-6 text-[13px] text-muted">
          Couldn&apos;t reach Base Sepolia. Retrying shortly.
        </p>
      ) : !latest ? (
        <p className="px-5 py-6 text-[13px] text-muted">No launches yet. Launch a token to open the first batch auction.</p>
      ) : (
        <Latest launch={latest} now={now} />
      )}

      <div className="border-t border-line px-5 py-3">
        <Link href="/launches" className="group inline-flex items-center gap-1.5 text-[12.5px] text-chrome/80 transition-colors hover:text-chrome">
          View all live launches <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
