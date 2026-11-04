import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from "lightweight-charts";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** One trader badge: a filled circle above a candle with its label inside ("DB"), one per kind and side whatever the count. */
export type Badge = { time: number; high: number; label: string; side: "buy" | "sell" };

/** Electric green for a buy, electric red for a sell: the fill, a darker ring round it, and a glow. */
const LOOK = {
  buy: { fill: "#00e676", ring: "#00873f", glow: "rgba(0, 230, 118, 0.35)" },
  sell: { fill: "#ff1744", ring: "#a3001f", glow: "rgba(255, 23, 68, 0.35)" },
} as const;

const R = 10;
const GAP = 4;

/**
 * Trade badges on the price pane, drawn like a trading terminal's: a small filled circle sitting above each candle
 * with its label inside (DB, DS, ...), one per kind of trader and side however many trades it stands for.
 * Several kinds on one candle stack upwards. Prices are already in the chart's units.
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
      const stacked = new Map<number, number>();
      for (const b of this.badges) {
        const x = scale.timeToCoordinate(b.time as UTCTimestamp);
        const top = series.priceToCoordinate(b.high);
        if (x === null || top === null || x < -R || x > mediaSize.width + R) continue;
        const n = stacked.get(b.time) ?? 0;
        stacked.set(b.time, n + 1);
        const y = top - GAP - R - n * (2 * R + 2);
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
        ctx.font = "800 8.5px Inter, ui-sans-serif, system-ui, sans-serif";
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
