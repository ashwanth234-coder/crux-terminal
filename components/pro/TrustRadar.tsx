"use client";

import type { Address } from "viem";
import { SecurityBadges } from "@/components/pro/SecurityBadges";
import { useNow } from "@/hooks/useLaunchAuction";
import { useTrustFacts } from "@/hooks/useTrustFacts";
import { TESTNET_EXPLORER } from "@/lib/chains";
import type { AuctionV2, BatchVersion } from "@/lib/launchV2";

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Creator vesting as a bar: from the on-chain settle time over the factory's own vesting length. */
function VestingBar({ auction, days }: { auction: AuctionV2; days: number | null }) {
  const now = useNow();
  if (auction.status !== 1) {
    return <p className="text-[12px] text-dim">Creator vesting starts when the auction graduates.</p>;
  }
  if (days === null || now === null) return <p className="text-[12px] text-dim">Reading the vesting schedule…</p>;
  const end = auction.settledAt + days * 86_400;
  const pct = Math.max(0, Math.min(100, ((now - auction.settledAt) / (days * 86_400)) * 100));
  const left = Math.max(0, end - now);
  const dLeft = Math.floor(left / 86_400);
  const hLeft = Math.floor((left % 86_400) / 3600);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[20px] text-chrome">{pct.toFixed(1)}%</span>
        <span className="text-[12px] text-muted">{left === 0 ? "Fully vested" : `${dLeft}d ${hLeft}h left`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-[2px] bg-line" role="img" aria-label={`${pct.toFixed(1)}% vested`}>
        <div className="h-full bg-chrome/70" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-dim">
        <span>{day.format(new Date(auction.settledAt * 1000))}</span>
        <span>{day.format(new Date(end * 1000))}</span>
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-dim">
        The creator&apos;s 10% and their share of the raise unlock linearly over {days} days from settlement. The contract can&apos;t release them faster.
      </p>
    </div>
  );
}

/** The trust tab of the bottom desk: the live-verified checks beside the creator vesting schedule. */
export function TrustRadar({ factory, auction, version }: { factory: Address; auction: AuctionV2; version: BatchVersion }) {
  const { vestingDays } = useTrustFacts(factory, auction, version, TESTNET_EXPLORER);
  return (
    <div className="grid min-h-0 gap-px overflow-auto rounded-lg border border-line bg-line lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="bg-void [&>section]:border-t-0">
        <SecurityBadges factory={factory} auction={auction} version={version} />
      </div>
      <div className="bg-void p-4">
        <h2 className="mb-3 text-[13px] font-medium text-chrome">Creator vesting</h2>
        <VestingBar auction={auction} days={vestingDays} />
      </div>
    </div>
  );
}
