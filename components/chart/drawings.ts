import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, SeriesType, Time } from "lightweight-charts";
import type { Candle } from "@/lib/candles";

export type DrawTool =
  | "ray"
  | "hline"
  | "vline"
  | "trend"
  | "arrow"
  | "channel"
  | "rect"
  | "text"
  | "callout"
  | "emoji"
  | "brush"
  | "ruler"
  | "fib"
  | "pitchfork"
  | "gannfan"
  | "long"
  | "short"
  | "xabcd"
  | "abcd"
  | "headshoulders"
  | "elliott"
  | "triangle"
  | "fibext"
  | "fibtime"
  | "circle"
  | "curve";

/** Chart patterns: one point per click, all kept in `path`, labelled in order. */
export const PATTERN_LABELS: Partial<Record<DrawTool, string[]>> = {
  xabcd: ["X", "A", "B", "C", "D"],
  abcd: ["A", "B", "C", "D"],
  headshoulders: ["", "LS", "", "H", "", "RS", ""],
  elliott: ["0", "1", "2", "3", "4", "5"],
  triangle: ["A", "B", "C"],
};
export const isPattern = (t: DrawTool) => t in PATTERN_LABELS;

/** A chart point: a time (unix seconds, may be between or beyond candles) and a price in USDC per token. */
export type DrawPoint = { time: number; price: number };

/**
 * A drawing, in units that survive timeframe and Price / MCap changes. One-point tools use `a`; a channel's `c` sets
 * its parallel line; a long / short position's `c` is its stop (`a` the entry, `b` the target).
 */
export type Drawing = { id: string; tool: DrawTool; a: DrawPoint; b?: DrawPoint; c?: DrawPoint; color?: string; text?: string; path?: DrawPoint[] };

/** Which part of a drawing is under the pointer: one of its points (a pattern's are p0, p1…), or the whole of it. */
export type DrawPart = "a" | "b" | "c" | "body" | `p${number}`;

/** How many clicks each tool takes. */
export const TOOL_POINTS: Record<DrawTool, number> = {
  ray: 1,
  hline: 1,
  vline: 1,
  text: 1,
  emoji: 1,
  // A brush stroke is drawn by dragging, not by clicks.
  brush: 1,
  trend: 2,
  arrow: 2,
  rect: 2,
  ruler: 2,
  fib: 2,
  long: 2,
  short: 2,
  channel: 3,
  callout: 2,
  pitchfork: 3,
  gannfan: 2,
  xabcd: 5,
  abcd: 4,
  headshoulders: 7,
  elliott: 6,
  triangle: 3,
  fibext: 3,
  fibtime: 2,
  circle: 2,
  curve: 3,
};

export const TOOL_COLOR: Record<DrawTool, string> = {
  ray: "#ffd166",
  hline: "#ffd166",
  vline: "#8f939b",
  trend: "#4cc9f0",
  arrow: "#f3f3f0",
  channel: "#c792ea",
  rect: "#4cc9f0",
  text: "#f3f3f0",
  emoji: "#f3f3f0",
  brush: "#ff9d6e",
  ruler: "#5cc08c",
  fib: "#8f939b",
  long: "#5cc08c",
  short: "#e5484d",
  callout: "#f3f3f0",
  pitchfork: "#ff9d6e",
  gannfan: "#90be6d",
  xabcd: "#4cc9f0",
  abcd: "#c792ea",
  headshoulders: "#ffd166",
  elliott: "#7bdff2",
  triangle: "#f4a261",
  fibext: "#8f939b",
  fibtime: "#7bdff2",
  circle: "#c792ea",
  curve: "#ffd166",
};

/** Trend-based Fib extension levels, measured from C by the A→B move. */
const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];
/** Fib time zones: bars from A, in units of the A→B distance. */
const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

/** A long / short position's default stop: half the distance to the target on the other side (2 : 1 reward to risk). */
export function defaultStop(entry: DrawPoint, target: DrawPoint): DrawPoint {
  const price = entry.price - (target.price - entry.price) / 2;
  return { time: target.time, price: Math.max(price, entry.price * 0.01) };
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ["#8f939b", "#e5484d", "#ff9d6e", "#5cc08c", "#4cc9f0", "#c792ea", "#8f939b"];
const HANDLE = 7;
const NEAR = 5;

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];
type XY = { x: number; y: number };

