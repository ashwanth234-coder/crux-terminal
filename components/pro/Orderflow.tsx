"use client";

import { useState } from "react";
import { useNow } from "@/hooks/useLaunchAuction";
import { usePoolSwaps } from "@/hooks/usePoolSwaps";
import type { AuctionV2 } from "@/lib/launchV2";
import { orderflow, share, usdAmount } from "@/lib/orderflow";

const WINDOWS = [
  { id: "24h", label: "24H", seconds: 86_400 },
  { id: "all", label: "All", seconds: null },
] as const;

function SplitBar({ left, label }: { left: number; label: string }) {
  return (
    <div className="flex h-1.5 overflow-hidden rounded-[2px] bg-line" role="img" aria-label={label}>
      <span className="h-full bg-up" style={{ width: `${left}%` }} />
      <span className="h-full flex-1 bg-down" />
    </div>
  );
}

/**
 * Order flow on the locked pool, from the same swap scan as the tape: buys against sells by count and by
 * USDC, and how much of the volume came through solver intents. Every number is an executed swap.
 */
export function Orderflow({ auction }: { auction: AuctionV2 }) {
  const now = useNow();
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>("24h");
  const swaps = usePoolSwaps(auction.pair, auction.settledAt, true);
  const seconds = WINDOWS.find((w) => w.id === win)?.seconds ?? null;
  const flow = swaps.data && now !== null ? orderflow(swaps.data.trades, seconds === null ? 0 : now - seconds) : null;
  const total = flow ? flow.buys + flow.sells : 0;

  return (
    <section aria-labelledby="flow-title" className="border-t border-line px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="flow-title" className="text-[13px] font-medium text-chrome">
          Order flow
        </h2>
        <div role="tablist" aria-label="Window" className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              role="tab"
              type="button"
              aria-selected={win === w.id}
              onClick={() => setWin(w.id)}
              className={`rounded-[3px] px-2 py-0.5 font-mono text-[10.5px] transition-colors ${win === w.id ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {!flow ? (
        <p className="mt-3 text-[12px] text-dim">{swaps.isError ? "Couldn't read the pool. Retrying…" : "Reading the pool…"}</p>
      ) : total === 0 ? (
        <p className="mt-3 text-[12px] text-dim">No trades {win === "24h" ? "in the last 24 hours" : "since graduation"}.</p>
      ) : (
        <div className="mt-3 space-y-3.5">
          <div>
            <div className="flex justify-between font-mono text-[11.5px]">
              <span className="text-up">
                {flow.buys} buy{flow.buys === 1 ? "" : "s"} ({share(flow.buys, flow.sells).toFixed(0)}%)
              </span>
              <span className="text-down">
                {flow.sells} sell{flow.sells === 1 ? "" : "s"} ({share(flow.sells, flow.buys).toFixed(0)}%)
              </span>
            </div>
            <div className="mt-1.5">
              <SplitBar left={share(flow.buys, flow.sells)} label={`${flow.buys} buys, ${flow.sells} sells`} />
            </div>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[11.5px]">
              <span className="text-up">{usdAmount(flow.buyUsdc)} bought</span>
              <span className="text-down">{usdAmount(flow.sellUsdc)} sold</span>
            </div>
            <div className="mt-1.5">
              <SplitBar left={share(flow.buyUsdc, flow.sellUsdc)} label={`${usdAmount(flow.buyUsdc)} bought, ${usdAmount(flow.sellUsdc)} sold`} />
            </div>
            <p className="mt-1.5 text-[11px] text-dim">
              Net{" "}
              <span className={`font-mono ${flow.buyUsdc >= flow.sellUsdc ? "text-up" : "text-down"}`}>
                {flow.buyUsdc >= flow.sellUsdc ? "+" : "−"}
                {usdAmount(flow.buyUsdc >= flow.sellUsdc ? flow.buyUsdc - flow.sellUsdc : flow.sellUsdc - flow.buyUsdc)}
              </span>{" "}
              USDC
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <span
              className="text-[12px] text-muted"
              title="Intent fills clear in a batch at one price per batch, which removes ordering inside the batch. The solver's own pool swap is an ordinary transaction, so this is not a claim of full MEV protection."
            >
              Filled via solver intents
            </span>
            <span className="font-mono text-[12px] text-chrome">{share(flow.intentUsdc, flow.buyUsdc + flow.sellUsdc - flow.intentUsdc).toFixed(0)}% of volume</span>
          </div>
        </div>
      )}
    </section>
  );
}
