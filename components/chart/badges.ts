import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * One trader badge: a filled circle with its label inside ("DB"), one per trade, stacked over its candle's high in the
 * order the trades happened: `stack` 0 sits on the candle, 1 above it, and so on. "more" is the "+N" disc standing for
 * a busy candle's older trades.
 */
export type Badge = { time: number; high: number; label: string; side: "buy" | "sell" | "more"; stack: number };

/** Electric green for a buy, electric red for a sell, grey for "+N": the fill, a darker ring round it, and a glow. */
const LOOK = {
  buy: { fill: "#00e676", ring: "#00873f", glow: "rgba(0, 230, 118, 0.35)" },
  sell: { fill: "#ff1744", ring: "#a3001f", glow: "rgba(255, 23, 68, 0.35)" },
  more: { fill: "#5b5f66", ring: "#2c2f33", glow: "rgba(0, 0, 0, 0)" },
} as const;

const R = 7.5;
const GAP = 3;

/** Most badges in one candle's column (a busier candle folds the rest into "+N"). */
export const BADGE_ROWS = 4;

/** Pixels a column of `rows` badges needs over its candle (the chart keeps that much room over the highest one). */
export const badgeColumnPx = (rows: number) => (rows > 0 ? GAP + rows * (2 * R + 2) + 2 : 0);

/**
 * Trade badges on the price pane, drawn like a memecoin terminal's: small filled circles with the label inside (B, S,
 * DB, DS, ...), one per trade, in one column over each candle in the order the trades happened (oldest nearest the
 * candle; the caller folds a busy candle's oldest into a "+N"). Prices are already in the chart's units.
 */
export class BadgesPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private badges: Badge[] = [];

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.request = p.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.request = null;
  }

  set(badges: Badge[]) {
    this.badges = badges;
    this.request?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => "top", renderer: () => ({ draw: (t: Target) => this.draw(t) }) }];
  }

  private draw(target: Target) {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series || this.badges.length === 0) return;
    const scale = chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const b of this.badges) {
        const x = scale.timeToCoordinate(b.time as UTCTimestamp);
        const edge = series.priceToCoordinate(b.high);
        if (x === null || edge === null || x < -R || x > mediaSize.width + R) continue;
        // One column over the candle, oldest trade nearest it.
        const y = edge - GAP - R - b.stack * (2 * R + 2);
        const look = LOOK[b.side];
        // The disc, softly glowing, with a darker ring so it reads as a badge on any background.
        ctx.save();
        ctx.shadowColor = look.glow;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = look.fill;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, R - 0.75, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = look.ring;
        ctx.stroke();
        // White label, a faint dark shadow under it so it stays legible on the bright fill.
        ctx.save();
        ctx.font = `800 ${b.label.length > 3 ? 5.2 : b.label.length > 1 ? 6.5 : 8}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.label, x, y + 0.5);
        ctx.restore();
      }
    });
  }
}
