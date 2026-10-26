"use client";

import { useState } from "react";
import { INTERVALS } from "@/lib/candles";
import { STUDIES, type StudyId } from "@/lib/indicators";
import type { ChartConfig, ChartType, Units } from "./settings";
import { Icon, MenuItem, Popover, Sep, Tool } from "./ui";

const TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "hollow", label: "Hollow candles" },
  { id: "bars", label: "Bars" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
];

/** The chart's top control bar. Every change to the config is one undo step. */
export function Toolbar({
  config,
  set,
  undo,
  redo,
  canUndo,
  canRedo,
  view,
  setView,
  full,
  onFull,
  onSnapshot,
  onSettings,
  onAddAlert,
  formatInput,
  live,
}: {
  config: ChartConfig;
  set: (fn: (c: ChartConfig) => ChartConfig) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  view: "chart" | "table";
  setView: (v: "chart" | "table") => void;
  full: boolean;
  onFull: () => void;
  onSnapshot: () => void;
  onSettings: () => void;
  /** Adds a price alert from a value typed in the current units; returns an error to show, or null. */
  onAddAlert: (value: string) => string | null;
  /** The current price in the current units, prefilled in the alert box. */
  formatInput: string;
  live: boolean;
}) {
  const type = TYPES.find((t) => t.id === config.type) ?? TYPES[0];
  const toggleStudy = (id: StudyId) =>
    set((c) => ({ ...c, studies: c.studies.includes(id) ? c.studies.filter((s) => s !== id) : [...c.studies, id] }));

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1.5 pb-2">
      <div role="radiogroup" aria-label="Timeframe" className="flex flex-wrap items-center gap-0.5">
        {[{ seconds: "auto" as const, label: "Auto" }, ...INTERVALS].map((i) => (
          <button
            key={i.label}
            type="button"
            role="radio"
            aria-checked={config.interval === i.seconds}
            onClick={() => set((c) => ({ ...c, interval: i.seconds }))}
            className={`rounded-[3px] px-1.5 py-1 font-mono text-[11px] transition-colors ${config.interval === i.seconds ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"}`}
          >
            {i.label}
          </button>
        ))}
      </div>
      <Sep />
      <Popover
        width="w-44"
        button={(open, toggle) => (
          <Tool label={`Chart style: ${type.label}`} active={open} onClick={toggle}>
            <span className="flex items-center gap-1">
              {Icon[type.id]}
              {Icon.chevron}
            </span>
          </Tool>
        )}
      >
        {(close) =>
          TYPES.map((t) => (
            <MenuItem
              key={t.id}
              onClick={() => {
                set((c) => ({ ...c, type: t.id }));
                close();
              }}
            >
              <span className={config.type === t.id ? "text-signal" : "text-dim"}>{Icon[t.id]}</span>
              <span className={config.type === t.id ? "text-chrome" : ""}>{t.label}</span>
            </MenuItem>
          ))
        }
      </Popover>
      <Popover
        width="w-60"
        button={(open, toggle) => (
          <Tool label="Indicators" active={open || config.studies.length > 0} onClick={toggle}>
            <span className="flex items-center gap-1">
              <span className="font-display text-[13px] italic">ƒx</span>
              {config.studies.length > 0 && <span className="rounded-full bg-signal px-1 text-[9.5px] leading-[14px] text-void">{config.studies.length}</span>}
            </span>
          </Tool>
        )}
      >
        {() => (
          <div role="menu">
            {STUDIES.map((s) => (
              <MenuItem key={s.id} checked={config.studies.includes(s.id)} onClick={() => toggleStudy(s.id)}>
                {s.label}
                {s.pane === "pane" && <span className="text-[10px] text-dim">pane</span>}
              </MenuItem>
            ))}
            {config.studies.length > 0 && (
              <div className="mt-1 border-t border-line pt-1">
                <MenuItem danger onClick={() => set((c) => ({ ...c, studies: [] }))}>
                  Remove all indicators
                </MenuItem>
              </div>
            )}
          </div>
        )}
      </Popover>
      <Sep />
      <div role="radiogroup" aria-label="Show price or market cap" className="flex items-center gap-0.5 text-[11.5px]">
        {(["mcap", "price"] as Units[]).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={config.units === u}
            onClick={() => set((c) => ({ ...c, units: u }))}
            title={u === "mcap" ? "Market cap: price × total supply" : "Price per token"}
            className={`rounded-[3px] px-1.5 py-1 font-medium uppercase tracking-[0.1em] transition-colors ${config.units === u ? "text-[#4cc9f0]" : "text-dim hover:text-chrome"}`}
          >
            {u === "mcap" ? "MCap" : "Price"}
          </button>
        ))}
      </div>
      <Sep />
      <Tool label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        {Icon.undo}
      </Tool>
      <Tool label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
        {Icon.redo}
      </Tool>

      <div className="ml-auto flex items-center gap-0.5">
        {live && (
          <span className="mr-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-up">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" aria-hidden="true" />
            Live
          </span>
        )}
        <Popover
          align="right"
          width="w-32"
          button={(open, toggle) => (
            <Tool label="View" active={open} onClick={toggle} className="px-2">
              <span className="flex items-center gap-1 font-sans text-[11.5px]">
                {view === "chart" ? "Chart" : "Table"}
                {Icon.chevron}
              </span>
            </Tool>
          )}
        >
          {(close) =>
            (["chart", "table"] as const).map((v) => (
              <MenuItem
                key={v}
                onClick={() => {
                  setView(v);
                  close();
                }}
              >
                <span className={view === v ? "text-chrome" : ""}>{v === "chart" ? "Chart" : "Table view"}</span>
              </MenuItem>
            ))
          }
        </Popover>
        <AlertButton onAdd={onAddAlert} prefill={formatInput} count={config.alerts.length} onClear={() => set((c) => ({ ...c, alerts: [] }))} />
        <Tool label="Chart settings" onClick={onSettings}>
          {Icon.gear}
        </Tool>
        <Tool label="Copy a snapshot of the chart" onClick={onSnapshot}>
          {Icon.camera}
        </Tool>
        <Tool label={full ? "Exit fullscreen" : "Fullscreen"} active={full} onClick={onFull}>
          {full ? Icon.shrink : Icon.expand}
        </Tool>
      </div>
    </div>
  );
}

