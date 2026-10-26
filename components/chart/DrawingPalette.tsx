"use client";

import type { ReactNode } from "react";
import type { DrawTool } from "./drawings";

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
    {d}
  </svg>
);

const TOOLS: { id: DrawTool; label: string; icon: ReactNode }[] = [
  {
    id: "ray",
    label: "Horizontal price ray",
    icon: svg(
      <>
        <circle cx="3.5" cy="8" r="1.6" fill="currentColor" />
        <path d="M3.5 8h11" stroke="currentColor" strokeWidth="1.3" />
      </>,
    ),
  },
  {
    id: "trend",
    label: "Trendline",
    icon: svg(
      <>
        <path d="m3 12.5 10-9" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="3" cy="12.5" r="1.5" fill="currentColor" />
        <circle cx="13" cy="3.5" r="1.5" fill="currentColor" />
      </>,
    ),
  },
  {
    id: "ruler",
    label: "Price range (% ruler)",
    icon: svg(
      <>
        <rect x="3" y="4" width="10" height="8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 5.5v5M6.5 7 8 5.5 9.5 7" stroke="currentColor" strokeWidth="1.1" fill="none" />
      </>,
    ),
  },
  {
    id: "fib",
    label: "Fib retracement",
    icon: svg(<path d="M2.5 3.5h11M2.5 6.5h11M2.5 9h11M2.5 12.5h11" stroke="currentColor" strokeWidth="1.1" />),
  },
];

/**
 * Drawing tools, out of the way: a small tab on the chart's left edge; open, a floating column of tools. The chart's
 * left edge stays clear until it's wanted.
 */
export function DrawingPalette({
  open,
  setOpen,
  tool,
  setTool,
  count,
  onClear,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  tool: DrawTool | null;
  setTool: (t: DrawTool | null) => void;
  count: number;
  onClear: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show drawing tools"
        title="Drawing tools"
        className="absolute left-0 top-1/2 z-20 grid h-10 w-3.5 -translate-y-1/2 place-items-center rounded-r-[4px] border border-l-0 border-line-2 bg-panel-2/90 text-dim transition-colors hover:w-4 hover:text-chrome"
      >
        <svg viewBox="0 0 8 12" className="h-2.5 w-2" aria-hidden="true">
          <path d="m2 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    );
  }
  return (
    <div className="absolute left-1.5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-0.5 rounded-[5px] border border-line-2 bg-panel-2/95 p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)]" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTool(tool === t.id ? null : t.id)}
          className={`grid h-8 w-8 place-items-center rounded-[3px] transition-colors ${tool === t.id ? "bg-signal/15 text-signal ring-1 ring-inset ring-signal/60" : "text-muted hover:bg-white/[0.05] hover:text-chrome"}`}
        >
          {t.icon}
        </button>
      ))}
      <span className="my-0.5 h-px bg-line" aria-hidden="true" />
      <button
        type="button"
        disabled={count === 0}
        onClick={onClear}
        aria-label={`Clear ${count} drawing${count === 1 ? "" : "s"}`}
        title="Clear all drawings"
        className="grid h-8 w-8 place-items-center rounded-[3px] text-muted transition-colors hover:bg-down/10 hover:text-down disabled:opacity-30"
      >
        {svg(<path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />)}
      </button>
      <button
        type="button"
        onClick={() => {
          setTool(null);
          setOpen(false);
        }}
        aria-label="Hide drawing tools"
        title="Hide"
        className="grid h-6 w-8 place-items-center rounded-[3px] text-dim hover:text-chrome"
      >
        <svg viewBox="0 0 8 12" className="h-2.5 w-2" aria-hidden="true">
          <path d="m6 2-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  );
}