const distToSegment = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const inBox = (p: XY, a: XY, b: XY, pad = 0) =>
  p.x >= Math.min(a.x, b.x) - pad && p.x <= Math.max(a.x, b.x) + pad && p.y >= Math.min(a.y, b.y) - pad && p.y <= Math.max(a.y, b.y) + pad;
/** A channel's parallel line: how far (in y) `c` sits from the line through a and b. */
const channelOffset = (a: XY, b: XY, c: XY) => c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / Math.max(1e-9, b.x - a.x));

/**
 * Every drawing on the price pane, as one series primitive: painted on the chart's own canvas (so it pans, zooms and
 * scales with the candles, and appears in snapshots). Times map to x through the candles' times, extrapolated by the
 * interval past either end, so a trendline can run into the future and drawings keep their place across timeframes.
 * It also answers what's under the pointer (hitTest), moves a drawing by a screen offset (moved) and snaps a point to
 * the nearest open / high / low / close (snap), so ProChart can select, drag and place them.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private drawings: Drawing[] = [];
  private draft: Drawing | null = null;
  private selected: string | null = null;
  private hidden = false;
  private candles: Candle[] = [];
  private times: number[] = [];
  private interval = 60;
  private k = 1;
  private fmt: (v: number) => string = (v) => String(v);
  private up = "#5cc08c";
  private down = "#e5484d";
  private width = 0;
  private height = 0;

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

  setDrawings(drawings: Drawing[], draft: Drawing | null, selected: string | null, hidden: boolean) {
    this.drawings = drawings;
    this.draft = draft;
    this.selected = selected;
    this.hidden = hidden;
    this.request?.();
  }

  setFrame(candles: Candle[], interval: number, k: number, fmt: (v: number) => string, colors: { up: string; down: string }) {
    this.candles = candles;
    this.times = candles.map((c) => c.time);
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

  private xy(p: DrawPoint): XY | null {
    const x = this.x(p.time);
    const y = this.y(p.price);
    return x === null || y === null ? null : { x, y };
  }

  /** The point at screen (x, y), in USDC per token. */
  pointAtXY(x: number, y: number): DrawPoint | null {
    const l = this.chart?.timeScale().coordinateToLogical(x);
    const p = this.series?.coordinateToPrice(y);
    if (l === null || l === undefined || p === null || p === undefined || p <= 0) return null;
    return { time: this.timeOf(l), price: p / this.k };
  }

  /** Screen position of a drawing point, for the selected drawing's toolbar and the text editor. */
  screenOf(p: DrawPoint): XY | null {
    return this.xy(p);
  }

  /**
   * Snaps a point to the nearest open / high / low / close of the bar under it, when one is within `radius` pixels
   * (the drawing magnet). Otherwise the point is unchanged.
   */
  snap(p: DrawPoint, radius = 14): DrawPoint {
    if (this.candles.length === 0) return p;
    const c = this.candles[Math.round(this.logicalOf(p.time))];
    const py = this.y(p.price);
    if (!c || py === null) return p;
    let best: number | null = null;
    let bestD = radius;
    for (const v of [c.open, c.high, c.low, c.close]) {
      const vy = this.y(v);
      if (vy === null) continue;
      const d = Math.abs(vy - py);
      if (d <= bestD) {
        bestD = d;
        best = v;
      }
    }
    return best === null ? p : { time: c.time, price: best };
  }

  /** The topmost drawing under (x, y): a point handle first, then the body. */
  drawingAt(x: number, y: number): { id: string; part: DrawPart } | null {
    if (this.hidden) return null;
    const p = { x, y };
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      const a = this.xy(d.a);
      if (!a) continue;
      if (isPattern(d.tool)) {
        const pts = (d.path ?? []).map((q) => this.xy(q));
        for (let j = 0; j < pts.length; j++) {
          const q = pts[j];
          if (q && Math.hypot(q.x - x, q.y - y) <= HANDLE) return { id: d.id, part: `p${j}` };
        }
        for (let j = 1; j < pts.length; j++) {
          const [u, v] = [pts[j - 1], pts[j]];
          if (u && v && distToSegment(p, u, v) <= NEAR) return { id: d.id, part: "body" };
        }
        continue;
      }
      const b = d.b ? this.xy(d.b) : null;
      const stop = d.tool === "long" || d.tool === "short" ? (d.c ?? (d.b ? defaultStop(d.a, d.b) : undefined)) : d.c;
      const c = stop ? this.xy(stop) : null;
      // Handles; one-point marks and strokes are grabbed by their body (they move as a whole anyway).
      if (TOOL_POINTS[d.tool] > 1 || d.tool === "ray") {
        if (Math.hypot(a.x - x, a.y - y) <= HANDLE) return { id: d.id, part: "a" };
        if (b && Math.hypot(b.x - x, b.y - y) <= HANDLE) return { id: d.id, part: "b" };
        if (c && Math.hypot(c.x - x, c.y - y) <= HANDLE) return { id: d.id, part: "c" };
      }
      if (this.onBody(d, p, a, b, c)) return { id: d.id, part: "body" };
    }
    return null;
  }

  private onBody(d: Drawing, p: XY, a: XY, b: XY | null, c: XY | null): boolean {
    switch (d.tool) {
      case "ray":
        return Math.abs(p.y - a.y) <= NEAR && p.x >= a.x - NEAR;
      case "hline":
        return Math.abs(p.y - a.y) <= NEAR;
      case "vline":
        return Math.abs(p.x - a.x) <= NEAR;
      case "text": {
        const tw = Math.max(40, (d.text ?? "").length * 7 + 12);
        return p.x >= a.x - 4 && p.x <= a.x + tw && p.y >= a.y - 12 && p.y <= a.y + 10;
      }
      case "emoji":
        return Math.abs(p.x - a.x) <= 14 && Math.abs(p.y - a.y) <= 14;
      case "callout": {
        if (!b) return false;
        const tw = Math.max(60, (d.text ?? "").length * 7 + 16);
        return (p.x >= b.x - 4 && p.x <= b.x + tw && p.y >= b.y - 13 && p.y <= b.y + 13) || distToSegment(p, a, b) <= NEAR;
      }
      case "pitchfork":
        return this.pitchforkLines(a, b, c).some(([u, v]) => distToSegment(p, u, v) <= NEAR);
      case "fibext":
        return (
          c !== null &&
          d.c !== undefined &&
          d.b !== undefined &&
          FIB_EXT_LEVELS.some((level) => {
            const y = this.y(d.c!.price + (d.b!.price - d.a.price) * level);
            return y !== null && Math.abs(p.y - y) <= NEAR && p.x >= Math.min(a.x, c.x) && p.x <= this.width;
          })
        );
      case "fibtime":
        return b !== null && this.fibTimeXs(d).some((x) => Math.abs(p.x - x) <= NEAR);
      case "circle": {
        if (!b) return false;
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        return Math.hypot(p.x - a.x, p.y - a.y) <= r + NEAR;
      }
      case "curve": {
        if (!b) return false;
        const pts = this.curvePoints(a, b, c);
        for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= NEAR) return true;
        return false;
      }
      case "gannfan":
        return b !== null && this.gannLines(a, b).some(([, v]) => distToSegment(p, a, v) <= NEAR);
      case "brush": {
        const pts = (d.path ?? []).map((q) => this.xy(q)).filter((q): q is XY => q !== null);
        for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= NEAR) return true;
        return false;
      }
      case "trend":
      case "arrow":
        return b !== null && distToSegment(p, a, b) <= NEAR;
      case "rect":
      case "ruler":
        return b !== null && inBox(p, a, b, 2);
      case "fib":
        if (!b || !d.b) return false;
        return FIB_LEVELS.some((level) => {
          const y = this.y(d.b!.price + (d.a.price - d.b!.price) * level);
          return y !== null && Math.abs(p.y - y) <= NEAR && p.x >= Math.min(a.x, b.x) && p.x <= this.width;
        });
      case "channel": {
        if (!b) return false;
        if (distToSegment(p, a, b) <= NEAR) return true;
        if (!c) return false;
        const off = channelOffset(a, b, c);
        if (distToSegment(p, { x: a.x, y: a.y + off }, { x: b.x, y: b.y + off }) <= NEAR) return true;
        // Inside the band between the two lines.
        if (p.x < Math.min(a.x, b.x) || p.x > Math.max(a.x, b.x)) return false;
        const base = a.y + ((b.y - a.y) * (p.x - a.x)) / Math.max(1e-9, b.x - a.x);
        return (p.y - base) * (p.y - (base + off)) <= 0;
      }
      case "long":
      case "short": {
        if (!b || !c) return false;
        const right = Math.max(b.x, a.x + 40);
        return p.x >= a.x && p.x <= right && p.y >= Math.min(b.y, c.y) && p.y <= Math.max(b.y, c.y);
      }
      default:
        return false;
    }
  }

  /**
   * `d` moved by a screen offset: the dragged point alone, or every point for the body. Done in screen space, so a
   * drag follows the pointer on log and percent scales too.
   */
  moved(d: Drawing, part: DrawPart, dx: number, dy: number): Drawing {
    const shift = (p: DrawPoint | undefined): DrawPoint | undefined => {
      if (!p) return p;
      const s = this.xy(p);
      if (!s) return p;
      return this.pointAtXY(s.x + dx, s.y + dy) ?? p;
    };
    const position = d.tool === "long" || d.tool === "short";
    const base = position && !d.c && d.b ? { ...d, c: defaultStop(d.a, d.b) } : d;
    if (part === "body") {
      // A one-point line moves along its own axis only.
      if (d.tool === "hline") return { ...d, a: { ...d.a, price: shift(d.a)!.price } };
      if (d.tool === "vline") return { ...d, a: { ...d.a, time: shift(d.a)!.time } };
      return { ...base, a: shift(base.a)!, b: shift(base.b), c: shift(base.c), ...(base.path ? { path: base.path.map((q) => shift(q)!) } : {}) };
    }
    if (part.startsWith("p") && base.path) {
      const j = Number(part.slice(1));
      const path = base.path.map((q, i) => (i === j ? shift(q)! : q));
      return { ...base, path, a: path[0] };
    }
    const next: Drawing = { ...base, [part]: shift(base[part as "a" | "b" | "c"]) };
    // A position's target and stop share the box's right edge: dragging either sets its price, b sets the width.
    if (position && part === "c" && next.c && next.b) next.c = { time: next.b.time, price: next.c.price };
    if (position && part === "b" && next.b && next.c) next.c = { time: next.b.time, price: next.c.price };
    return next;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => "top", renderer: () => ({ draw: (target: Target) => this.draw(target) }) }];
  }

  private draw(target: Target) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.width = mediaSize.width;
      this.height = mediaSize.height;
      ctx.save();
      ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
      ctx.textBaseline = "middle";
      if (!this.hidden) for (const d of this.drawings) this.drawOne(ctx, d, false);
      if (this.draft) this.drawOne(ctx, this.draft, true);
      const sel = this.hidden ? undefined : this.drawings.find((d) => d.id === this.selected);
      if (sel) this.drawHandles(ctx, sel);
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
    ctx.setLineDash([]);
    ctx.strokeRect(left + 0.5, y - 7.5, w - 1, 15);
    ctx.fillStyle = color;
    ctx.fillText(text, left + 4, y + 0.5);
  }

  private pct(from: number, to: number) {
    const v = from > 0 ? (to / from - 1) * 100 : 0;
    return `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 100 ? 0 : 2)}%`;
  }

  private drawOne(ctx: CanvasRenderingContext2D, d: Drawing, draft: boolean) {
    ctx.globalAlpha = draft ? 0.7 : 1;
    ctx.setLineDash([]);
    const color = d.color ?? TOOL_COLOR[d.tool];
    const width = this.width;
    const a = this.xy(d.a);
    if (!a) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.25;

    if (d.tool === "ray" || d.tool === "hline") {
      ctx.beginPath();
      ctx.moveTo(d.tool === "ray" ? a.x : 0, a.y);
      ctx.lineTo(width, a.y);
      ctx.stroke();
      if (d.tool === "ray") this.dot(ctx, a.x, a.y, color);
      this.label(ctx, this.fmt(d.a.price * this.k), width - 4, a.y, color, "right");
      return;
    }
    if (d.tool === "vline") {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, 0);
      ctx.lineTo(a.x, this.height);
      ctx.stroke();
      const t = new Date(Math.round(d.a.time) * 1000);
      this.label(ctx, `${t.toISOString().slice(5, 16).replace("T", " ")} UTC`, a.x, this.height - 12, color, "center");
      return;
    }
    if (d.tool === "emoji") {
      ctx.font = "22px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.text || "🚀", a.x, a.y);
      ctx.textAlign = "left";
      ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
      return;
    }
    if (d.tool === "brush") {
      const pts = (d.path ?? []).map((q) => this.xy(q)).filter((q): q is XY => q !== null);
      if (pts.length < 2) return;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.stroke();
      return;
    }
    if (isPattern(d.tool)) {
      this.drawPattern(ctx, d, color);
      return;
    }
    if (d.tool === "text") {
      ctx.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
      const text = d.text || "Text";
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = "#141518dd";
      ctx.fillRect(a.x - 4, a.y - 11, w, 20);
      ctx.fillStyle = color;
      ctx.fillRect(a.x - 4, a.y - 11, 2, 20);
      ctx.fillText(text, a.x + 4, a.y);
      ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
      return;
    }

    const b = d.b ? this.xy(d.b) : null;
    if (!b || !d.b) return;
    const c = d.c ? this.xy(d.c) : null;

    if (d.tool === "callout") {
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      this.dot(ctx, a.x, a.y, color);
      ctx.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
      const text = d.text || "Note";
      const w = Math.max(60, ctx.measureText(text).width + 16);
      ctx.fillStyle = "#1b1d22f2";
      ctx.fillRect(b.x - 4, b.y - 13, w, 26);
      ctx.strokeStyle = color;
      ctx.strokeRect(b.x - 3.5, b.y - 12.5, w - 1, 25);
      ctx.fillStyle = color;
      ctx.fillText(text, b.x + 4, b.y + 0.5);
      ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
      return;
    }

    if (d.tool === "fibext") {
      // Trend-based extension: each level is C plus that multiple of the A→B move, from C to the right edge.
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "#8f939b";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (c) ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!c || !d.c) return;
      const left = Math.min(a.x, c.x);
      FIB_EXT_LEVELS.forEach((level, i) => {
        const price = d.c!.price + (d.b!.price - d.a.price) * level;
        const y = this.y(price);
        if (y === null) return;
        const col = FIB_COLORS[i % FIB_COLORS.length];
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillText(`${level} (${this.fmt(price * this.k)})`, left + 4, y - 7);
      });
      return;
    }

    if (d.tool === "fibtime") {
      ctx.lineWidth = 1;
      this.fibTimeXs(d).forEach((x, i) => {
        ctx.strokeStyle = i === 0 ? color : `${color}aa`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(String(FIB_TIME[i]), x + 3, 12);
      });
      return;
    }

    if (d.tool === "circle") {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.fillStyle = `${color}1a`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (d.tool === "curve") {
      const pts = this.curvePoints(a, b, c);
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.stroke();
      if (c && (this.selected === d.id || draft)) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = `${color}66`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }

    if (d.tool === "pitchfork") {
      const lines = this.pitchforkLines(a, b, c);
      ctx.lineWidth = 1.25;
      lines.forEach(([u, v], i) => {
        ctx.setLineDash(i === 0 ? [] : [5, 3]);
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      if (c) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        if (lines.length === 3) {
          ctx.fillStyle = `${color}14`;
          ctx.beginPath();
          ctx.moveTo(lines[1][0].x, lines[1][0].y);
          ctx.lineTo(lines[1][1].x, lines[1][1].y);
          ctx.lineTo(lines[2][1].x, lines[2][1].y);
          ctx.lineTo(lines[2][0].x, lines[2][0].y);
          ctx.closePath();
          ctx.fill();
        }
      }
      return;
    }

    if (d.tool === "gannfan") {
      ctx.lineWidth = 1;
      for (const [label, end] of this.gannLines(a, b)) {
        ctx.strokeStyle = label === "1/1" ? color : `${color}aa`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.fillStyle = `${color}cc`;
        const lx = a.x + (end.x - a.x) * 0.85;
        const ly = a.y + (end.y - a.y) * 0.85;
        ctx.fillText(label, lx + 3, ly);
      }
      return;
    }

    if (d.tool === "trend" || d.tool === "arrow") {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (d.tool === "arrow") {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - 10 * Math.cos(ang - 0.45), b.y - 10 * Math.sin(ang - 0.45));
        ctx.lineTo(b.x - 10 * Math.cos(ang + 0.45), b.y - 10 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fill();
        return;
      }
      this.dot(ctx, a.x, a.y, color);
      this.dot(ctx, b.x, b.y, color);
      // The move along the line, shown while placing or selected: no separate ruler needed.
      if (this.selected === d.id || draft) this.label(ctx, this.pct(d.a.price, d.b.price), b.x + 8, b.y, color);
      return;
    }

    if (d.tool === "rect") {
      ctx.fillStyle = `${color}1f`;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      return;
    }

    if (d.tool === "channel") {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (!c) return;
      const off = channelOffset(a, b, c);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + off);
      ctx.lineTo(b.x, b.y + off);
      ctx.stroke();
      ctx.fillStyle = `${color}14`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + off);
      ctx.lineTo(a.x, a.y + off);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + off / 2);
      ctx.lineTo(b.x, b.y + off / 2);
      ctx.stroke();
      return;
    }

    if (d.tool === "ruler") {
      const rising = d.b.price >= d.a.price;
      const tone = d.color ?? (rising ? this.up : this.down);
      ctx.fillStyle = `${tone}22`;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const bars = Math.round(Math.abs(this.logicalOf(d.b.time) - this.logicalOf(d.a.time)));
      const diff = (d.b.price - d.a.price) * this.k;
      const secs = Math.abs(d.b.time - d.a.time);
      const span = secs >= 86_400 ? `${(secs / 86_400).toFixed(1)}d` : secs >= 3_600 ? `${(secs / 3_600).toFixed(1)}h` : secs >= 60 ? `${Math.round(secs / 60)}m` : `${Math.round(secs)}s`;
      const text = `${this.pct(d.a.price, d.b.price)}  ${diff >= 0 ? "+" : "−"}${this.fmt(Math.abs(diff))}  ${bars} bar${bars === 1 ? "" : "s"} · ${span}`;
      this.label(ctx, text, (a.x + b.x) / 2, rising ? Math.min(a.y, b.y) - 12 : Math.max(a.y, b.y) + 12, tone, "center");
      return;
    }

    if (d.tool === "fib") {
      // Fib retracement: 1 at the first point, 0 at the second, each level from the left point to the right edge.
      const left = Math.min(a.x, b.x);
      let prevY: number | null = null;
      FIB_LEVELS.forEach((level, i) => {
        const price = d.b!.price + (d.a.price - d.b!.price) * level;
        const y = this.y(price);
        if (y === null) return;
        if (prevY !== null) {
          ctx.fillStyle = `${FIB_COLORS[i]}12`;
          ctx.fillRect(left, Math.min(prevY, y), width - left, Math.abs(y - prevY));
        }
        prevY = y;
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
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }

    // Long / short position: entry a, target b, stop c; reward and risk boxes with their moves and R:R.
    const stop = d.c ?? defaultStop(d.a, d.b);
    const sy = this.y(stop.price);
    if (sy === null) return;
    const right = Math.max(b.x, a.x + 40);
    const w = right - a.x;
    ctx.fillStyle = `${this.up}26`;
    ctx.fillRect(a.x, Math.min(a.y, b.y), w, Math.abs(b.y - a.y));
    ctx.fillStyle = `${this.down}26`;
    ctx.fillRect(a.x, Math.min(a.y, sy), w, Math.abs(sy - a.y));
    ctx.strokeStyle = "#8f939b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(right, a.y);
    ctx.stroke();
    const reward = Math.abs(d.b.price - d.a.price);
    const risk = Math.abs(d.a.price - stop.price);
    const rr = risk > 0 ? reward / risk : 0;
    this.label(ctx, `Target ${this.fmt(d.b.price * this.k)}  ${this.pct(d.a.price, d.b.price)}`, a.x + w / 2, b.y < a.y ? b.y - 10 : b.y + 10, this.up, "center");
    this.label(ctx, `Stop ${this.fmt(stop.price * this.k)}  ${this.pct(d.a.price, stop.price)}`, a.x + w / 2, sy < a.y ? sy - 10 : sy + 10, this.down, "center");
    this.label(ctx, `${d.tool === "long" ? "Long" : "Short"} ${this.fmt(d.a.price * this.k)} · R:R ${rr.toFixed(2)}`, a.x + w / 2, a.y, "#f3f3f0", "center");
  }

  /** Fib time zones' x positions: A, then A + n × (B − A) bars for each Fibonacci n. */
  private fibTimeXs(d: Drawing): number[] {
    if (!d.b || !this.chart) return [];
    const la = this.logicalOf(d.a.time);
    const unit = this.logicalOf(d.b.time) - la;
    if (Math.abs(unit) < 0.01) return [];
    const ts = this.chart.timeScale();
    return FIB_TIME.flatMap((n) => {
      const x = ts.logicalToCoordinate((la + unit * n) as Logical);
      return x === null || x < -50 || x > this.width + 50 ? [] : [x];
    });
  }

  /** A curve from A to B bending toward C (a quadratic Bézier), as short segments; straight until C is placed. */
  private curvePoints(a: XY, b: XY, c: XY | null): XY[] {
    if (!c) return [a, b];
    return Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      const u = 1 - t;
      return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
    });
  }

  /** A pitchfork's median (from the pivot through the midpoint of b and c) and its two parallels, to the right edge. */
  private pitchforkLines(a: XY, b: XY | null, c: XY | null): [XY, XY][] {
    if (!b) return [];
    if (!c) return [[a, b]];
    const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const dx = m.x - a.x;
    if (Math.abs(dx) < 1) return [[a, m]];
    const slope = (m.y - a.y) / dx;
    const to = (from: XY) => {
      const x = Math.max(this.width, from.x + 1);
      return { x, y: from.y + slope * (x - from.x) };
    };
    return [
      [a, to(m)],
      [b, to(b)],
      [c, to(c)],
    ];
  }

  /** A Gann fan from a, its 1/1 line through b, and the 1/2…1/8 and 2/1…8/1 lines either side, out to the edge. */
  private gannLines(a: XY, b: XY): [string, XY][] {
    const dx = b.x - a.x || 1;
    const dy = b.y - a.y;
    const ratios: [string, number, number][] = [
      ["1/8", 1, 1 / 8],
      ["1/4", 1, 1 / 4],
      ["1/3", 1, 1 / 3],
      ["1/2", 1, 1 / 2],
      ["1/1", 1, 1],
      ["2/1", 1 / 2, 1],
      ["3/1", 1 / 3, 1],
      ["4/1", 1 / 4, 1],
      ["8/1", 1 / 8, 1],
    ];
    const reach = Math.max(1, (Math.max(this.width, b.x) - a.x) / Math.abs(dx));
    return ratios.map(([label, fx, fy]) => [label, { x: a.x + dx * fx * reach, y: a.y + dy * fy * reach }]);
  }

  /** A chart pattern: its legs through every point, the point labels, and the pattern's own guides and ratios. */
  private drawPattern(ctx: CanvasRenderingContext2D, d: Drawing, color: string) {
    const pts = (d.path ?? []).map((q) => this.xy(q));
    if (pts.some((q) => q === null) || pts.length < 2) return;
    const P = pts as XY[];
    const prices = (d.path ?? []).map((q) => q.price);
    const labels = PATTERN_LABELS[d.tool] ?? [];
    const ratio = (i: number, j: number, k: number) => {
      const leg = Math.abs(prices[j] - prices[i]);
      return leg > 0 ? (Math.abs(prices[k] - prices[j]) / leg).toFixed(3) : "–";
    };
    const dashed = (i: number, k: number, text: string) => {
      if (!P[i] || !P[k]) return;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = `${color}aa`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(P[i].x, P[i].y);
      ctx.lineTo(P[k].x, P[k].y);
      ctx.stroke();
      ctx.restore();
      this.label(ctx, text, (P[i].x + P[k].x) / 2, (P[i].y + P[k].y) / 2, color, "center");
    };

    // Shaded legs: XABCD's two triangles, a triangle pattern's body.
    const fillTri = (i: number, j: number, k: number) => {
      if (!P[i] || !P[j] || !P[k]) return;
      ctx.fillStyle = `${color}1a`;
      ctx.beginPath();
      ctx.moveTo(P[i].x, P[i].y);
      ctx.lineTo(P[j].x, P[j].y);
      ctx.lineTo(P[k].x, P[k].y);
      ctx.closePath();
      ctx.fill();
    };
    if (d.tool === "xabcd") {
      fillTri(0, 1, 2);
      fillTri(2, 3, 4);
    }
    if (d.tool === "triangle") fillTri(0, 1, 2);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (const q of P.slice(1)) ctx.lineTo(q.x, q.y);
    if (d.tool === "triangle" && P.length === 3) ctx.closePath();
    ctx.stroke();

    if (d.tool === "xabcd" && P.length >= 3) {
      dashed(0, 2, `AB ${ratio(0, 1, 2)}`);
      if (P.length >= 4) dashed(1, 3, `BC ${ratio(1, 2, 3)}`);
      if (P.length >= 5) {
        dashed(2, 4, `CD ${ratio(2, 3, 4)}`);
        const xa = Math.abs(prices[1] - prices[0]);
        dashed(0, 4, `AD ${xa > 0 ? (Math.abs(prices[4] - prices[1]) / xa).toFixed(3) : "–"}`);
      }
    }
    if (d.tool === "abcd" && P.length >= 3) {
      dashed(0, 2, `BC ${ratio(0, 1, 2)}`);
      if (P.length >= 4) dashed(1, 3, `CD ${ratio(1, 2, 3)}`);
    }
    if (d.tool === "headshoulders" && P.length >= 5) {
      // The neckline through the two troughs, out to the right edge.
      const [t1, t2] = [P[2], P[4]];
      const slope = (t2.y - t1.y) / ((t2.x - t1.x) || 1);
      ctx.save();
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(this.width, t1.y + slope * (this.width - t1.x));
      ctx.stroke();
      ctx.restore();
      this.label(ctx, "Neckline", Math.min(this.width - 40, t2.x + 40), t2.y + slope * 40 + 12, color, "center");
    }

    ctx.font = "bold 11px Inter, ui-sans-serif, system-ui, sans-serif";
    P.forEach((q, i) => {
      const text = labels[i];
      if (!text) return;
      const prevY = P[i - 1]?.y ?? P[i + 1]?.y ?? q.y;
      const nextY = P[i + 1]?.y ?? prevY;
      const peak = q.y <= Math.min(prevY, nextY);
      const ly = peak ? q.y - 12 : q.y + 13;
      if (d.tool === "elliott") {
        ctx.fillStyle = "#141518ee";
        ctx.beginPath();
        ctx.arc(q.x, ly, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(text, q.x, ly + 0.5);
      ctx.textAlign = "left";
    });
    ctx.font = "10.5px JetBrains Mono, ui-monospace, monospace";
  }

  private drawHandles(ctx: CanvasRenderingContext2D, d: Drawing) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const stop = d.tool === "long" || d.tool === "short" ? (d.c ?? (d.b ? defaultStop(d.a, d.b) : undefined)) : d.c;
    for (const p of isPattern(d.tool) ? (d.path ?? []) : [d.a, d.b, stop]) {
      if (!p) continue;
      const s = this.xy(p);
      if (!s) continue;
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#ff5500";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
