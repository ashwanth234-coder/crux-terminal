"use client";

import type { ChartSettings } from "./settings";
import { Popover, Tool } from "./ui";

const MIN_SIZES = [
  { label: "All", usd: 0 },
  { label: ">$250", usd: 250 },
  { label: ">$1K", usd: 1_000 },
  { label: ">$5K", usd: 5_000 },
] as const;

function Check({ on, onClick, label, swatch }: { on: boolean; onClick: () => void; label: string; swatch: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className={`flex items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-[11.5px] transition-colors ${on ? "text-chrome" : "text-dim hover:text-chrome"}`}>
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${on ? "border-transparent" : "border-line-2"}`} style={on ? { background: swatch } : undefined} aria-hidden="true">
        {on && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-void">
            <path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

/** The toolbar's Overlays menu: which on-chain trades and levels to draw on the candles, and the smallest trade marked. */
export function OverlaysButton({ settings, onChange, counts }: { settings: ChartSettings; onChange: (s: ChartSettings) => void; counts: { mine: number; dev: number; top: number } }) {
  const marks = settings.marks;
  const toggle = (k: keyof ChartSettings["marks"]) => onChange({ ...settings, marks: { ...marks, [k]: !marks[k] } });
  const on = [marks.mine, marks.dev, marks.top, settings.clearingLine].filter(Boolean).length;
  return (
    <Popover
      width="w-60"
      button={(open, t) => (
        <Tool label="Chart overlays: your trades, whales and the dev, top holders, the batch floor" active={open} onClick={t} className="px-2">
          <span className="flex items-center gap-1 font-sans text-[11.5px]">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M2 5.5 8 2.5l6 3-6 3-6-3Z M2 9l6 3 6-3 M2 12.5l6 3 6-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="hidden md:inline">Overlays</span>
            {on > 0 && <span className="font-mono text-[10px] text-dim">{on}</span>}
          </span>
        </Tool>
      )}
    >
      {() => (
        <div className="flex flex-col gap-0.5 p-1">
          <p className="px-1.5 pb-1 text-[10px] uppercase tracking-[0.14em] text-dim">Mark on the chart</p>
          <Check on={marks.mine} onClick={() => toggle("mine")} label={`My swaps${counts.mine ? ` (${counts.mine})` : ""}`} swatch="#5cc08c" />
          <Check on={marks.dev} onClick={() => toggle("dev")} label={`Whale / Dev swaps${counts.dev ? ` (${counts.dev})` : ""}`} swatch="#c792ea" />
          <Check on={marks.top} onClick={() => toggle("top")} label={`Top 10 holders${counts.top ? ` (${counts.top})` : ""}`} swatch="#ffd166" />
          <Check on={settings.clearingLine} onClick={() => onChange({ ...settings, clearingLine: !settings.clearingLine })} label="Batch floor" swatch="#f3f3f0" />
          <label className="mt-1 flex items-center justify-between gap-2 border-t border-line px-1.5 pt-2 text-[11.5px] text-dim">
            Smallest trade marked
            <select
              value={settings.minUsd}
              onChange={(e) => onChange({ ...settings, minUsd: Number(e.target.value) })}
              className="rounded-[3px] border border-line-2 bg-void px-1 py-0.5 font-mono text-[11px] text-chrome outline-none"
            >
              {MIN_SIZES.map((m) => (
                <option key={m.label} value={m.usd}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </Popover>
  );
}
