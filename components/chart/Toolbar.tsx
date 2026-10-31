"use client";

import { useState, type ReactNode } from "react";
import { INTERVALS } from "@/lib/candles";
import { STUDIES, STUDY_GROUPS, isStudyId, type StudyId } from "@/lib/indicators";
import type { ChartConfig, ChartType, Units } from "./settings";
import { Icon, MenuItem, Popover, Sep, Tool } from "./ui";
import { PushSwitch } from "./PushSwitch";

const FAV_KEY = "crux:chart:fav-studies:v1";
const TF_GROUPS = [
  { label: "Seconds", from: 1, to: 60 },
  { label: "Minutes", from: 60, to: 3_600 },
  { label: "Hours", from: 3_600, to: 86_400 },
  { label: "Days", from: 86_400, to: Infinity },
];
const longLabel = (s: number) =>
  s < 60 ? `${s} second${s === 1 ? "" : "s"}` : s < 3_600 ? `${s / 60} minute${s === 60 ? "" : "s"}` : s < 86_400 ? `${s / 3_600} hour${s === 3_600 ? "" : "s"}` : `${s / 86_400} day${s === 86_400 ? "" : "s"}`;

/** Chart styles in TradingView's order and groups (a rule between groups). */
const TYPES: { id: ChartType; label: string; rule?: boolean }[] = [
  { id: "bars", label: "Bars" },
  { id: "candles", label: "Candles" },
  { id: "hollow", label: "Hollow candles" },
  { id: "hlc", label: "HLC bars" },
  { id: "line", label: "Line", rule: true },
  { id: "linemarkers", label: "Line with markers" },
  { id: "step", label: "Step line" },
  { id: "area", label: "Area", rule: true },
  { id: "hlcarea", label: "HLC area" },
  { id: "baseline", label: "Baseline" },
  { id: "columns", label: "Columns", rule: true },
  { id: "highlow", label: "High-low" },
  { id: "heikin", label: "Heikin Ashi", rule: true },
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
  replaying,
  onReplay,
  symbolSlot,
  compareSlot,
  templatesSlot,
  overlaysSlot,
  layoutSlot,
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
  replaying: boolean;
  onReplay: () => void;
  /** The compare button (it reads the launch list, so the chart provides it). */
  /** The symbol button at the start of the row (SymbolSwitch). */
  symbolSlot?: ReactNode;
  compareSlot?: ReactNode;
  /** Saved layouts (TemplatesButton). */
  templatesSlot?: ReactNode;
  /** Which on-chain trades and levels the chart marks (OverlaysButton). */
  overlaysSlot?: ReactNode;
  /** The multi-chart layout picker. */
  layoutSlot?: ReactNode;
}) {
  const type = TYPES.find((t) => t.id === config.type) ?? TYPES[0];
  const [query, setQuery] = useState("");
  // Favourite indicators (★), listed first in the menu; kept in this browser.
  const [favs, setFavs] = useState<StudyId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
      return Array.isArray(saved) ? saved.filter(isStudyId) : [];
    } catch {
      return [];
    }
  });
  const toggleFav = (id: StudyId) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: favourites last for this visit.
    }
  };
  const toggleStudy = (id: StudyId) =>
    set((c) => ({ ...c, studies: c.studies.some((s) => s.id === id) ? c.studies.filter((s) => s.id !== id) : [...c.studies, { id }] }));

  return (
    // One row, as on a trading terminal: it scrolls sideways on a narrow screen instead of wrapping (menus open fixed, so
    // the scroll never clips them).
    <div className="relative flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-line bg-panel px-1.5 [&>*]:shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {symbolSlot && (
        <>
          {symbolSlot}
          <Sep />
        </>
      )}
      {/* The timeframe, as on TradingView: one button showing the current interval, every interval in its menu. */}
      <div role="group" aria-label="Timeframe" className="flex shrink-0 items-center">
        <Popover
          width="w-48"
          button={(open, toggle) => (
            <Tool label={`Timeframe: ${config.interval === "auto" ? "Auto" : longLabel(config.interval)}`} active={open} onClick={toggle} className="px-2">
              <span className="flex items-center gap-1 font-mono text-[11.5px] text-chrome">
                {config.interval === "auto" ? "Auto" : (INTERVALS.find((i) => i.seconds === config.interval)?.label ?? "Auto")}
                {Icon.chevron}
              </span>
            </Tool>
          )}
        >
          {(close) => (
            <div role="menu" className="max-h-[min(60vh,440px)] overflow-y-auto">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={config.interval === "auto"}
                onClick={() => {
                  set((c) => ({ ...c, interval: "auto" }));
                  close();
                }}
                className={`w-full rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-tint/[0.05] ${config.interval === "auto" ? "text-signal" : "text-chrome/85"}`}
              >
                Auto <span className="text-dim">· fits the history</span>
              </button>
              {TF_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-[0.14em] text-dim">{g.label}</p>
                  {INTERVALS.filter((i) => i.seconds >= g.from && i.seconds < g.to).map((i) => (
                    <button
                      key={i.seconds}
                      type="button"
                      role="menuitemradio"
                      aria-checked={config.interval === i.seconds}
                      onClick={() => {
                        set((c) => ({ ...c, interval: i.seconds }));
                        close();
                      }}
                      className={`flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-tint/[0.05] ${config.interval === i.seconds ? "text-signal" : "text-chrome/85"}`}
                    >
                      {longLabel(i.seconds)}
                      <span className="font-mono text-[10.5px] text-dim">{i.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Popover>
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
            <div key={t.id} className={t.rule ? "mt-1 border-t border-line pt-1" : ""}>
              <MenuItem
                onClick={() => {
                  set((c) => ({ ...c, type: t.id }));
                  close();
                }}
              >
                <span className={config.type === t.id ? "text-signal" : "text-dim"}>{Icon[t.id]}</span>
                <span className={config.type === t.id ? "text-chrome" : ""}>{t.label}</span>
              </MenuItem>
            </div>
          ))
        }
      </Popover>
      <Popover
        width="w-72"
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
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search indicators"
              aria-label="Search indicators"
              className="mb-1 w-full rounded-[3px] border border-line-2 bg-void/60 px-2 py-1 text-[12px] text-chrome outline-none placeholder:text-dim focus:border-chrome/50"
            />
            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
              {(["Favourites", ...STUDY_GROUPS] as const).map((g) => {
                const q = query.trim().toLowerCase();
                const items = STUDIES.filter(
                  (s) => (g === "Favourites" ? favs.includes(s.id) : s.group === g) && `${s.label} ${s.hint ?? ""} ${s.group}`.toLowerCase().includes(q),
                );
                if (items.length === 0) return null;
                return (
                  <div key={g}>
                    <p className={`px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-[0.14em] ${g === "On-chain" ? "text-signal" : g === "Favourites" ? "text-[#ffd166]" : "text-dim"}`}>
                      {g}
                      {g === "On-chain" && <span className="ml-1.5 normal-case tracking-normal text-dim">from this token&apos;s own chain data</span>}
                    </p>
                    {items.map((s) => (
                      <div key={s.id} className="group flex items-center">
                        <button
                          type="button"
                          aria-pressed={favs.includes(s.id)}
                          aria-label={favs.includes(s.id) ? `Remove ${s.label} from favourites` : `Add ${s.label} to favourites`}
                          onClick={() => toggleFav(s.id)}
                          className={`px-1 text-[13px] transition-colors ${favs.includes(s.id) ? "text-[#ffd166]" : "text-dim opacity-0 hover:text-chrome group-hover:opacity-100"}`}
                        >
                          {favs.includes(s.id) ? "★" : "☆"}
                        </button>
                        <div className="min-w-0 flex-1">
                          <MenuItem checked={config.studies.some((x) => x.id === s.id)} onClick={() => toggleStudy(s.id)}>
                            <span className="flex flex-col">
                              <span>{s.label}</span>
                              {s.hint && <span className="text-[10.5px] text-dim">{s.hint}</span>}
                            </span>
                            {s.pane === "pane" && <span className="text-[10px] text-dim">pane</span>}
                          </MenuItem>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
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
      {compareSlot}
      {templatesSlot}
      {overlaysSlot}
      <Sep />
      <div role="radiogroup" aria-label="Show price or market cap" className="flex shrink-0 items-center gap-0.5 text-[11.5px]">
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
      <Sep />
      <Tool label={replaying ? "Leave bar replay" : "Bar replay: pick a bar, then play the market forward from it"} active={replaying} onClick={onReplay}>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M3 3v10M6 3.5v9l7-4.5-7-4.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <span className="hidden 2xl:inline">Replay</span>
        </span>
      </Tool>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        {live && (
          <span title="Live: updates as trades land" className="mr-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-up">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" aria-hidden="true" />
            <span className="sr-only 2xl:not-sr-only">Live</span>
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
        {layoutSlot}
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
          <div className="mt-1.5">
            <PushSwitch />
          </div>
          <div className="mt-2 flex gap-1.5">
            <button type="submit" className="flex-1 rounded-[4px] bg-signal px-2 py-1.5 text-[12px] font-semibold text-on-signal glow-signal hover:bg-signal-lift">
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
