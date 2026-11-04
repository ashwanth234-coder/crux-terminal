import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  LogicalRange,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { heikinAshi, type Candle } from "@/lib/candles";
import type { Study, StudyLine } from "@/lib/indicators";
import { DrawingsPrimitive, type DrawPoint } from "./drawings";
import { VolumeProfilePrimitive } from "./volumeProfile";
import { palette, type ChartSettings, type ChartType, type ScaleMode } from "./settings";

type Lc = typeof import("lightweight-charts");

export type Theme = { bg: string; line: string; text: string; chrome: string; dim: string };

/** Formats a value on the price axis: market cap compact ($140.6K) or a token price ($0.000141). */
export type Formatter = (v: number) => string;

const t = (c: Candle) => c.time as UTCTimestamp;

/** The pending-trade candle's smallest height in pixels: a tiny buy still shows. */
const MIN_PENDING_PX = 6;

/** One point of a series as handed to lightweight-charts: a time and its values (or none, a gap). */
type Point = { time: Time; [field: string]: unknown };

/**
 * What a series was last given, as plain numbers: each bar's time and `width` values (NaN for a gap). Comparing
 * these is cheap; the points themselves are only built for the bars actually sent.
 */
type Snapshot = { times: number[]; values: number[]; width: number };

const sameNum = (a: number, b: number) => a === b || (a !== a && b !== b);

/**
 * Hands `next` to `series`, sending only the newest bar and any after it when nothing older changed (a live trade):
 * the library redraws one bar instead of re-reading 20,000. Anything else (another timeframe, units, an older bar
 * that changed) is a full setData. `point(i)` builds bar i (null: none, before a study's first value). Older bars
 * trimmed off the front stay in the series, harmlessly.
 */
function syncSeries(series: ISeriesApi<SeriesType>, prev: Snapshot | undefined, next: Snapshot, point: (i: number) => Point | null): Snapshot {
  const { times, values, width } = next;
  const n = times.length;
  if (prev && prev.width === width && prev.times.length > 0 && n > 0) {
    const last = prev.times.length - 1;
    let j = n - 1;
    while (j >= 0 && j >= n - 64 && times[j] > prev.times[last]) j--;
    const offset = j - last;
    if (j >= 0 && times[j] === prev.times[last] && offset <= 0) {
      let unchanged = true;
      for (let i = Math.max(0, -offset); i < last && unchanged; i++) {
        unchanged = prev.times[i] === times[i + offset];
        for (let w = 0; w < width && unchanged; w++) unchanged = sameNum(prev.values[i * width + w], values[(i + offset) * width + w]);
      }
      if (unchanged) {
        for (let i = j; i < n; i++) {
          const before = i - offset;
          let same = before <= last;
          for (let w = 0; w < width && same; w++) same = sameNum(prev.values[before * width + w], values[i * width + w]);
          const pt = same ? null : point(i);
          if (pt) series.update(pt as never);
        }
        return next;
      }
    }
  }
  const data: Point[] = [];
  for (let i = 0; i < n; i++) {
    const pt = point(i);
    if (pt) data.push(pt);
  }
  series.setData(data as never);
  return next;
}

/** Axis labels for unitless studies: RSI's 0–100 to one place, flows and counts compact. */
const unitless = (v: number) => (Math.abs(v) >= 1_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : v.toFixed(Math.abs(v) >= 100 ? 0 : 1));

/**
 * The CRUX chart on lightweight-charts: one price pane (candles in the chosen style, volume underneath, overlay
 * studies) and one pane per oscillator study (RSI, MACD). Owns every series and price line; ProChart drives it with
 * data and options and listens to the crosshair.
 */
