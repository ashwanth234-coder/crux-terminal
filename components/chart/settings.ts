import type { StudyId } from "@/lib/indicators";

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
  /** The auction's clearing price as a dashed line. */
  clearingLine: boolean;
};

export const DEFAULT_SETTINGS: ChartSettings = { grid: true, volume: true, magnet: false, seconds: true, palette: "crux", clearingLine: true };

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
};

export const DEFAULT_CONFIG: ChartConfig = { interval: "auto", type: "candles", units: "mcap", studies: [], lockedTime: null, alerts: [] };

const KEY = "crux:chart:settings:v1";

export function loadSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ChartSettings>) } : DEFAULT_SETTINGS;
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

export function palette(s: ChartSettings) {
  return s.palette === "classic" ? { up: "#26a69a", down: "#ef5350" } : { up: "#5cc08c", down: "#e5484d" };
}
