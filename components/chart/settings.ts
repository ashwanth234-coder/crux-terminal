import { isStudyId, type StudyId } from "@/lib/indicators";
import { TOOL_POINTS, type Drawing } from "./drawings";

export type ChartType = "candles" | "hollow" | "bars" | "line" | "area" | "baseline";
export type ScaleMode = "normal" | "log" | "percent";
/** What the price axis shows: the token's price, or its market cap (price × total supply). */
export type Units = "price" | "mcap";

/** Appearance, kept in this browser (Settings…). */
export type ChartSettings = {
  grid: boolean;
  volume: boolean;
  /** Crosshair snaps to candle closes. */
  magnet: boolean;
  seconds: boolean;
  /** Up / down colours: Crux's, or the classic green / red. */
  palette: "crux" | "classic";
  /** The auction's clearing price as a dashed line (the overlays bar's "Batch floor"). */
  clearingLine: boolean;
  /** Trades marked on the candles: yours (B / S, plus your average entry), the creator's and whales' (D / W), the top 10 holders' (T). */
  marks: { mine: boolean; dev: boolean; top: boolean };
  /** Trades under this many USD aren't marked. */
  minUsd: number;
  /** Drawing magnet: new points snap to the bar's open / high / low / close. */
  snap: boolean;
};

export const DEFAULT_SETTINGS: ChartSettings = {
  grid: true,
  volume: true,
  magnet: false,
  seconds: true,
  palette: "crux",
  clearingLine: true,
  marks: { mine: true, dev: true, top: false },
  minUsd: 0,
  snap: true,
};

/**
 * The chart's undoable state: everything the toolbar, the context menu and the alert button change. Undo / redo
 * walk it back and forth.
 */
export type ChartConfig = {
  interval: number | "auto";
  type: ChartType;
  units: Units;
  studies: StudyId[];
  /** A vertical reference line pinned at a candle's time (unix seconds). */
  lockedTime: number | null;
  /** Price alerts, in USDC per token (shown in the current units). */
  alerts: number[];
  /** Lines, shapes, notes, rulers, Fibs and positions. */
  drawings: Drawing[];
};

export const DEFAULT_CONFIG: ChartConfig = { interval: "auto", type: "candles", units: "mcap", studies: [], lockedTime: null, alerts: [], drawings: [] };

const KEY = "crux:chart:settings:v1";

export function loadSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<ChartSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, marks: { ...DEFAULT_SETTINGS.marks, ...saved.marks } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ChartSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: settings last for this visit only.
  }
}

const layoutKey = (token: string) => `crux:chart:layout:v1:${token.toLowerCase()}`;

const isPoint = (p: unknown): p is { time: number; price: number } =>
  typeof p === "object" && p !== null && Number.isFinite((p as { time: number }).time) && Number.isFinite((p as { price: number }).price);

/**
 * This token's saved chart (timeframe, style, units, indicators, drawings, alerts, locked line), as it was left in
 * this browser; null when there's none. Anything unreadable is dropped rather than trusted.
 */
export function loadLayout(token: string): ChartConfig | null {
  try {
    const raw = localStorage.getItem(layoutKey(token));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ChartConfig>;
    const types: ChartType[] = ["candles", "hollow", "bars", "line", "area", "baseline"];
    return {
      interval: v.interval === "auto" || (typeof v.interval === "number" && v.interval > 0) ? v.interval : DEFAULT_CONFIG.interval,
      type: types.includes(v.type as ChartType) ? (v.type as ChartType) : DEFAULT_CONFIG.type,
      units: v.units === "price" ? "price" : "mcap",
      studies: Array.isArray(v.studies) ? v.studies.filter(isStudyId) : [],
      lockedTime: typeof v.lockedTime === "number" ? v.lockedTime : null,
      alerts: Array.isArray(v.alerts) ? v.alerts.filter((a) => Number.isFinite(a) && a > 0) : [],
      drawings: Array.isArray(v.drawings)
        ? v.drawings.filter((d) => d && typeof d.id === "string" && d.tool in TOOL_POINTS && isPoint(d.a) && (d.b === undefined || isPoint(d.b)) && (d.c === undefined || isPoint(d.c)))
        : [],
    };
  } catch {
    return null;
  }
}

export function saveLayout(token: string, config: ChartConfig) {
  try {
    localStorage.setItem(layoutKey(token), JSON.stringify(config));
  } catch {
    // Storage blocked: the layout lasts for this visit only.
  }
}

export function palette(s: ChartSettings) {
  return s.palette === "classic" ? { up: "#26a69a", down: "#ef5350" } : { up: "#5cc08c", down: "#e5484d" };
}
