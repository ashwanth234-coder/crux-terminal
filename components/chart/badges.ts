import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from "lightweight-charts";
import type { BadgeFill } from "@/lib/chartLive";

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/**
 * One trader badge: every marked trade of one side in one candle (lib/chartLive clusterBadges). A buy's sits over the
 * candle's high, a sell's under its low; `count` trades stand behind it, listed in `fills` (for its hover list).
 * `high` and `low` are in the chart's units.
 */
export type Badge = { time: number; high: number; low: number; label: string; side: "buy" | "sell"; count: number; fills: BadgeFill[] };

/** A milestone of the launch on its bar: a dashed line down the pane with its name in a pill at the top. */
export type ChartEvent = { time: number; text: string; color: string };

/** How far down the pane the first milestone's name sits: under the legend's two lines. */
const EVENT_TOP = 46;

/** Electric green for a buy, electric red for a sell: the fill and a darker ring round it. */
const LOOK = {
  buy: { fill: "#00e676", ring: "#00873f" },
  sell: { fill: "#ff1744", ring: "#a3001f" },
} as const;

/** A badge is a fixed 18 px circle. */
const R = 9;
const GAP = 3;
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

/** Pixels the price scale keeps clear over the highest candle and under the lowest one, for a badge each. */
export const BADGE_ROOM_PX = GAP + 2 * R + 4;


/**
 * Trade badges on the price pane, drawn like a memecoin terminal's: at most one for a candle's buys (over its high)
 * and one for its sells (under its low), a small disc with the label inside (B, S, DB, DS, ...) or a pill with the
 * count when it stands for several trades ("DB×4"). Drawn with the candles, on the chart's base layer: moving the
 * crosshair (which repaints only the layer above) never redraws them.
 */
export class BadgesPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private badges: Badge[] = [];
  /** The badges last drawn (not hidden behind a newer one), for the pointer. */
  private drawn = new Set<Badge>();

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

  private events: ChartEvent[] = [];
  setEvents(events: ChartEvent[]) {
    this.events = events;
    this.request?.();
  }

  /**
   * Milestones, drawn first (under the badges): a faint dashed line down the bar and the name in a pill near the top
   * of the pane, clear of everything that sits on the candles (a sell's badge under the low used to print over the
   * name there). Names close together step down a row each instead of overlapping.
   */
  private drawEvents(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const scale = this.chart?.timeScale();
    if (!scale || this.events.length === 0) return;
    ctx.save();
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rows: { left: number; right: number }[][] = [];
    for (const e of this.events) {
      const x = scale.timeToCoordinate(e.time as UTCTimestamp);
      if (x === null || x < -60 || x > width + 60) continue;
      const w = ctx.measureText(e.text).width + 12;
      const cx = Math.min(Math.max(x, w / 2 + 2), Math.max(w / 2 + 2, width - w / 2 - 2));
      let row = 0;
      while (rows[row]?.some((r) => cx - w / 2 < r.right + 4 && cx + w / 2 > r.left - 4)) row++;
      (rows[row] ??= []).push({ left: cx - w / 2, right: cx + w / 2 });
      const y = EVENT_TOP + row * 18;
      ctx.strokeStyle = `${e.color}55`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, y + 8);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, y - 8, w, 16, 8);
      ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
      ctx.fill();
      ctx.strokeStyle = `${e.color}99`;
      ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.fillText(e.text, cx, y + 0.5);
    }
    ctx.restore();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => "normal", renderer: () => ({ draw: (t: Target) => this.draw(t) }) }];
  }

  /** Where a badge's centre is on the pane, or null when its candle isn't on it. */
  private centre(b: Badge): { x: number; y: number } | null {
    const x = this.chart?.timeScale().timeToCoordinate(b.time as UTCTimestamp) ?? null;
    const edge = this.series?.priceToCoordinate(b.side === "buy" ? b.high : b.low) ?? null;
    if (x === null || edge === null || !Number.isFinite(x) || !Number.isFinite(edge)) return null;
    return { x, y: b.side === "buy" ? edge - GAP - R : edge + GAP + R };
  }

  /** The badge under (x, y) on the price pane, with its centre, or null. */
  at(x: number, y: number): { badge: Badge; x: number; y: number } | null {
    for (let i = this.badges.length - 1; i >= 0; i--) {
      const b = this.badges[i];
      const c = this.centre(b);
      if (c && this.drawn.has(b) && Math.abs(x - c.x) <= R + 2 && Math.abs(y - c.y) <= R + 2) return { badge: b, ...c };
    }
    return null;
  }

  private draw(target: Target) {
    if (!this.chart || !this.series || (this.badges.length === 0 && this.events.length === 0)) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.drawEvents(ctx, mediaSize.width, mediaSize.height);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      this.drawn.clear();
      // Newest first, each side on its own row: the newest candle's badge is always drawn, and an older one that
      // would overlap a newer one is left out (its trades are in the newer one's hover list only if they share a
      // candle; zoom in to see it). Never folded into a nameless dot.
      const edge = { buy: Infinity, sell: Infinity };
      const placed = this.badges
        .map((b) => ({ b, c: this.centre(b) }))
        .filter((p): p is { b: Badge; c: { x: number; y: number } } => p.c !== null && p.c.x > -R && p.c.x < mediaSize.width + R)
        .sort((p, q) => q.c.x - p.c.x);
      for (const { b, c } of placed) {
        if (c.x + R + 1 > edge[b.side]) continue;
        edge[b.side] = c.x - R;
        this.drawn.add(b);
        const look = LOOK[b.side];
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
        ctx.fillStyle = look.fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = look.ring;
        ctx.stroke();
        ctx.font = `800 ${b.label.length > 1 ? 8 : 10}px ${FONT}`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillText(b.label, c.x + 0.5, c.y + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.label, c.x, c.y + 0.5);
      }
      ctx.restore();
    });
  }
}
