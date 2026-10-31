"use client";

import type { ReactNode } from "react";
import type { ScaleMode } from "./settings";
import { Popover } from "./ui";

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
  note,
}: {
  now: number | null;
  /** Shows the last `seconds` (0: everything). */
  onRange: (seconds: number) => void;
  scale: ScaleMode;
  setScale: (m: ScaleMode) => void;
  auto: boolean;
  onAuto: () => void;
  /** What the chart shows, behind the info button. */
  note?: ReactNode;
}) {
  const btn = (active: boolean) => `rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] transition-colors ${active ? "text-signal" : "text-dim hover:text-chrome"}`;
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 overflow-x-auto whitespace-nowrap border-t border-line bg-panel px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Zoom to range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" onClick={() => onRange(r.seconds)} className={btn(false)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {note && (
          <Popover
            align="right"
            width="w-80"
            button={(open, toggle) => (
              <button type="button" onClick={toggle} aria-expanded={open} title="About this chart" className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${open ? "border-chrome/60 text-chrome" : "border-line-2 text-dim hover:text-chrome"}`}>
                i
              </button>
            )}
          >
            {() => (
              <div className="space-y-2 p-2 text-[11.5px] leading-relaxed text-muted">
                <p>{note}</p>
                <p className="text-dim">
                  Charts by{" "}
                  <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 hover:text-chrome">
                    TradingView Lightweight Charts™
                  </a>
                  .
                </p>
              </div>
            )}
          </Popover>
        )}
        <span className="mx-1 h-3 w-px bg-line" aria-hidden="true" />
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
