"use client";

import type { Drawing } from "./drawings";
import { TOOL_INFO } from "./DrawingPalette";
import { TOOL_COLOR } from "./drawings";

const SWATCHES = ["#f3f3f0", "#ffd166", "#4cc9f0", "#5cc08c", "#e5484d", "#c792ea", "#ff9d6e"];

/**
 * The selected drawing's floating bar: its colour, an alert at its level (a line) or at its target and stop (a
 * position), edit text, duplicate and delete. Delete / Backspace and Esc work from the keyboard too.
 */
export function DrawingBar({
  drawing,
  x,
  y,
  onColor,
  onAlert,
  onEditText,
  onDuplicate,
  onDelete,
}: {
  drawing: Drawing;
  x: number;
  y: number;
  onColor: (c: string) => void;
  onAlert: (() => void) | null;
  onEditText: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const current = drawing.color ?? TOOL_COLOR[drawing.tool];
  const btn = "grid h-7 min-w-7 place-items-center rounded-[3px] px-1.5 text-[11px] text-muted transition-colors hover:bg-tint/[0.06] hover:text-chrome";
  return (
    <div
      role="toolbar"
      aria-label={`${TOOL_INFO[drawing.tool].label} options`}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      // Kept inside the chart: never further right than its own width allows.
      style={{ left: `min(${x}px, calc(100% - 340px))`, top: y }}
      className="absolute z-30 flex items-center gap-0.5 rounded-[5px] border border-line-2 bg-panel-2/95 p-0.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)]"
    >
      <span className="px-1.5 text-dim" aria-hidden="true">
        {TOOL_INFO[drawing.tool].icon}
      </span>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          aria-pressed={current === c}
          onClick={() => onColor(c)}
          className={`grid h-7 w-5 place-items-center rounded-[3px] ${current === c ? "bg-tint/[0.08]" : "hover:bg-tint/[0.05]"}`}
        >
          <span className="h-3 w-3 rounded-full" style={{ background: c, boxShadow: current === c ? "0 0 0 1.5px #0a0b0d, 0 0 0 2.5px #f3f3f0" : undefined }} />
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      {onAlert && (
        <button type="button" onClick={onAlert} className={btn} title={drawing.tool === "long" || drawing.tool === "short" ? "Alert me at the target and the stop" : "Alert me when price crosses this line"}>
          {drawing.tool === "long" || drawing.tool === "short" ? "Alerts" : "Alert"}
        </button>
      )}
      {onEditText && (
        <button type="button" onClick={onEditText} className={btn}>
          Edit
        </button>
      )}
      <button type="button" onClick={onDuplicate} className={btn} title="Duplicate">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" onClick={onDelete} className={`${btn} hover:!bg-down/10 hover:!text-down`} title="Delete (Del)" aria-label="Delete drawing">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
