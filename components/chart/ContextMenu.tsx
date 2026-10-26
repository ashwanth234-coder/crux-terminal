"use client";

import { useEffect, useRef } from "react";
import { MenuItem } from "./ui";

export type ContextAt = { x: number; y: number; price: number | null; time: number | null };

/** The chart's right-click menu, at the click, in the terminal's own style. */
export function ContextMenu({
  at,
  fmt,
  onClose,
  onReset,
  onCopyPrice,
  onLockTime,
  lockedTime,
  onTable,
  studies,
  onRemoveStudies,
  marksHidden,
  onToggleMarks,
  onSettings,
  drawings,
  onRemoveDrawings,
  onResetLayout,
}: {
  at: ContextAt;
  fmt: (v: number) => string;
  onClose: () => void;
  onReset: () => void;
  onCopyPrice: (price: number) => void;
  onLockTime: (time: number | null) => void;
  lockedTime: number | null;
  onTable: () => void;
  studies: number;
  onRemoveStudies: () => void;
  marksHidden: boolean;
  onToggleMarks: () => void;
  onSettings: () => void;
  drawings: number;
  onRemoveDrawings: () => void;
  onResetLayout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: at.x, top: at.y }}
      className="absolute z-40 w-60 rounded-[5px] border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem onClick={act(onReset)} hint="Alt+R">
        ↺ Reset chart view
      </MenuItem>
      {at.price !== null && (
        <MenuItem onClick={act(() => onCopyPrice(at.price!))}>
          Copy <span className="font-mono">{fmt(at.price)}</span>
        </MenuItem>
      )}
      {lockedTime !== null ? (
        <MenuItem onClick={act(() => onLockTime(null))}>Unlock vertical line</MenuItem>
      ) : (
        at.time !== null && <MenuItem onClick={act(() => onLockTime(at.time))}>Lock vertical line at this time</MenuItem>
      )}
      <div className="my-1 border-t border-line" />
      <MenuItem onClick={act(onTable)}>Table view</MenuItem>
      {studies > 0 && <MenuItem onClick={act(onRemoveStudies)}>Remove {studies} indicator{studies === 1 ? "" : "s"}</MenuItem>}
      {drawings > 0 && <MenuItem onClick={act(onRemoveDrawings)}>Remove {drawings} drawing{drawings === 1 ? "" : "s"}</MenuItem>}
      <MenuItem onClick={act(onToggleMarks)}>{marksHidden ? "Show marks on bars" : "Hide marks on bars"}</MenuItem>
      <div className="my-1 border-t border-line" />
      <MenuItem onClick={act(onResetLayout)}>Reset this token&apos;s layout</MenuItem>
      <MenuItem onClick={act(onSettings)}>⚙ Settings…</MenuItem>
    </div>
  );
}
