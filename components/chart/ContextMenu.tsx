"use client";

import { useEffect, useRef } from "react";
import type { ChartOrderKind } from "@/lib/chartOrders";
import type { ScaleMode } from "./settings";
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
  orders,
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
  /** Trading from the chart (Crux launches): the market's price in chart units, and how to open an order at a price. */
  orders?: { last: number | null; onOrder: (kind: ChartOrderKind, price: number) => void };
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
      {orders && at.price !== null && orders.last !== null && (
        <>
          <div className="my-1 border-t border-line" />
          {at.price > orders.last ? (
            <MenuItem onClick={act(() => orders.onOrder("takeProfit", at.price!))}>
              <span className="text-up">Take profit</span> at <span className="font-mono">{fmt(at.price)}</span>
            </MenuItem>
          ) : (
            <>
              <MenuItem onClick={act(() => orders.onOrder("stopLoss", at.price!))}>
                <span className="text-down">Stop loss</span> at <span className="font-mono">{fmt(at.price)}</span>
              </MenuItem>
              <MenuItem onClick={act(() => orders.onOrder("dip", at.price!))}>
                <span className="text-up">Buy the dip</span> at <span className="font-mono">{fmt(at.price)}</span>
              </MenuItem>
            </>
          )}
          <div className="my-1 border-t border-line" />
        </>
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

/** Right-click on the price axis: how prices are scaled, as on a trading terminal. */
export function ScaleMenu({
  at,
  onClose,
  auto,
  onAuto,
  onReset,
  scale,
  setScale,
  inverted,
  onInvert,
}: {
  at: { x: number; y: number };
  onClose: () => void;
  auto: boolean;
  onAuto: () => void;
  onReset: () => void;
  scale: ScaleMode;
  setScale: (m: ScaleMode) => void;
  inverted: boolean;
  onInvert: () => void;
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
  const tick = (on: boolean) => <span className={`inline-block w-3.5 text-signal ${on ? "" : "invisible"}`}>✓</span>;
  const MODES: { mode: ScaleMode; label: string; hint?: string }[] = [
    { mode: "normal", label: "Regular" },
    { mode: "percent", label: "Percent" },
    { mode: "indexed", label: "Indexed to 100" },
    { mode: "log", label: "Logarithmic" },
  ];
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Price scale"
      style={{ left: at.x, top: at.y }}
      className="absolute z-40 w-56 rounded-[5px] border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem onClick={act(onAuto)} hint="Alt+A">
        {tick(auto)} Auto (fits data to screen)
      </MenuItem>
      <MenuItem onClick={act(onReset)} hint="Alt+R">
        {tick(false)} Reset price scale
      </MenuItem>
      <div className="my-1 border-t border-line" />
      {MODES.map((m) => (
        <MenuItem key={m.mode} onClick={act(() => setScale(m.mode))} hint={m.hint}>
          {tick(scale === m.mode)} {m.label}
        </MenuItem>
      ))}
      <div className="my-1 border-t border-line" />
      <MenuItem onClick={act(onInvert)} hint="Alt+I">
        {tick(inverted)} Invert scale
      </MenuItem>
    </div>
  );
}
