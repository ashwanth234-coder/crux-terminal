import { isStudyId, readInstances, type StudyId, type StudyInstance } from "@/lib/indicators";
import { TOOL_POINTS, type Drawing } from "./drawings";
import type { CompareItem } from "./Compare";

export type ChartType =
  | "bars"
  | "candles"
  | "hollow"
  | "hlc"
  | "line"
  | "linemarkers"
  | "step"
  | "area"
  | "hlcarea"
  | "baseline"
  | "columns"
  | "highlow"
  | "heikin";

export const CHART_TYPES: ChartType[] = ["bars", "candles", "hollow", "hlc", "line", "linemarkers", "step", "area", "hlcarea", "baseline", "columns", "highlow", "heikin"];
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
  /** The pointer over the chart: a crosshair, a dot, or a plain arrow (no crosshair lines). */
  cursor: "cross" | "dot" | "arrow";
  /** Drawings can't be moved or edited while locked. */
  drawLocked: boolean;
  /** Custom up / down colours (empty: the palette's). */
  upColor: string;
  downColor: string;
  /** Candle wicks and borders. */
  wicks: boolean;
  borders: boolean;
  /** Chart background. */
  background: "default" | "black" | "slate";
  /** Which grid lines show (when the grid is on). */
  gridStyle: "both" | "vert" | "horz";
  /** The price axis on the right or the left. */
  scaleSide: "right" | "left";
  /** The dashed line at the last price. */
  lastPriceLine: boolean;
  /** Time left in the current candle, under the last price. */
  countdown: boolean;
  /** Times on the axis and the crosshair: UTC or this computer's time zone. */
  timezone: "utc" | "local";
  /** The status line (top left): what it shows. */
  status: { ohlc: boolean; change: boolean; volume: boolean; studies: boolean };
  /** Your standing orders (take profit, stop loss, dip buys) as lines on the chart. */
  showOrders: boolean;
  /** The token's symbol faintly behind the candles. */
  watermark: boolean;
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
  cursor: "cross",
  drawLocked: false,
  upColor: "",
  downColor: "",
  wicks: true,
  borders: false,
  background: "default",
  gridStyle: "both",
  scaleSide: "right",
  lastPriceLine: true,
  countdown: true,
  timezone: "utc",
  status: { ohlc: true, change: true, volume: true, studies: true },
  showOrders: true,
  watermark: false,
};

/** How an alert's line meets its target: crossing up, down, or either way. */
export type AlertOp = "up" | "down" | "cross";

/**
 * An alert on an indicator: when its `line` crosses a value (in USD per token for priced lines), the price, or another
 * of its lines. Fires once per candle; removed after firing unless `repeat`.
 */
export type AlertRule = {
  id: string;
  study: StudyId;
  line: string;
  op: AlertOp;
  target: { value: number } | { line: string } | "price";
  repeat: boolean;
};

/**
 * The chart's undoable state: everything the toolbar, the context menu and the alert button change. Undo / redo
 * walk it back and forth.
 */
export type ChartConfig = {
  interval: number | "auto";
  type: ChartType;
  units: Units;
  /** Indicators with the trader's settings, colours and visibility. */
  studies: StudyInstance[];
  /** Alerts on indicator lines. */
  rules: AlertRule[];
  /** A vertical reference line pinned at a candle's time (unix seconds). */
  lockedTime: number | null;
  /** Price alerts, in USDC per token (shown in the current units). */
  alerts: number[];
  /** Lines, shapes, notes, rulers, Fibs and positions. */
  drawings: Drawing[];
  /** Other Crux tokens drawn alongside, in %. */
  compare: CompareItem[];
};

export const DEFAULT_CONFIG: ChartConfig = { interval: "auto", type: "candles", units: "mcap", studies: [], rules: [], lockedTime: null, alerts: [], drawings: [], compare: [] };

const KEY = "crux:chart:settings:v1";

export function loadSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<ChartSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, marks: { ...DEFAULT_SETTINGS.marks, ...saved.marks }, status: { ...DEFAULT_SETTINGS.status, ...saved.status } };
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
    return raw ? parseLayout(raw) : null;
  } catch {
    return null;
  }
}

/** When this token's layout was last changed in this browser (ms), for syncing with other devices. */
export function layoutSavedAt(token: string): number {
  try {
    return Number(localStorage.getItem(`${layoutKey(token)}:t`) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** A saved layout (JSON) read back, anything unreadable dropped rather than trusted; null if it isn't a layout. */
export function parseLayout(raw: string): ChartConfig | null {
  try {
    const v = JSON.parse(raw) as Partial<ChartConfig>;
    if (!v || typeof v !== "object") return null;
    const types = CHART_TYPES;
    return {
      interval: v.interval === "auto" || (typeof v.interval === "number" && v.interval > 0) ? v.interval : DEFAULT_CONFIG.interval,
      type: types.includes(v.type as ChartType) ? (v.type as ChartType) : DEFAULT_CONFIG.type,
      units: v.units === "price" ? "price" : "mcap",
      studies: readInstances(v.studies),
      rules: Array.isArray(v.rules)
        ? v.rules.filter(
            (r): r is AlertRule =>
              r && typeof r.id === "string" && isStudyId(r.study) && typeof r.line === "string" && ["up", "down", "cross"].includes(r.op) && r.target !== undefined,
          )
        : [],
      lockedTime: typeof v.lockedTime === "number" ? v.lockedTime : null,
      alerts: Array.isArray(v.alerts) ? v.alerts.filter((a) => Number.isFinite(a) && a > 0) : [],
      compare: Array.isArray(v.compare)
        ? v.compare
            .filter((c) => c && typeof c.pair === "string" && /^0x[0-9a-fA-F]{40}$/.test(c.pair) && typeof c.symbol === "string" && typeof c.color === "string")
            .slice(0, 3)
        : [],
      drawings: Array.isArray(v.drawings)
        ? v.drawings.filter((d) => d && typeof d.id === "string" && d.tool in TOOL_POINTS && isPoint(d.a) && (d.b === undefined || isPoint(d.b)) && (d.c === undefined || isPoint(d.c)))
        : [],
    };
  } catch {
    return null;
  }
}

export function saveLayout(token: string, config: ChartConfig, savedAt = Date.now()) {
  try {
    localStorage.setItem(layoutKey(token), JSON.stringify(config));
    localStorage.setItem(`${layoutKey(token)}:t`, String(savedAt));
  } catch {
    // Storage blocked: the layout lasts for this visit only.
  }
}

export function palette(s: ChartSettings) {
  const base = s.palette === "classic" ? { up: "#26a69a", down: "#ef5350" } : { up: "#5cc08c", down: "#e5484d" };
  return { up: s.upColor || base.up, down: s.downColor || base.down };
}
