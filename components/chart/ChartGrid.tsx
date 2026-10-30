"use client";

import { useMemo, useRef, useState, type ComponentProps } from "react";
import { SyncBus, type SyncOptions } from "./sync";
import { ProChart } from "./ProChart";
import { Popover, Tool } from "./ui";

export type GridLayout = "1" | "2h" | "2v" | "4";
const KEY = "crux:chart:grid:v1";
const SYNC_KEY = "crux:chart:grid-sync:v1";
const DEFAULT_SYNC: SyncOptions = { crosshair: true, time: false, interval: false };
const COUNT: Record<GridLayout, number> = { "1": 1, "2h": 2, "2v": 2, "4": 4 };
const GRID: Record<GridLayout, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2h": "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1",
  "2v": "grid-cols-1 grid-rows-2",
  "4": "grid-cols-1 grid-rows-4 md:grid-cols-2 md:grid-rows-2",
};
const ICONS: Record<GridLayout, string> = {
  "1": "M2.5 2.5h11v11h-11Z",
  "2h": "M2.5 2.5h11v11h-11ZM8 2.5v11",
  "2v": "M2.5 2.5h11v11h-11ZM2.5 8h11",
  "4": "M2.5 2.5h11v11h-11ZM8 2.5v11M2.5 8h11",
};
const LABEL: Record<GridLayout, string> = { "1": "One chart", "2h": "Two side by side", "2v": "Two stacked", "4": "Four" };

const icon = (l: GridLayout) => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
    <path d={ICONS[l]} fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/**
 * One, two or four charts of the token side by side, as TradingView's layouts: each keeps its own timeframe,
 * indicators and drawings (saved per slot). The layout button sits in every chart's toolbar; "Fullscreen" takes the
 * whole grid full screen.
 */
export function ChartGrid(props: Omit<ComponentProps<typeof ProChart>, "slot" | "layoutSlot" | "sync">) {
  const [bus] = useState(() => new SyncBus());
  const [opts, setOpts] = useState<SyncOptions>(() => {
    try {
      return { ...DEFAULT_SYNC, ...JSON.parse(localStorage.getItem(SYNC_KEY) ?? "{}") };
    } catch {
      return DEFAULT_SYNC;
    }
  });
  const toggleSync = (k: keyof SyncOptions) => {
    const next = { ...opts, [k]: !opts[k] };
    setOpts(next);
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  };
  const sync = useMemo(() => ({ bus, opts }), [bus, opts]);
  const [layout, setLayoutState] = useState<GridLayout>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v === "2h" || v === "2v" || v === "4" ? v : "1";
    } catch {
      return "1";
    }
  });
  const box = useRef<HTMLDivElement>(null);
  const setLayout = (l: GridLayout) => {
    setLayoutState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // Storage blocked: the layout lasts for this visit.
    }
  };
  const picker = (
    <Popover
      width="w-48"
      align="right"
      button={(open, toggle) => (
        <Tool label={`Layout: ${LABEL[layout]}`} active={open || layout !== "1"} onClick={toggle}>
          {icon(layout)}
        </Tool>
      )}
    >
      {(close) => (
        <div role="menu">
          {(Object.keys(LABEL) as GridLayout[]).map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={layout === l}
              onClick={() => {
                setLayout(l);
                close();
              }}
              className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[12px] hover:bg-tint/[0.05] ${layout === l ? "text-signal" : "text-chrome/85"}`}
            >
              {icon(l)} {LABEL[l]}
            </button>
          ))}
          {layout !== "1" && (
            <div className="mt-1 border-t border-line pt-1">
              <p className="px-2 pb-0.5 text-[10px] uppercase tracking-[0.14em] text-dim">Sync across charts</p>
              {(
                [
                  ["crosshair", "Crosshair"],
                  ["time", "Scroll and zoom"],
                  ["interval", "Timeframe"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={opts[k]}
                  onClick={() => toggleSync(k)}
                  className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 text-left text-[12px] text-chrome/85 hover:bg-tint/[0.05]"
                >
                  {label}
                  <span className={`font-mono text-[10.5px] ${opts[k] ? "text-signal" : "text-dim"}`}>{opts[k] ? "on" : "off"}</span>
                </button>
              ))}
            </div>
          )}
          {layout !== "1" && (
            <button
              type="button"
              onClick={() => {
                close();
                if (document.fullscreenElement) void document.exitFullscreen();
                else void box.current?.requestFullscreen();
              }}
              className="mt-1 w-full rounded-[3px] border-t border-line px-2 pt-1.5 text-left text-[12px] text-muted hover:text-chrome"
            >
              Fullscreen all charts
            </button>
          )}
        </div>
      )}
    </Popover>
  );
  return (
    <div ref={box} className={`grid h-full min-h-[inherit] gap-2 bg-void ${GRID[layout]}`}>
      {Array.from({ length: COUNT[layout] }, (_, i) => (
        <div key={i} className="min-h-0 min-w-0">
          <ProChart {...props} slot={i} layoutSlot={picker} sync={COUNT[layout] > 1 ? sync : undefined} />
        </div>
      ))}
    </div>
  );
}
