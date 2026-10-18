"use client";

import { formatCountdown, useBatchClock } from "@/lib/batch";

/**
 * The batch instrument: which batch is collecting intents and how long until
 * it clears at one uniform price. Flares on the clearing second, in sync with
 * the header heartbeat, the intent tape and the knot's acid ring. Simulated.
 */
export function BatchStatus({ className = "" }: { className?: string }) {
  const clock = useBatchClock();
  const clearing = clock !== null && clock.left <= 1;

  return (
    <div
      role="timer"
      aria-label={clock ? `Batch ${clock.batch} clears in ${clock.left} seconds (simulated)` : "Batch clock (simulated)"}
      className={`relative inline-flex items-stretch overflow-hidden rounded-xl border bg-void/60 backdrop-blur-md transition-[border-color,box-shadow] duration-500 ${
        clearing ? "border-acid/70 shadow-[0_8px_40px_-12px_rgba(212,249,51,0.55)]" : "border-line-2"
      } ${className}`}
    >
      <div className="flex flex-col justify-center gap-1 px-4 py-3">
        <p className="flex items-center gap-2 text-[12px] text-chrome">
          <span className="relative grid h-2 w-2 place-items-center" aria-hidden="true">
            <span className="absolute h-2 w-2 rounded-full bg-acid/40 animate-ping" />
            <span className="h-1.5 w-1.5 rounded-full bg-acid" />
          </span>
          Batch <span className="font-mono tabular-nums">#{clock ? clock.batch.toLocaleString("en-US") : "———"}</span>
        </p>
        <p className="text-[11px] text-muted">One uniform price · simulated</p>
      </div>
      <div className="flex flex-col justify-center border-l border-line px-4 py-3 text-right">
        <p className="text-[11px] text-muted">{clearing ? "Clearing" : "Clears in"}</p>
        <p className="font-mono text-[24px] leading-none tabular-nums text-acid">{clock ? formatCountdown(clock.left) : "00:—"}</p>
      </div>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-acid/70 transition-transform duration-1000 ease-linear"
        style={{ transform: `scaleX(${clock ? (60 - clock.left + 1) / 60 : 0})` }}
      />
    </div>
  );
}
