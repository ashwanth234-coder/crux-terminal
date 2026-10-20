"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { DemandCurve } from "@/components/pro/DemandCurve";
import { LiveTape } from "@/components/pro/LiveTape";
import { PriceChart } from "@/components/pro/PriceChart";
import { SecurityBadges } from "@/components/pro/SecurityBadges";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { TokenBar, type PhaseStatus } from "@/components/pro/TokenBar";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import type { AuctionV2, BatchVersion, PhaseV2 } from "@/lib/launchV2";

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

      {/* minmax(0,1fr) on phones: wide content (the tape's table scrolls sideways) must never widen the column. */}
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line max-lg:pb-28 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)_minmax(220px,32%)]">
        <section aria-label="Chart" className="min-h-[340px] bg-void p-3 lg:col-start-1 lg:row-start-1">
          {mode === "auction" ? (
            <DemandCurve
              factory={factory}
              id={id}
              auction={auction}
              version={version}
              clearing={model.indicativePrice}
              wouldGraduate={model.wouldGraduate}
              live={phase === "open" || phase === "scheduled"}
              symbol={model.symbol ? `$${model.symbol}` : "tokens"}
            />
          ) : (
            <PriceChart auction={auction} symbol={model.symbol ? `$${model.symbol}` : "Token"} />
          )}
        </section>

        <aside aria-label="Execution" className="bg-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          {execution}
          <SecurityBadges factory={factory} auction={auction} version={version} />
          <p className="border-t border-line px-4 py-3 text-[11.5px] text-dim">
            Prefer a simpler layout?{" "}
            <a href={`/launch/v${version}/${id}?view=classic`} className="text-muted underline decoration-line-2 hover:text-chrome">
              Open the classic view
            </a>
          </p>
        </aside>

        <section aria-label="Trades" className="min-h-[220px] bg-void p-3 lg:col-start-1 lg:row-start-2">
          <LiveTape
            factory={factory}
            id={id}
            auction={auction}
            graduated={mode === "trade"}
            live={phase === "open" || phase === "scheduled"}
            symbol={model.symbol ? `$${model.symbol}` : "tokens"}
          />
        </section>
      </div>
    </TerminalShell>
  );
}
