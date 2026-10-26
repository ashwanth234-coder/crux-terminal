import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from "lightweight-charts";
import type { Candle } from "@/lib/candles";
import { volumeProfile } from "@/lib/volumeProfile";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * The visible-range volume profile, drawn on the price pane behind the candles from its right edge: green buying,
 * red selling, the value area brighter, a dashed point-of-control line. It follows the view as it pans and zooms.
 */
export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private opts: { candles: Candle[]; buyUsd: number[]; sellUsd: number[]; k: number; rows: number; width: number; va: number; up: string; down: string } | null = null;

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

  set(opts: VolumeProfilePrimitive["opts"]) {
    this.opts = opts;
    this.request?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => "bottom", renderer: () => ({ draw: (t: Target) => this.draw(t) }) }];
  }

  private draw(target: Target) {
    const o = this.opts;
    if (!o || !this.chart || !this.series || o.candles.length === 0) return;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    const from = Math.max(0, Math.floor(range?.from ?? 0));
    const to = Math.min(o.candles.length - 1, Math.ceil(range?.to ?? o.candles.length - 1));
    if (to < from) return;
    const prof = volumeProfile(o.candles.slice(from, to + 1), o.buyUsd, o.sellUsd, o.rows, o.va, from);
    if (!prof) return;
    const series = this.series;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const maxVol = Math.max(...prof.rows.map((r) => r.buy + r.sell));
      const span = (mediaSize.width * o.width) / 100;
      prof.rows.forEach((r, i) => {
        const y1 = series.priceToCoordinate(r.hi * o.k);
        const y2 = series.priceToCoordinate(r.lo * o.k);
        if (y1 === null || y2 === null) return;
        const h = Math.max(1, Math.abs(y2 - y1) - 1);
        const top = Math.min(y1, y2);
        const len = ((r.buy + r.sell) / maxVol) * span;
        const buyLen = (r.buy / (r.buy + r.sell || 1)) * len;
        const inVa = i >= prof.vaLo && i <= prof.vaHi;
        const alpha = inVa ? "66" : "2e";
        ctx.fillStyle = `${o.up}${alpha}`;
        ctx.fillRect(mediaSize.width - len, top, buyLen, h);
        ctx.fillStyle = `${o.down}${alpha}`;
        ctx.fillRect(mediaSize.width - len + buyLen, top, len - buyLen, h);
      });
      const poc = prof.rows[prof.poc];
      const y = series.priceToCoordinate(((poc.lo + poc.hi) / 2) * o.k);
      if (y !== null) {
        ctx.strokeStyle = "#ffd166cc";
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mediaSize.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "10px JetBrains Mono, ui-monospace, monospace";
        ctx.fillStyle = "#ffd166";
        ctx.fillText("POC", 4, y - 4);
      }
    });
  }
}
