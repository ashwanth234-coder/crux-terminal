/**
 * The coin terminal's resizable panes on wide screens: the coin list on the left, the Buy/Sell panel on the right and
 * the Trades / Holder map area under the chart. Each trader's sizes are kept in their own browser. Pure, for tests.
 */

export type PaneSizes = {
  /** Width of the coin list (px). */
  rail: number;
  /** Width of the Buy/Sell panel (px). */
  side: number;
  /** Height of the Trades / Holder map area (px). */
  bottom: number;
  /** The Trades area folded away: the chart takes the whole height. */
  bottomHidden: boolean;
};

export const PANE_DEFAULTS: PaneSizes = { rail: 230, side: 360, bottom: 260, bottomHidden: false };

export const PANE_LIMITS = {
  rail: { min: 180, max: 380 },
  side: { min: 300, max: 560 },
  bottom: { min: 120 },
  /** The chart never gets shorter than this when the Trades area grows. */
  chartMin: 220,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** A pane size kept inside its limits; `areaHeight` (the chart + trades area) caps the Trades area's height. */
export function clampPane(kind: "rail" | "side" | "bottom", v: number, areaHeight?: number): number {
  if (!Number.isFinite(v)) return PANE_DEFAULTS[kind];
  if (kind === "bottom") {
    const max = areaHeight && areaHeight > 0 ? areaHeight - PANE_LIMITS.chartMin : 2_000;
    return Math.round(clamp(v, PANE_LIMITS.bottom.min, max));
  }
  return Math.round(clamp(v, PANE_LIMITS[kind].min, PANE_LIMITS[kind].max));
}

/** Sizes read back from storage: anything missing, broken or out of range falls back to its default. */
export function parsePaneSizes(raw: string | null | undefined): PaneSizes {
  if (!raw) return PANE_DEFAULTS;
  try {
    const j = JSON.parse(raw) as Partial<Record<keyof PaneSizes, unknown>>;
    const num = (k: "rail" | "side" | "bottom") => (typeof j[k] === "number" ? clampPane(k, j[k] as number) : PANE_DEFAULTS[k]);
    return { rail: num("rail"), side: num("side"), bottom: num("bottom"), bottomHidden: j.bottomHidden === true };
  } catch {
    return PANE_DEFAULTS;
  }
}

/**
 * The new size while dragging a pane's edge: `delta` px the pointer moved (right/down positive). The coin list grows
 * as its right edge moves right; the Buy/Sell panel and the Trades area grow as their left/top edge moves left/up.
 */
export function dragPane(kind: "rail" | "side" | "bottom", start: number, delta: number, areaHeight?: number): number {
  return clampPane(kind, kind === "rail" ? start + delta : start - delta, areaHeight);
}
