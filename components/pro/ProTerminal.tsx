"use client";

import { useState, type ReactNode } from "react";
import { zeroAddress, type Address } from "viem";
import { DemandCurve } from "@/components/pro/DemandCurve";
import { LiveTape } from "@/components/pro/LiveTape";
import { ChartGrid } from "@/components/chart/ChartGrid";
import { NoticeBanner } from "@/components/pro/NoticeBanner";
import { Momentum } from "@/components/pro/Momentum";
import { TerminalShell } from "@/components/pro/TerminalShell";
import { TokenBar, type PhaseStatus } from "@/components/pro/TokenBar";
import type { LaunchV2Model } from "@/hooks/useLaunchV2";
import type { AuctionV2, BatchVersion, PhaseV2 } from "@/lib/launchV2";

/**
 * The pro terminal: one launch, two modes. Auction mode (scheduled, open, closed, cancelled) and trade mode
 * (graduated) share the grid; each panel switches its data source by mode.
 *
 *         notice banner (only when this wallet has something to claim or release)
 *         token bar
 *   lg+:  ┌───────────────┬────────────┐       phones: banner → TokenBar → chart → execution
 *         │ chart         │ execution  │               → order flow → desk
 *         ├───────────────┤ order flow │
 *         │ desk (tabs)   │            │
 *         └───────────────┴────────────┘
 *   The desk's tabs: swaps, holders & PnL, top traders, my orders, auction bids, trust radar. Clicking a trader in the desk
 *   filters the desk and the chart's marks to that wallet.
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
  const symbol = model.symbol ? `$${model.symbol}` : "tokens";
  const [focus, setFocus] = useState<Address | null>(null);

  return (
    <TerminalShell>
      <NoticeBanner model={model} auction={auction} phase={phase} symbol={symbol} />
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
            <ChartGrid auction={auction} symbol={model.symbol ? `$${model.symbol}` : "Token"} name={model.name} factory={factory} id={id} focus={focus} onFocus={setFocus} />
          )}
        </section>

        <aside aria-label="Execution" className="bg-panel lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto">
          {execution}
          {mode === "trade" && auction.pair !== zeroAddress && <Momentum auction={auction} symbol={model.symbol} />}
          <p className="border-t border-line px-4 py-3 text-[11.5px] text-dim">
            Prefer a simpler layout?{" "}
            <a href={`/launch/v${version}/${id}?view=classic`} className="text-muted underline decoration-line-2 hover:text-chrome">
              Open the classic view
            </a>
          </p>
        </aside>

        <section aria-label="Trades, holders and trust" className="min-h-[260px] bg-void p-3 lg:col-start-1 lg:row-start-2">
          <LiveTape
            factory={factory}
            id={id}
            auction={auction}
            graduated={mode === "trade"}
            live={phase === "open" || phase === "scheduled"}
            symbol={symbol}
            version={version}
            focus={focus}
            onFocus={setFocus}
          />
        </section>
      </div>
    </TerminalShell>
  );
}