function AlertButton({ onAdd, prefill, count, onClear }: { onAdd: (v: string) => string | null; prefill: string; count: number; onClear: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Popover
      align="right"
      width="w-64"
      button={(open, toggle) => (
        <Tool
          label="Price alert"
          active={open || count > 0}
          onClick={() => {
            if (!open) {
              setValue(prefill);
              setError(null);
            }
            toggle();
          }}
        >
          <span className="flex items-center gap-1">
            {Icon.alert}
            {count > 0 && <span className="text-[10px]">{count}</span>}
          </span>
        </Tool>
      )}
    >
      {(close) => (
        <form
          className="p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const err = onAdd(value);
            setError(err);
            if (!err) close();
          }}
        >
          <label htmlFor="chart-alert" className="text-[11.5px] text-muted">
            Alert when it crosses
          </label>
          <input
            id="chart-alert"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-[4px] border border-line bg-void px-2 py-1.5 font-mono text-[12.5px] text-chrome outline-none focus:border-line-2"
          />
          {error && <p className="mt-1 text-[11px] text-down">{error}</p>}
          <p className="mt-1.5 text-[10.5px] leading-snug text-dim">A browser notification while this page is open, and a line on the chart.</p>
          <div className="mt-2 flex gap-1.5">
            <button type="submit" className="flex-1 rounded-[4px] bg-signal px-2 py-1.5 text-[12px] font-semibold text-void">
              Add alert
            </button>
            {count > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  close();
                }}
                className="rounded-[4px] border border-line-2 px-2 py-1.5 text-[12px] text-muted hover:text-chrome"
              >
                Clear {count}
              </button>
            )}
          </div>
        </form>
      )}
    </Popover>
  );
}
