"use client";

import { useMemo } from "react";
import { BATCH_SECONDS, formatCountdown, seeded, useBatchClock } from "@/lib/batch";

type Order = { id: number; amount: string; asset: string; chain: string; via?: string };

const SOURCES = [
  { chain: "Base", asset: "ETH", min: 0.05, max: 3, dp: 2 },
  { chain: "Solana", asset: "USDC", min: 40, max: 2400, dp: 0, via: "via ERC-7683" },
  { chain: "BSC", asset: "USDC", min: 40, max: 1800, dp: 0 },
  { chain: "Robinhood", asset: "USDC", min: 40, max: 900, dp: 0 },
] as const;

/** Orders arrive through the window; one every ~4s, all sharing the batch's single price. */
function ordersFor(batch: number) {
  const r = seeded(batch * 2654435761);
  const firstId = 1000 + (batch % 500) * 15;
  const list: Order[] = Array.from({ length: 15 }, (_, i) => {
    const s = SOURCES[i % 3 === 2 ? 2 : r() > 0.82 ? 3 : r() > 0.5 ? 1 : 0];
    const amt = s.min + r() * (s.max - s.min);
    return {
      id: firstId + i,
      amount: amt.toLocaleString("en-US", { minimumFractionDigits: s.dp, maximumFractionDigits: s.dp }),
      asset: s.asset,
      chain: s.chain,
      via: "via" in s ? s.via : undefined,
    };
  });
  const price = 0.036 + r() * 0.012;
  return { list, price };
}

const R = 46;
const CIRC = 2 * Math.PI * R;

/**
 * The 60-second uniform batch auction, live: a countdown ring synced to the
 * site-wide batch clock and a stream of (simulated) intents pooling into the
 * current batch, every one at the same clearing price.
 */
export function BatchAuctionTracker() {
  const clock = useBatchClock();
  const batch = clock?.batch ?? 0;
  const left = clock?.left ?? BATCH_SECONDS;
  const into = BATCH_SECONDS - left;
  const clearing = clock !== null && left <= 1;
  const { list, price } = useMemo(() => ordersFor(batch), [batch]);

  const arrived = clock ? Math.min(list.length, Math.floor(into / 4) + 1) : 3;
  const recent = list.slice(Math.max(0, arrived - 3), arrived).reverse();
  const priceLabel = `$${price.toFixed(4)}`;
  const progress = clock ? (into + 1) / BATCH_SECONDS : 0;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 lg:p-10">
      {/* Countdown ring */}
      <div className="mx-auto flex flex-col items-center">
        <div className="relative h-[116px] w-[116px]">
          <svg viewBox="0 0 108 108" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="54" cy="54" r={R} fill="rgba(5,5,5,0.55)" stroke="#2a2d33" strokeWidth="2" />
            <circle
              cx="54"
              cy="54"
              r={R}
              fill="none"
              stroke="#d4f933"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              className={left >= BATCH_SECONDS ? "" : "transition-[stroke-dashoffset] duration-1000 ease-linear"}
              style={{ filter: clearing ? "drop-shadow(0 0 6px rgba(212,249,51,0.9))" : undefined }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-label={`Batch clears in ${left} seconds`}>
            <span className="font-mono text-[22px] leading-none tabular-nums text-chrome">{clock ? formatCountdown(left) : "00:—"}</span>
            <span className="mt-1.5 text-[10.5px] text-muted">{clearing ? "Clearing" : "Batch auction"}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Batch <span className="font-mono tabular-nums text-chrome/80">#{clock ? batch.toLocaleString("en-US") : "———"}</span>
        </p>
      </div>

      {/* Intent stream pooling into this batch */}
      <div className="mx-auto w-full max-w-[460px] rounded-xl border border-line bg-void/80 p-3.5 backdrop-blur-md sm:p-4">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-2 text-chrome/85">
            <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse-soft" aria-hidden="true" />
            Orders in this batch
          </span>
          <span className="text-dim">
            <span className="font-mono tabular-nums text-muted">{arrived}</span> pooled · simulated
          </span>
        </div>
        <ul className="mt-2.5 space-y-1.5" aria-live="polite">
          {recent.map((o, i) => (
            <li
              key={o.id}
              className={`flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                i === 0 ? "animate-rise bg-white/[0.03]" : ""
              }`}
            >
              <span className="min-w-0 truncate text-chrome/80">
                <span className="font-mono text-dim">#{o.id}</span>{" "}
                <span className="font-mono tabular-nums text-chrome">
                  {o.amount} {o.asset}
                </span>{" "}
                from {o.chain}
                {o.via && <span className="text-dim"> ({o.via})</span>}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted">{priceLabel}</span>
            </li>
          ))}
        </ul>
        {/* Uniform clearing banner */}
        <div
          className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-500 ${
            clearing ? "border-acid bg-acid/10" : "border-acid/30"
          }`}
        >
          <span className="text-[11.5px] leading-snug text-chrome/85">
            <span className="text-acid">Zero MEV advantage.</span> Every chain clears at one identical price.
          </span>
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-acid">{priceLabel}</span>
        </div>
      </div>
    </div>
  );
}
