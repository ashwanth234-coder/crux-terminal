import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, SeriesType, Time } from "lightweight-charts";

export type DrawTool = "ray" | "trend" | "ruler" | "fib";

/** A chart point: a time (unix seconds, may be between or beyond candles) and a price in USDC per token. */
export type DrawPoint = { time: number; price: number };

/** A drawing, in units that survive timeframe and Price / MCap changes. Rays need only `a`. */
export type Drawing = { id: string; tool: DrawTool; a: DrawPoint; b?: DrawPoint };

/** How many points each tool takes. */
export const TOOL_POINTS: Record<DrawTool, 1 | 2> = { ray: 1, trend: 2, ruler: 2, fib: 2 };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ["#8f939b", "#e5484d", "#ff9d6e", "#5cc08c", "#4cc9f0", "#c792ea", "#8f939b"];

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * Every drawing on the price pane, as one series primitive: painted on the chart's own canvas (so it pans, zooms and
 * scales with the candles, and appears in snapshots). Times map to x through the candles' times, extrapolated by the
 * interval past either end, so a trendline can run into the future and drawings keep their place across timeframes.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private drawings: Drawing[] = [];
  private draft: Drawing | null = null;
  private times: number[] = [];
  private interval = 60;
  private k = 1;
  private fmt: (v: number) => string = (v) => String(v);
  private up = "#5cc08c";
  private down = "#e5484d";

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

  setDrawings(drawings: Drawing[], draft: Drawing | null) {
    this.drawings = drawings;
    this.draft = draft;
    this.request?.();
  }

  setFrame(times: number[], interval: number, k: number, fmt: (v: number) => string, colors: { up: string; down: string }) {
    this.times = times;
    this.interval = interval;
    this.k = k;
    this.fmt = fmt;
    this.up = colors.up;
    this.down = colors.down;
    this.request?.();
  }

  /** Bar index (fractional) of a time: interpolated between candles, extrapolated by the interval past either end. */
  logicalOf(time: number): number {
    const t = this.times;
    if (t.length === 0) return 0;
    if (time <= t[0]) return (time - t[0]) / this.interval;
    const last = t.length - 1;
    if (time >= t[last]) return last + (time - t[last]) / this.interval;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= time) lo = mid;
      else hi = mid;
    }
    return lo + (time - t[lo]) / Math.max(1, t[hi] - t[lo]);
  }

  /** The inverse of logicalOf. */
  timeOf(logical: number): number {
    const t = this.times;
    if (t.length === 0) return 0;
    const last = t.length - 1;
    if (logical <= 0) return t[0] + logical * this.interval;
    if (logical >= last) return t[last] + (logical - last) * this.interval;
    const lo = Math.floor(logical);
    return t[lo] + (logical - lo) * (t[lo + 1] - t[lo]);
  }

  private x(time: number): number | null {
    return this.chart?.timeScale().logicalToCoordinate(this.logicalOf(time) as Logical) ?? null;
  }

  private y(price: number): number | null {
    return this.series?.priceToCoordinate(price * this.k) ?? null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => "top", renderer: () => ({ draw: (target: Target) => this.draw(target) }) }];
  }

  private draw(target: Target) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
      ctx.textBaseline = "middle";
      for (const d of this.drawings) this.drawOne(ctx, d, mediaSize.width, false);
      if (this.draft) this.drawOne(ctx, this.draft, mediaSize.width, true);
      ctx.restore();
    });
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: "left" | "right" | "center" = "left") {
    const w = ctx.measureText(text).width + 8;
    const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    ctx.fillStyle = "#141518ee";
    ctx.fillRect(left, y - 8, w, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, y - 7.5, w - 1, 15);
    ctx.fillStyle = color;
    ctx.fillText(text, left + 4, y + 0.5);
  }

  private drawOne(ctx: CanvasRenderingContext2D, d: Drawing, width: number, draft: boolean) {
    ctx.globalAlpha = draft ? 0.7 : 1;
    ctx.setLineDash([]);
    const ax = this.x(d.a.time);
    const ay = this.y(d.a.price);
    if (ax === null || ay === null) return;
    if (d.tool === "ray") {
      const color = "#ffd166";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(width, ay);
      ctx.stroke();
      this.dot(ctx, ax, ay, color);
      this.label(ctx, this.fmt(d.a.price * this.k), width - 4, ay, color, "right");
      return;
    }
    if (!d.b) return;
    const bx = this.x(d.b.time);
    const by = this.y(d.b.price);
    if (bx === null || by === null) return;

    if (d.tool === "trend") {
      const color = "#4cc9f0";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      this.dot(ctx, ax, ay, color);
      this.dot(ctx, bx, by, color);
      return;
    }

    if (d.tool === "ruler") {
      const rising = d.b.price >= d.a.price;
      const color = rising ? this.up : this.down;
      ctx.fillStyle = `${color}22`;
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      const pct = d.a.price > 0 ? (d.b.price / d.a.price - 1) * 100 : 0;
      const bars = Math.round(Math.abs(this.logicalOf(d.b.time) - this.logicalOf(d.a.time)));
      const diff = (d.b.price - d.a.price) * this.k;
      const text = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%  ${diff >= 0 ? "+" : "−"}${this.fmt(Math.abs(diff))}  ${bars} bar${bars === 1 ? "" : "s"}`;
      this.label(ctx, text, (ax + bx) / 2, rising ? Math.min(ay, by) - 12 : Math.max(ay, by) + 12, color, "center");
      return;
    }

    // Fib retracement: 1 at the first point, 0 at the second, each level drawn from the left point to the right edge.
    const left = Math.min(ax, bx);
    FIB_LEVELS.forEach((level, i) => {
      const price = d.b!.price + (d.a.price - d.b!.price) * level;
      const y = this.y(price);
      if (y === null) return;
      ctx.strokeStyle = FIB_COLORS[i];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = FIB_COLORS[i];
      ctx.fillText(`${level} (${this.fmt(price * this.k)})`, left + 4, y - 7);
    });
    ctx.strokeStyle = "#8f939b";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
