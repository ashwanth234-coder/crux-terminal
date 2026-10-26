"use client";

import type { ScaleMode } from "./settings";

const RANGES = [
  { label: "1D", seconds: 86_400 },
  { label: "1W", seconds: 7 * 86_400 },
  { label: "1M", seconds: 30 * 86_400 },
  { label: "3M", seconds: 90 * 86_400 },
  { label: "1Y", seconds: 365 * 86_400 },
  { label: "All", seconds: 0 },
] as const;

const utc = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);

/** Under the time axis: zoom presets on the left; the UTC clock and the price-scale modes on the right. */
export function BottomBar({
  now,
  onRange,
  scale,
  setScale,
  auto,
  onAuto,
}: {
  now: number | null;
  /** Shows the last `seconds` (0: everything). */
  onRange: (seconds: number) => void;
  scale: ScaleMode;
  setScale: (m: ScaleMode) => void;
  auto: boolean;
  onAuto: () => void;
}) {
  const btn = (active: boolean) => `rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] transition-colors ${active ? "text-signal" : "text-dim hover:text-chrome"}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-x border-b border-line px-1.5 py-1">
      <div className="flex items-center gap-0.5" role="group" aria-label="Zoom to range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" onClick={() => onRange(r.seconds)} className={btn(false)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px] text-muted" aria-label="Current time (UTC)">
          {now === null ? "--:--:--" : utc(now)} UTC
        </span>
        <span className="mx-1 h-3 w-px bg-line" aria-hidden="true" />
        <button type="button" aria-pressed={scale === "percent"} onClick={() => setScale(scale === "percent" ? "normal" : "percent")} className={btn(scale === "percent")} title="Percentage scale">
          %
        </button>
        <button type="button" aria-pressed={scale === "log"} onClick={() => setScale(scale === "log" ? "normal" : "log")} className={btn(scale === "log")} title="Logarithmic scale">
          log
        </button>
        <button type="button" aria-pressed={auto} onClick={onAuto} className={btn(auto)} title="Fit the price scale to the visible data">
          auto
        </button>
      </div>
    </div>
  );
}
