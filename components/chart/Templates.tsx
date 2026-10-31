"use client";

import { useState } from "react";
import { readInstances, type StudyInstance } from "@/lib/indicators";
import { CHART_TYPES, type ChartConfig, type ChartType, type Units } from "./settings";
import { Popover, Tool } from "./ui";

/**
 * Saved layouts, as a trading terminal keeps them: a name for a chart setup (its indicators with their settings, the
 * chart type, timeframe and units) that applies to any token in one click. Drawings stay with their own token. Kept in
 * this browser.
 */
type Template = { name: string; interval: number | "auto"; type: ChartType; units: Units; studies: StudyInstance[] };

const KEY = "crux:chart:templates:v1";
const MAX = 30;

function load(): Template[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((t): t is Template => t && typeof t.name === "string" && t.name.trim() !== "")
      .map((t) => ({
        name: t.name.slice(0, 40),
        interval: t.interval === "auto" || (typeof t.interval === "number" && t.interval > 0) ? t.interval : "auto",
        type: CHART_TYPES.includes(t.type) ? t.type : "candles",
        units: (t.units === "price" ? "price" : "mcap") as Units,
        studies: readInstances(t.studies),
      }))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function save(list: Template[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the layouts last for this visit.
  }
}

export function TemplatesButton({ config, set }: { config: ChartConfig; set: (fn: (c: ChartConfig) => ChartConfig) => void }) {
  const [list, setList] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const update = (next: Template[]) => {
    setList(next);
    save(next);
  };
  const apply = (t: Template) =>
    set((c) => {
      const ids = new Set(t.studies.map((s) => s.id));
      return { ...c, interval: t.interval, type: t.type, units: t.units, studies: t.studies, rules: c.rules.filter((r) => ids.has(r.study)) };
    });

  return (
    <Popover
      width="w-64"
      button={(open, toggle) => (
        <Tool
          label="Saved layouts: your indicators, chart type and timeframe, for any token"
          active={open}
          onClick={() => {
            if (!open) setList(load());
            toggle();
          }}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M2.5 2.5h8l3 3v8h-11v-11Z M5 2.5v4h5v-4 M5 13.5v-4h6v4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </Tool>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-1 p-1">
          <p className="px-1.5 pt-0.5 text-[10px] uppercase tracking-[0.14em] text-dim">Saved layouts</p>
          {list.length === 0 ? (
            <p className="px-1.5 py-1 text-[11.5px] leading-relaxed text-dim">None yet. Set up your indicators, then save them here to use on any token.</p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {list.map((t) => (
                <li key={t.name} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      apply(t);
                      close();
                    }}
                    className="flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-[3px] px-2 py-1.5 text-left hover:bg-tint/[0.05]"
                  >
                    <span className="truncate text-[12.5px] text-chrome">{t.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-dim">
                      {t.studies.length} ind · {t.type}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => update(list.filter((x) => x.name !== t.name))}
                    aria-label={`Delete layout ${t.name}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-dim opacity-60 hover:text-down group-hover:opacity-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-1 flex gap-1 border-t border-line pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim().slice(0, 40);
              if (!n) return;
              const t: Template = { name: n, interval: config.interval, type: config.type, units: config.units, studies: config.studies };
              update([t, ...list.filter((x) => x.name !== n)].slice(0, MAX));
              setName("");
            }}
          >
            <label htmlFor="chart-template-name" className="sr-only">
              Layout name
            </label>
            <input
              id="chart-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Save current as…"
              maxLength={40}
              className="min-w-0 flex-1 rounded-[4px] border border-line bg-void px-2 py-1.5 text-[12px] text-chrome outline-none placeholder:text-dim focus:border-line-2"
            />
            <button type="submit" disabled={!name.trim()} className="rounded-[4px] border border-line-2 px-2 text-[12px] text-chrome hover:border-chrome/50 disabled:opacity-40">
              Save
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}