export class ChartEngine {
  readonly chart: IChartApi;
  private readonly lc: Lc;
  private theme: Theme;
  private main: ISeriesApi<SeriesType>;
  private type: ChartType = "candles";
  private readonly volume: ISeriesApi<"Histogram">;
  /** Helper series some styles draw with (HLC area's high and low lines), replaced with the style. */
  private extras: ISeriesApi<SeriesType>[] = [];
  private studySeries: ISeriesApi<SeriesType>[] = [];
  /** What each series was last given (main, volume, the style's helpers, each study line), so updates send only changes. */
  private mainData: Snapshot | undefined;
  private volumeData: Snapshot | undefined;
  private extrasData: Snapshot[] = [];
  private studyData: Snapshot[] = [];
  /** The studies' shape (which lines, panes, colours, units) when their series were built: same shape, same series. */
  private studyShape = "";
  /** Other tokens' closes, on the main price scale (which the chart switches to % while comparing). */
  private compareSeries: ISeriesApi<SeriesType>[] = [];
  private paneLines: IPriceLine[] = [];
  private mainLines: IPriceLine[] = [];
  /** The pending-trade candle's own series (lib/pendingTrades), made on first use. */
  private pending: ISeriesApi<"Candlestick"> | null = null;
  /** Every period on the time axis, quiet ones (drawn blank) included: what the views count in. */
  private slots = 0;
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private markerData: SeriesMarker<Time>[] = [];
  /** Every drawing, painted on the price pane; it moves to the new main series when the style changes. */
  readonly drawings = new DrawingsPrimitive();
  /** The visible-range volume profile (off until set), behind the candles. */
  readonly profile = new VolumeProfilePrimitive();
  private settings: ChartSettings;
  /** The price axis the candles, overlays and compared lines share. */
  private side: "left" | "right" = "right";
  private readonly host: HTMLElement;
  private watermark: { applyOptions(o: object): void; detach(): void } | null = null;

