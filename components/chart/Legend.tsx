"use client";

import { useState } from "react";
import type { Candle } from "@/lib/candles";
import type { StudyId, StudyLine } from "@/lib/indicators";
import { Icon } from "./ui";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export type LegendStudy = { id: StudyId; title: string; hidden: boolean; priced: boolean; lines: StudyLine[] };

export type LegendShow = { ohlc: boolean; change: boolean; volume: boolean; studies: boolean };

const btn = "pointer-events-auto grid h-4 w-4 place-items-center rounded-[2px] text-dim hover:bg-white/[0.08] hover:text-chrome";

/**
 * Top-left of the chart: the hovered candle (or the latest) as O H L C with its change, the volume, and one row per
 * indicator with its settings and values at that candle. Hovering a row shows hide, settings and remove, as on
 * TradingView; the name opens its settings.
 */
export function Legend({
  title,
  candle,
  k,
  fmt,
  studies,
  index,
  inset = false,
  show = { ohlc: true, change: true, volume: true, studies: true },
  onSettings,
  onToggle,
  onRemove,
  compares = [],
}: {
  title: string;
  candle: Candle | null;
  k: number;
  fmt: (v: number) => string;
  studies: LegendStudy[];
  index: number;
  /** Shifted right, clear of the open drawing toolbar. */
  inset?: boolean;
  /** What the status line shows (chart settings). */
  show?: LegendShow;
  onSettings: (id: StudyId) => void;
  onToggle: (id: StudyId) => void;
  onRemove: (id: StudyId) => void;
  /** Compared tokens, each with its change over the view and a remove button. */
  compares?: { key: string; label: string; color: string; onRemove: () => void }[];
}) {
  const [open, setOpen] = useState(true);
  if (!candle) return null;
  const delta = candle.close - candle.open;
  const pct = candle.open > 0 ? (delta / candle.open) * 100 : 0;
  const tone = delta < 0 ? "text-down" : "text-up";
  const value = (v: number | null | undefined, priced: boolean) =>
    v == null ? "…" : priced ? fmt(v * k) : Math.abs(v) >= 1_000 ? compact.format(v) : Number.isInteger(v) ? v : v.toFixed(Math.abs(v) >= 100 ? 0 : 1);
  return (
    <div className={`pointer-events-none absolute top-1.5 z-10 max-w-[calc(100%-6rem)] ${inset ? "left-12" : "left-2"} font-mono text-[11px] leading-snug`}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-chrome/90">{title}</span>
        {show.ohlc && (
          <>
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
          </>
        )}
        {show.change && (
          <span className={tone}>
            {delta >= 0 ? "+" : "−"}
            {fmt(Math.abs(delta * k))} ({pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%)
          </span>
        )}
      </p>
      <p className="flex items-center gap-1.5 text-muted">
        {show.volume && (
          <span>
            <span className="text-dim">Vol</span> ${candle.volume.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            <span className="text-dim"> · {candle.trades} trade{candle.trades === 1 ? "" : "s"}</span>
          </span>
        )}
        {studies.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Hide indicator rows" : "Show indicator rows"}
            className={`pointer-events-auto text-dim transition-transform hover:text-chrome ${open ? "rotate-180" : ""}`}
          >
            {Icon.chevron}
          </button>
        )}
      </p>
      {compares.length > 0 && (
        <p className="flex flex-wrap gap-x-2.5">
          {compares.map((c) => (
            <span key={c.key} className="group inline-flex items-center gap-1" style={{ color: c.color }}>
              vs {c.label}
              <button type="button" onClick={c.onRemove} className={`${btn} opacity-0 group-hover:opacity-100`} aria-label={`Stop comparing ${c.label}`}>
                ×
              </button>
            </span>
          ))}
        </p>
      )}
      {open &&
        show.studies &&
        studies.map((s) => (
          <div key={s.id} className="group flex flex-wrap items-center gap-x-2">
            <button
              type="button"
              onClick={() => onSettings(s.id)}
              className={`pointer-events-auto rounded-[2px] px-0.5 hover:bg-white/[0.06] ${s.hidden ? "text-dim line-through" : "text-chrome/80"}`}
              title="Settings"
            >
              {s.title}
            </button>
            {!s.hidden &&
              s.lines.map((l) => (
                <span key={l.key} style={{ color: l.color }}>
                  {s.lines.length > 1 && <span className="opacity-70">{l.label} </span>}
                  {value(l.values[index], s.priced)}
                </span>
              ))}
            <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" className={btn} onClick={() => onToggle(s.id)} aria-label={s.hidden ? `Show ${s.title}` : `Hide ${s.title}`} title={s.hidden ? "Show" : "Hide"}>
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                  <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  {s.hidden ? <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" /> : <circle cx="8" cy="8" r="1.8" fill="currentColor" />}
                </svg>
              </button>
              <button type="button" className={btn} onClick={() => onSettings(s.id)} aria-label={`${s.title} settings`} title="Settings">
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button type="button" className={btn} onClick={() => onRemove(s.id)} aria-label={`Remove ${s.title}`} title="Remove">
                ×
              </button>
            </span>
          </div>
        ))}
    </div>
  );
}
