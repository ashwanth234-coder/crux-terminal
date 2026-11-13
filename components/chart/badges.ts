import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from "lightweight-charts";
import { badgeText, type BadgeFill } from "@/lib/chartLive";

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

const R = 7.5;
const GAP = 3;
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
/** A badge with no room for its label, zoomed far out: a dot of its colour (the pointer still lists its trades). */
const DOT = 2.5;

/** Pixels the price scale keeps clear over the highest candle and under the lowest one, for a badge each. */
export const BADGE_ROOM_PX = GAP + 2 * R + 4;

/** A badge's width: a disc for one trade, a pill wide enough for its text ("DB×4") for several. */
const widthOf = (b: Badge) => (b.count > 1 ? Math.max(2 * R, badgeText(b.label, b.count).length * 5.6 + 8) : 2 * R);

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
  /** How wide each badge was last drawn (a pill, a disc or a dot), for the pointer. */
  private drawn = new Map<Badge, number>();

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
      if (c && Math.abs(x - c.x) <= Math.max(DOT * 2, this.drawn.get(b) ?? widthOf(b)) / 2 + 2 && Math.abs(y - c.y) <= R + 2) return { badge: b, ...c };
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
      // Newest first, each side on its own row: a badge takes the room it needs only where its neighbour (already
      // drawn, to its right) leaves it. Zoomed out, where candles are narrower than a pill, the newest keep their
      // full text and older ones fold to a disc with the label, then to a dot, instead of printing over each other.
      const edge = { buy: Infinity, sell: Infinity };
      const placed = this.badges
        .map((b) => ({ b, c: this.centre(b) }))
        .filter((p): p is { b: Badge; c: { x: number; y: number } } => p.c !== null && p.c.x > -40 && p.c.x < mediaSize.width + 40)
        .sort((p, q) => q.c.x - p.c.x);
      for (const { b, c } of placed) {
        const look = LOOK[b.side];
        const full = widthOf(b);
        const w = c.x + full / 2 + 1 <= edge[b.side] ? full : c.x + R + 1 <= edge[b.side] ? 2 * R : 2 * DOT;
        if (c.x + w / 2 > edge[b.side]) continue; // not even a dot's room: its neighbour's dot stands for both
        edge[b.side] = c.x - w / 2;
        this.drawn.set(b, w);
        ctx.beginPath();
        if (w === 2 * DOT) {
          ctx.arc(c.x, c.y, DOT, 0, Math.PI * 2);
          ctx.fillStyle = look.fill;
          ctx.fill();
          continue;
        }
        // The disc (or pill), with a darker ring so it reads as a badge on any background.
        const text = w === full ? badgeText(b.label, b.count) : b.label;
        if (w > 2 * R) ctx.roundRect(c.x - w / 2, c.y - R, w, 2 * R, R);
        else ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
        ctx.fillStyle = look.fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = look.ring;
        ctx.stroke();
        ctx.font = `800 ${w > 2 * R ? 7 : text.length > 1 ? 6.5 : 8}px ${FONT}`;
        // Dark under white: the label stays legible on the bright fill without a (slow) canvas shadow.
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillText(text, c.x + 0.5, c.y + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, c.x, c.y + 0.5);
      }
      ctx.restore();
    });
  }
}
