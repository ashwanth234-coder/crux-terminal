import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * One trader badge: a filled circle with its label inside ("DB"), a buy's under its candle's low and a sell's over its
 * high, one per kind and side per candle; `count` > 1 shows how many trades it stands for.
 */
export type Badge = { time: number; high: number; low: number; label: string; side: "buy" | "sell"; count?: number };

/** Electric green for a buy, electric red for a sell: the fill, a darker ring round it, and a glow. */
const LOOK = {
  buy: { fill: "#00e676", ring: "#00873f", glow: "rgba(0, 230, 118, 0.35)" },
  sell: { fill: "#ff1744", ring: "#a3001f", glow: "rgba(255, 23, 68, 0.35)" },
} as const;

const R = 7.5;
const GAP = 3;

/**
 * Trade badges on the price pane, drawn like a trading terminal's: buys in small filled circles under each candle,
 * sells over it, with the label inside (B, S, DB, DS, ...), one per kind of trader and side however many trades it
 * stands for. Several kinds on one side stack away from the candle, so a sell never covers a buy. Prices are already
 * in the chart's units.
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
      const stacked = new Map<string, number>();
      for (const b of this.badges) {
        const x = scale.timeToCoordinate(b.time as UTCTimestamp);
        const edge = series.priceToCoordinate(b.side === "buy" ? b.low : b.high);
        if (x === null || edge === null || x < -R || x > mediaSize.width + R) continue;
        const key = `${b.time}:${b.side}`;
        const n = stacked.get(key) ?? 0;
        stacked.set(key, n + 1);
        // Buys hang under the candle, sells sit over it, each side stacking away from the candle.
        const step = n * (2 * R + 2);
        const y = b.side === "buy" ? edge + GAP + R + step : edge - GAP - R - step;
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
        ctx.font = `800 ${b.label.length > 1 ? 6.5 : 8}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.label, x, y + 0.5);
        ctx.restore();
        // How many trades it stands for, small beside it.
        if (b.count && b.count > 1) {
          ctx.save();
          ctx.font = "700 8px Inter, ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = look.fill;
          ctx.fillText(`×${b.count}`, x + R + 2, y + 0.5);
          ctx.restore();
        }
      }
    });
  }
}