  constructor(lc: Lc, host: HTMLElement, theme: Theme, settings: ChartSettings) {
    this.lc = lc;
    this.host = host;
    this.theme = theme;
    this.settings = settings;
    this.chart = lc.createChart(host, {
      autoSize: true,
      layout: {
        background: { type: lc.ColorType.Solid, color: theme.bg },
        textColor: theme.text,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 11,
        // The library's attribution is given in the chart's footnote instead (its licence allows either).
        attributionLogo: false,
        panes: { separatorColor: theme.line, separatorHoverColor: `${theme.chrome}33` },
      },
      rightPriceScale: { borderColor: theme.line, scaleMargins: { top: 0.1, bottom: 0.22 } },
      // Candles keep a trading-terminal width (about 7 px) instead of stretching to fill the pane when there are few.
      timeScale: { borderColor: theme.line, timeVisible: true, rightOffset: 10, barSpacing: 7, minBarSpacing: 0.5 },
      crosshair: {
        horzLine: { style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2d33" },
        vertLine: { style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2d33" },
      },
    });
    this.volume = this.chart.addSeries(lc.HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    this.volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.main = this.addMain("candles");
    this.markers = lc.createSeriesMarkers(this.main, []);
    this.main.attachPrimitive(this.drawings);
    this.main.attachPrimitive(this.profile);
    this.applySettings(settings);
  }

  remove() {
    this.chart.remove();
  }

  /** New colours (the site's light / dark switch), applied in place: the view, drawings and settings are kept. */
  setTheme(theme: Theme) {
    this.theme = theme;
    this.chart.applyOptions({
      layout: { textColor: theme.text, panes: { separatorColor: theme.line, separatorHoverColor: `${theme.chrome}33` } },
      rightPriceScale: { borderColor: theme.line },
      timeScale: { borderColor: theme.line },
    });
    this.applySettings(this.settings);
  }

  /** Grid, background, crosshair, scales, time zone, volume, up / down colours. */
  applySettings(s: ChartSettings) {
    this.settings = s;
    // Grid lines a step fainter than borders, as on a trading terminal: they guide the eye without boxing the candles in.
    const faint = /^#[0-9a-f]{6}$/i.test(this.theme.line) ? `${this.theme.line}99` : this.theme.line;
    const grid = (on: boolean) => (s.grid && on ? faint : "transparent");
    const bg = s.background === "black" ? "#000000" : s.background === "slate" ? "#131722" : this.theme.bg;
    const local = s.timezone === "local";
    const two = (n: number) => String(n).padStart(2, "0");
    const fmtTime = (ts: number) => {
      const d = new Date(ts * 1000);
      return local
        ? `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
        : d.toISOString().slice(0, 16).replace("T", " ");
    };
    this.chart.applyOptions({
      layout: { background: { type: this.lc.ColorType.Solid, color: bg } },
      grid: { vertLines: { color: grid(s.gridStyle !== "horz") }, horzLines: { color: grid(s.gridStyle !== "vert") } },
      leftPriceScale: { visible: s.scaleSide === "left", borderColor: this.theme.line, scaleMargins: { top: 0.1, bottom: 0.22 } },
      rightPriceScale: { visible: s.scaleSide === "right" },
      localization: { timeFormatter: (ts: number) => `${fmtTime(ts)}${local ? "" : " UTC"}` },
      timeScale: {
        secondsVisible: s.seconds,
        // Midnight shows the date, any other mark the time, in the chosen zone.
        tickMarkFormatter: (ts: number) => {
          const d = new Date(ts * 1000);
          const [h, m, day, mon] = local ? [d.getHours(), d.getMinutes(), d.getDate(), d.getMonth()] : [d.getUTCHours(), d.getUTCMinutes(), d.getUTCDate(), d.getUTCMonth()];
          return h === 0 && m === 0 ? `${day}/${mon + 1}` : `${two(h)}:${two(m)}`;
        },
      },
      crosshair: {
        mode: s.cursor === "arrow" ? this.lc.CrosshairMode.Hidden : s.magnet ? this.lc.CrosshairMode.MagnetOHLC : this.lc.CrosshairMode.Normal,
        vertLine: { visible: s.cursor === "cross", labelVisible: s.cursor !== "arrow" },
        horzLine: { visible: s.cursor === "cross", labelVisible: s.cursor !== "arrow" },
      },
    });
    this.volume.applyOptions({ visible: s.volume });
    this.side = s.scaleSide;
    this.setType(this.type, true);
  }

  private addMain(type: ChartType): ISeriesApi<SeriesType> {
    const series = this.addMainSeries(type);
    const s = this.settings;
    series.applyOptions({ priceScaleId: this.side, priceLineVisible: s.lastPriceLine });
    if (type === "candles" || type === "heikin" || type === "hollow") {
      const { up, down } = palette(s);
      series.applyOptions({ wickVisible: s.wicks, ...(type !== "hollow" ? { borderVisible: s.borders, borderUpColor: up, borderDownColor: down } : {}) } as never);
    }
    return series;
  }

  private addMainSeries(type: ChartType): ISeriesApi<SeriesType> {
    const { up, down } = palette(this.settings);
    const chrome = this.theme.chrome;
    const lc = this.lc;
    switch (type) {
      case "hlc":
        return this.chart.addSeries(lc.BarSeries, { upColor: up, downColor: down, openVisible: false, thinBars: false });
      case "linemarkers":
        return this.chart.addSeries(lc.LineSeries, { color: chrome, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2.5 });
      case "step":
        return this.chart.addSeries(lc.LineSeries, { color: chrome, lineWidth: 2, lineType: lc.LineType.WithSteps });
      case "hlcarea":
        this.extras = [
          this.chart.addSeries(lc.LineSeries, { color: `${up}aa`, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
          this.chart.addSeries(lc.LineSeries, { color: `${down}aa`, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
        ];
        return this.chart.addSeries(lc.AreaSeries, { lineColor: chrome, topColor: `${chrome}22`, bottomColor: `${chrome}00`, lineWidth: 2 });
      case "columns":
        return this.chart.addSeries(lc.HistogramSeries, { color: up, base: 0 });
      case "highlow":
        return this.chart.addSeries(lc.CandlestickSeries, { upColor: up, downColor: down, wickVisible: false, borderVisible: false });
      case "heikin":
        return this.chart.addSeries(lc.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
      case "hollow":
        return this.chart.addSeries(lc.CandlestickSeries, {
          upColor: "rgba(0,0,0,0)",
          borderUpColor: up,
          wickUpColor: up,
          downColor: down,
          borderDownColor: down,
          wickDownColor: down,
          borderVisible: true,
        });
      case "bars":
        return this.chart.addSeries(lc.BarSeries, { upColor: up, downColor: down, thinBars: false });
      case "line":
        return this.chart.addSeries(lc.LineSeries, { color: chrome, lineWidth: 2 });
      case "area":
        return this.chart.addSeries(lc.AreaSeries, { lineColor: chrome, topColor: `${chrome}33`, bottomColor: `${chrome}00`, lineWidth: 2 });
      case "baseline":
        return this.chart.addSeries(lc.BaselineSeries, {
          topLineColor: up,
          topFillColor1: `${up}40`,
          topFillColor2: `${up}05`,
          bottomLineColor: down,
          bottomFillColor1: `${down}05`,
          bottomFillColor2: `${down}40`,
          lineWidth: 2,
        });
      default:
        return this.chart.addSeries(lc.CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    }
  }

  /** Swaps the main series' style (recreated, so the next setData fills it). */
  setType(type: ChartType, force = false) {
    if (type === this.type && !force) return;
    this.mainLines = [];
    this.markers?.detach();
    this.main.detachPrimitive(this.drawings);
    this.main.detachPrimitive(this.profile);
    this.chart.removeSeries(this.main);
    for (const s of this.extras) this.chart.removeSeries(s);
    this.extras = [];
    this.mainData = undefined;
    this.extrasData = [];
    this.type = type;
    this.main = this.addMain(type);
    this.markers = this.lc.createSeriesMarkers(this.main, this.markerData);
    this.main.attachPrimitive(this.drawings);
    this.main.attachPrimitive(this.profile);
  }

  /** Marks on the bars (B / S, D, W, T), kept across chart-style changes. */
  setMarkers(markers: SeriesMarker<Time>[]) {
    this.markerData = markers;
    this.markers?.setMarkers(markers);
  }

  /** Candles (in USDC per token) shown in the chosen units: `k` multiplies prices (total supply for market cap). */
  setData(candles: Candle[], k: number, format: Formatter, minMove: number) {
    this.slots = candles.length;
    const { up, down } = palette(this.settings);
    // A price or market cap is never below zero: the axis leaves the room under the candles (where volume sits) unlabelled.
    const priceFormat = { type: "custom" as const, formatter: (v: number) => (v < 0 ? "" : format(v)), minMove };
    this.main.applyOptions({ priceFormat });
    const times = candles.map((c) => c.time);
    const dir = (c: Candle) => (c.close >= c.open ? 1 : 0);
    const flat = (width: number, f: (c: Candle, out: number[]) => void, cs: Candle[] = candles): Snapshot => {
      const values: number[] = [];
      for (const c of cs) f(c, values);
      return { times, values, width };
    };
    if (this.type === "candles" || this.type === "hollow" || this.type === "bars" || this.type === "hlc" || this.type === "heikin") {
      const cs = this.type === "heikin" ? heikinAshi(candles) : candles;
      // A period with no trades keeps its place on the time axis but draws nothing (a run of flat bars read as a dotted line).
      const quiet = (i: number) => candles[i].trades === 0 && candles[i].volume === 0;
      const snap = flat(4, (c, o) => (c.trades === 0 && c.volume === 0 ? o.push(NaN, NaN, NaN, NaN) : o.push(c.open * k, c.high * k, c.low * k, c.close * k)), cs);
      this.mainData = syncSeries(this.main, this.mainData, snap, (i) =>
        quiet(i) ? { time: t(cs[i]) } : { time: t(cs[i]), open: snap.values[i * 4], high: snap.values[i * 4 + 1], low: snap.values[i * 4 + 2], close: snap.values[i * 4 + 3] },
      );
    } else if (this.type === "highlow") {
      // One bar from low to high, coloured by the candle's direction.
      const snap = flat(3, (c, o) => o.push(c.low * k, c.high * k, dir(c)));
      this.mainData = syncSeries(this.main, this.mainData, snap, (i) => {
        const c = candles[i];
        return { time: t(c), open: c.low * k, high: c.high * k, low: c.low * k, close: c.high * k, color: dir(c) ? up : down };
      });
    } else if (this.type === "columns") {
      const snap = flat(2, (c, o) => o.push(c.close * k, dir(c)));
      this.mainData = syncSeries(this.main, this.mainData, snap, (i) => ({ time: t(candles[i]), value: candles[i].close * k, color: `${dir(candles[i]) ? up : down}cc` }));
    } else {
      if (this.type === "hlcarea" && this.extras.length === 2) {
        const sides: [(c: Candle) => number, number][] = [
          [(c) => c.high * k, 0],
          [(c) => c.low * k, 1],
        ];
        for (const [value, i] of sides) {
          this.extrasData[i] = syncSeries(this.extras[i], this.extrasData[i], flat(1, (c, o) => o.push(value(c))), (n) => ({ time: t(candles[n]), value: value(candles[n]) }));
        }
        for (const s of this.extras) s.applyOptions({ priceFormat });
      }
      if (this.type === "baseline" && candles.length) {
        (this.main as ISeriesApi<"Baseline">).applyOptions({ baseValue: { type: "price", price: candles[0].open * k } });
      }
      this.mainData = syncSeries(this.main, this.mainData, flat(1, (c, o) => o.push(c.close * k)), (i) => ({ time: t(candles[i]), value: candles[i].close * k }));
    }
    this.volumeData = syncSeries(this.volume, this.volumeData, flat(2, (c, o) => o.push(c.volume, dir(c))), (i) => ({
      time: t(candles[i]),
      value: candles[i].volume,
      color: `${dir(candles[i]) ? up : down}55`,
    }));
  }

  /**
   * Rebuilds the studies from their computed lines: overlays on the price pane, one pane per oscillator below it.
   * A gap in a line (null) stays a gap: the series gets a blank point there instead of a line drawn across it.
   */
  setStudies(
    computed: { study: Study; lines: StudyLine[]; levels: number[]; widths?: Record<string, number> }[],
    candles: Candle[],
    k: number,
    format: Formatter,
    minMove: number,
  ) {
    const { up, down } = palette(this.settings);
    const shape = JSON.stringify([
      k,
      this.side,
      up,
      down,
      computed.map(({ study, lines, levels, widths }) => [study.id, study.pane, study.priced, levels, widths, lines.map((l) => [l.key, l.kind, l.color])]),
    ]);
    const times = candles.map((c) => c.time);
    // A line's values as numbers (NaN for a gap), and how to build its point at candle i.
    const sourceOf = (line: StudyLine, scale: number) => {
      const values = line.values.map((v) => (v === null ? NaN : (v as number) * scale));
      const firstValue = line.values.findIndex((v) => v !== null);
      const point = (i: number): Point | null => {
        if (i < firstValue || firstValue < 0) return null;
        const value = values[i];
        if (value !== value) return { time: times[i] as Time };
        return line.kind === "histogram" ? { time: times[i] as Time, value, color: value >= 0 ? `${up}88` : `${down}88` } : { time: times[i] as Time, value };
      };
      return { snap: { times, values, width: 1 }, point };
    };
    if (shape === this.studyShape && this.studySeries.length === this.studyData.length) {
      let n = 0;
      for (const { study, lines } of computed) {
        if (study.special) continue;
        for (const line of lines) {
          const { snap, point } = sourceOf(line, study.priced ? k : 1);
          this.studyData[n] = syncSeries(this.studySeries[n], this.studyData[n], snap, point);
          n++;
        }
      }
      return;
    }
    this.studyShape = shape;
    for (const s of this.studySeries) this.chart.removeSeries(s);
    this.studySeries = [];
    this.studyData = [];
    this.paneLines = [];
    while (this.chart.panes().length > 1) this.chart.removePane(this.chart.panes().length - 1);

    let paneIndex = 0;
    for (const { study, lines, levels, widths } of computed) {
      if (study.special) continue;
      const pane = study.pane === "price" ? 0 : ++paneIndex;
      const scale = study.priced ? k : 1;
      const fmt = study.priced ? { type: "custom" as const, formatter: format, minMove } : { type: "custom" as const, formatter: unitless, minMove: 0.01 };
      let first: ISeriesApi<SeriesType> | null = null;
      for (const line of lines) {
        const { snap, point } = sourceOf(line, scale);
        const opts = {
          color: line.color,
          priceLineVisible: false,
          lastValueVisible: pane > 0,
          priceFormat: fmt,
          crosshairMarkerVisible: false,
          ...(pane === 0 ? { priceScaleId: this.side } : {}),
        };
        const series =
          line.kind === "histogram"
            ? this.chart.addSeries(this.lc.HistogramSeries, opts, pane)
            : this.chart.addSeries(this.lc.LineSeries, { ...opts, lineWidth: (widths?.[line.key] ?? 1) as 1 | 2 | 3 | 4 }, pane);
        this.studySeries.push(series);
        this.studyData.push(syncSeries(series, undefined, snap, point));
        first ??= series;
      }
      for (const level of levels) {
        if (first) this.paneLines.push(first.createPriceLine({ price: level, color: `${this.theme.dim}99`, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" }));
      }
    }
    const panes = this.chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
  }

  /** Compared tokens as lines of their closes (`k` scales them like the candles), replaced as a set. */
  setCompare(lines: { key: string; color: string; candles: Candle[] }[], k: number, format: Formatter, minMove: number) {
    for (const s of this.compareSeries) this.chart.removeSeries(s);
    this.compareSeries = lines.map((l) => {
      const s = this.chart.addSeries(this.lc.LineSeries, {
        color: l.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: "custom", formatter: format, minMove },
        priceScaleId: this.side,
      });
      s.setData(l.candles.map((c) => ({ time: t(c), value: c.close * k })));
      return s;
    });
  }

  /**
   * A trade you've just sent: a solid candle on the current bar the moment you press Buy or Sell, from the price now to
   * the expected fill, priced from the pool as it stands. The solver's own trade replaces it (on every chart from the
   * moment it's sent); a failed trade takes it away. Raw prices (scaled by `k` here); null clears it.
   */
  setPending(bar: { time: number; open: number; close: number; side: "buy" | "sell" } | null, k: number) {
    if (!bar) {
      this.pending?.setData([]);
      return;
    }
    const { up: upSolid, down: downSolid } = palette(this.settings);
    const look = { priceScaleId: this.side, upColor: upSolid, downColor: downSolid, borderVisible: false, wickVisible: false, lastValueVisible: false, priceLineVisible: false };
    if (!this.pending) this.pending = this.chart.addSeries(this.lc.CandlestickSeries, look);
    else this.pending.applyOptions(look);
    // A buy always draws up (green), a sell down (red): an average fill a hair either side of the last close mustn't
    // flip its colour. At least MIN_PENDING_PX tall, so a tiny trade is still seen.
    const up = bar.side === "buy";
    const open = bar.open * k;
    let close = up ? Math.max(bar.close * k, open) : Math.min(bar.close * k, open);
    const draw = () => this.pending!.setData([{ time: bar.time as UTCTimestamp, open, close, high: Math.max(open, close), low: Math.min(open, close) }]);
    draw();
    const y0 = this.pending.priceToCoordinate(open);
    const y1 = this.pending.priceToCoordinate(close);
    if (y0 !== null && (y1 === null || Math.abs(y1 - y0) < MIN_PENDING_PX)) {
      const stretched = this.pending.coordinateToPrice(y0 + (up ? -MIN_PENDING_PX : MIN_PENDING_PX));
      if (stretched !== null) {
        close = stretched;
        draw();
      }
    }
  }

  /** Horizontal lines on the price pane (the clearing price, alerts), replaced as a set. */
  setPriceLines(lines: { price: number; color: string; title: string; style?: number }[]) {
    for (const l of this.mainLines) this.main.removePriceLine(l);
    this.mainLines = lines.map((l) =>
      this.main.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style ?? 2, axisLabelVisible: true, title: l.title }),
    );
  }

  setScale(mode: ScaleMode) {
    const m =
      mode === "log"
        ? this.lc.PriceScaleMode.Logarithmic
        : mode === "percent"
          ? this.lc.PriceScaleMode.Percentage
          : mode === "indexed"
            ? this.lc.PriceScaleMode.IndexedTo100
            : this.lc.PriceScaleMode.Normal;
    this.chart.priceScale("right").applyOptions({ mode: m });
    this.chart.priceScale("left").applyOptions({ mode: m });
  }

  /** Flips the price axis upside down (higher prices lower), as a trading terminal's Invert scale. */
  setInverted(on: boolean) {
    this.chart.priceScale("right").applyOptions({ invertScale: on });
    this.chart.priceScale("left").applyOptions({ invertScale: on });
  }

  /** Whether the newest bar has scrolled out of view to the right (the chart shows older history). */
  scrolledBack(): boolean {
    return this.chart.timeScale().scrollPosition() < -1;
  }

  /** Back to the newest bar, keeping the zoom. */
  scrollToLatest() {
    const ts = this.chart.timeScale();
    ts.scrollToPosition(ts.options().rightOffset, false);
  }

  /** Calls `on` whenever the visible bars change (scrolling, zooming, new data). Returns the unsubscribe. */
  onViewChange(on: () => void): () => void {
    const ts = this.chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(on);
    return () => ts.unsubscribeVisibleLogicalRangeChange(on);
  }

  /** The token's symbol faintly behind the candles, or nothing. */
  setWatermark(text: string | null) {
    this.watermark?.detach();
    this.watermark = null;
    if (!text) return;
    this.watermark = this.lc.createTextWatermark(this.chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [{ text, color: `${this.theme.chrome}12`, fontSize: 64, fontStyle: "bold" }],
    }) as never;
  }

  /** The price axis's width, for labels that sit on it. */
  /**
   * The price axis's width in pixels. The library can report 0 for it after a resize; then it's the chart's width less
   * the plotting area's (the time scale spans exactly the plotting area).
   */
  axisWidth(): number {
    const own = this.chart.priceScale(this.side).width();
    if (own > 0) return own;
    return Math.max(0, this.host.clientWidth - this.chart.timeScale().width());
  }

  /** Where a price (in the chart's units) sits on the price axis. */
  yOf(price: number): number | null {
    return this.main.priceToCoordinate(price);
  }

  /** Back to "everything visible, scale fitted": the reset the context menu and Alt+R do. */
  reset() {
    this.chart.priceScale(this.side).applyOptions({ autoScale: true });
    for (const p of this.chart.panes()) for (const s of p.getSeries()) s.priceScale().applyOptions({ autoScale: true });
    this.fit();
  }

  /**
   * Squeezes (factor above 1) or stretches (below 1) the price axis around `y`, pixels from the top of the pane, as
   * scrolling the price axis does on a trading terminal. Turns autoscale off; the auto button or a double-click on the
   * axis turns it back on.
   */
  zoomPrice(factor: number, y: number) {
    const scale = this.chart.priceScale(this.side);
    const range = scale.getVisibleRange();
    if (!range) return;
    const mid = (range.from + range.to) / 2;
    const at = this.main.coordinateToPrice(y) ?? mid;
    scale.applyOptions({ autoScale: false });
    scale.setVisibleRange({ from: at - (at - range.from) * factor, to: at + (range.to - at) * factor });
  }

  autoScale() {
    this.chart.priceScale(this.side).applyOptions({ autoScale: true });
  }

  isAutoScale() {
    return this.chart.priceScale(this.side).options().autoScale;
  }

  /** Every bar in view (the bottom bar's All): fitted when they're too many for their normal width, else as fit(). */
  showAll() {
    const n = this.slots;
    if (n > Math.floor((this.chart.timeScale().width() || 600) / 7)) this.chart.timeScale().fitContent();
    else this.fit();
  }

  /**
   * The opening view: the latest bars at their normal width, newest at the right with room after it, as a trading
   * terminal opens. With fewer bars than fit, they sit on the right and the rest of the pane stays empty instead of
   * blowing each candle up to fill it.
   */
  fit() {
    const n = this.slots;
    if (n === 0) return;
    const width = this.chart.timeScale().width() || 600;
    // Bars at a normal width (7 px); when there are too few to fill the pane at that width, wider (up to 24 px) so they
    // run from the left edge, and the grid's columns stay even instead of one wide empty column before the first bar.
    // Eight bars of room before the first one, so its marks and labels aren't cut by the edge.
    const spacing = n + 18 < width / 7 ? Math.min(24, width / (n + 18)) : 7;
    const shown = width / spacing;
    this.chart.timeScale().setVisibleLogicalRange({ from: n - 1 + 10 - shown, to: n - 1 + 10 });
  }

  /** Shows `from`..`to` (unix seconds); falls back to everything when there's no data there. */
  showRange(from: number, to: number) {
    try {
      this.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
    } catch {
      this.fit();
    }
  }

  /** Puts the crosshair at a time and price (another chart's, in a synced layout), or clears it. */
  showCrosshair(time: number | null, price: number | null) {
    if (time === null || price === null) this.chart.clearCrosshairPosition();
    else this.chart.setCrosshairPosition(price, time as UTCTimestamp, this.main);
  }

  /** The visible time range (unix seconds), or null before there's data. */
  visibleTimes(): { start: number; end: number } | null {
    const r = this.chart.timeScale().getVisibleRange();
    return r ? { start: r.from as number, end: r.to as number } : null;
  }

  onCrosshair(cb: (p: MouseEventParams) => void) {
    this.chart.subscribeCrosshairMove(cb);
  }

  onRange(cb: (r: LogicalRange | null) => void) {
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
  }

  /** The price-axis value at a y coordinate in the price pane. */
  priceAt(y: number): number | null {
    return this.main.coordinateToPrice(y);
  }

  /** The bar index (logical) at an x coordinate, rounded to the nearest bar. */
  barAt(x: number): number | null {
    const l = this.chart.timeScale().coordinateToLogical(x);
    return l === null ? null : Math.round(l);
  }

  /** A drawing point under (x, y) in the price pane, in USDC per token; `snap` pulls it to the bar's nearest O / H / L / C. */
  pointAt(x: number, y: number, snap: boolean): DrawPoint | null {
    const p = this.drawings.pointAtXY(x, y);
    return p && snap ? this.drawings.snap(p) : p;
  }

  /** Zooms to a box dragged on the chart: its time span and (in the chart's units) its price span. */
  zoomTo(x1: number, x2: number, y1: number, y2: number) {
    const l1 = this.chart.timeScale().coordinateToLogical(Math.min(x1, x2));
    const l2 = this.chart.timeScale().coordinateToLogical(Math.max(x1, x2));
    const p1 = this.main.coordinateToPrice(Math.max(y1, y2));
    const p2 = this.main.coordinateToPrice(Math.min(y1, y2));
    if (l1 !== null && l2 !== null && l2 - l1 >= 1) this.chart.timeScale().setVisibleLogicalRange({ from: l1, to: l2 });
    if (p1 !== null && p2 !== null && p2 > p1) {
      this.chart.priceScale(this.side).applyOptions({ autoScale: false });
      this.main.priceScale().setVisibleRange({ from: p1, to: p2 });
    }
  }

  xOf(time: number): number | null {
    return this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
  }

  screenshot(): HTMLCanvasElement {
    return this.chart.takeScreenshot(true, false);
  }
}
