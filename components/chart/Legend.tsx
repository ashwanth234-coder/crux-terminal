"use client";

import { useState } from "react";
import type { Candle } from "@/lib/candles";
import type { StudyLine } from "@/lib/indicators";
import { Icon } from "./ui";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Top-left of the chart: the hovered candle (or the latest) as O H L C with its change, the volume, and every active
 * indicator's value at that candle (collapsible).
 */
export function Legend({
  title,
  candle,
  k,
  fmt,
  lines,
  index,
  inset = false,
}: {
  title: string;
  candle: Candle | null;
  k: number;
  fmt: (v: number) => string;
  /** Active studies' outputs and whether each is in price units (scaled by k). */
  lines: { line: StudyLine; priced: boolean }[];
  index: number;
  /** Shifted right, clear of the open drawing toolbar. */
  inset?: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (!candle) return null;
  const delta = candle.close - candle.open;
  const pct = candle.open > 0 ? (delta / candle.open) * 100 : 0;
  const tone = delta < 0 ? "text-down" : "text-up";
  return (
    <div className={`pointer-events-none absolute top-1.5 z-10 max-w-[calc(100%-6rem)] ${inset ? "left-12" : "left-2"} font-mono text-[11px] leading-snug`}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-chrome/90">{title}</span>
        <span>
          <span className="text-dim">O</span> <span className={tone}>{fmt(candle.open * k)}</span>
        </span>
        <span>
          <span className="text-dim">H</span> <span className={tone}>{fmt(candle.high * k)}</span>
        </span>
        <span>
          <span className="text-dim">L</span> <span className={tone}>{fmt(candle.low * k)}</span>
        </span>
        <span>
          <span className="text-dim">C</span> <span className={tone}>{fmt(candle.close * k)}</span>
        </span>
        <span className={tone}>
          {delta >= 0 ? "+" : "−"}
          {fmt(Math.abs(delta * k))} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%)
        </span>
      </p>
      <p className="flex items-center gap-1.5 text-muted">
        <span>
          <span className="text-dim">Vol</span> ${candle.volume.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          <span className="text-dim"> · {candle.trades} trade{candle.trades === 1 ? "" : "s"}</span>
        </span>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Hide indicator values" : "Show indicator values"}
            className={`pointer-events-auto text-dim transition-transform hover:text-chrome ${open ? "rotate-180" : ""}`}
          >
            {Icon.chevron}
          </button>
        )}
      </p>
      {open && lines.length > 0 && (
        <p className="flex flex-wrap gap-x-2.5">
          {lines.map(({ line, priced }) => {
            const v = line.values[index];
            return (
              <span key={line.key} style={{ color: line.color }}>
                {line.label} <span className={v == null ? "text-dim" : ""}>{v == null ? "…" : priced ? fmt(v * k) : Math.abs(v) >= 1_000 ? compact.format(v) : Number.isInteger(v) ? v : v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}</span>
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
