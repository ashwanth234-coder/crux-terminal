"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { SecurityBadges } from "@/components/pro/SecurityBadges";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { TokenBar, type PhaseStatus } from "@/components/pro/TokenBar";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import type { AuctionV2, BatchVersion, PhaseV2 } from "@/lib/launchV2";

/** Placeholder for a panel still being built; shown only in the ?pro=1 preview. */
function Pending({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[inherit] flex-col items-center justify-center gap-2 border border-dashed border-line-2 px-6 py-10 text-center">
      <p className="text-[13px] text-chrome">{title}</p>
      <p className="max-w-sm text-[12px] leading-snug text-dim">{detail}</p>
    </div>
  );
}

/**
 * The pro terminal: one launch, two modes. Auction mode (scheduled, open, closed, cancelled) and trade mode
 * (graduated) share the grid; each panel switches its data source by mode.
 *
 *   lg+:  ┌───────────────┬────────────┐       phones: TokenBar → chart → execution
 *         │ chart         │ execution  │               → trust checks → tape
 *         ├───────────────┤ trust      │
 *         │ tape          │            │
 *         └───────────────┴────────────┘
 */
export function ProTerminal({
  factory,
  model,
  auction,
  phase,
  status,
  version,
  id,
  execution,
}: {
  factory: Address;
  model: LaunchV2Model;
  auction: AuctionV2;
  phase: PhaseV2;
  status: PhaseStatus;
  version: BatchVersion;
  id: string;
  /** The execution panel (bid / settle / claim / trade), rendered by the caller. */
  execution: ReactNode;
}) {
  const mode = phase === "graduated" ? "trade" : "auction";

  return (
    <TerminalShell>
      <TokenBar
        auction={auction}
        symbol={model.symbol}
        name={model.name}
        status={status}
        phase={phase}
        indicativePrice={model.indicativePrice}
        version={version}
        id={id}
      />

      <div className="grid flex-1 gap-px bg-line lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)_minmax(220px,32%)]">
        <section aria-label="Chart" className="min-h-[340px] bg-void p-3 lg:col-start-1 lg:row-start-1">
          <Pending
            title={mode === "auction" ? "Demand curve" : "Price chart"}
            detail={
              mode === "auction"
                ? "Next build step: cumulative bid demand by 1% price step, with the projected clearing price, read live from the auction's tick book."
                : "Next build step: candles built from the locked pool's on-chain swaps."
            }
          />
        </section>

        <aside aria-label="Execution" className="bg-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          <div className="p-3">{execution}</div>
          <SecurityBadges factory={factory} auction={auction} version={version} />
        </aside>

        <section aria-label="Trades" className="min-h-[220px] bg-void p-3 lg:col-start-1 lg:row-start-2">
          <Pending
            title={mode === "auction" ? "Bid tape" : "Trade tape"}
            detail={mode === "auction" ? "Next build step: every BidPlaced event, newest first." : "Next build step: pool swaps and intent fills, newest first."}
          />
        </section>
      </div>
    </TerminalShell>
  );
}
