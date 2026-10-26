"use client";

import type { ChartSettings } from "./settings";

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

/** Under the chart: which on-chain trades and levels to draw on the candles, and the smallest trade worth marking. */
export function OverlaysBar({ settings, onChange, counts }: { settings: ChartSettings; onChange: (s: ChartSettings) => void; counts: { mine: number; dev: number; top: number } }) {
  const marks = settings.marks;
  const toggle = (k: keyof ChartSettings["marks"]) => onChange({ ...settings, marks: { ...marks, [k]: !marks[k] } });
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-x border-b border-line px-1.5 py-1">
      <span className="mr-1 text-[11px] text-dim">Chart overlays</span>
      <Check on={marks.mine} onClick={() => toggle("mine")} label={`My swaps${counts.mine ? ` (${counts.mine})` : ""}`} swatch="#5cc08c" />
      <Check on={marks.dev} onClick={() => toggle("dev")} label={`Whale / Dev swaps${counts.dev ? ` (${counts.dev})` : ""}`} swatch="#c792ea" />
      <Check on={settings.clearingLine} onClick={() => onChange({ ...settings, clearingLine: !settings.clearingLine })} label="Batch floor" swatch="#f3f3f0" />
      <Check on={marks.top} onClick={() => toggle("top")} label={`Top 10 holders${counts.top ? ` (${counts.top})` : ""}`} swatch="#ffd166" />
      <label className="ml-auto flex items-center gap-1.5 text-[11px] text-dim">
        <span aria-hidden="true">▽</span> Min size
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
  );
}
