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
  /** Other tokens' closes, on the main price scale (which the chart switches to % while comparing). */
  private compareSeries: ISeriesApi<SeriesType>[] = [];
  private paneLines: IPriceLine[] = [];
  private mainLines: IPriceLine[] = [];
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private markerData: SeriesMarker<Time>[] = [];
  /** Every drawing, painted on the price pane; it moves to the new main series when the style changes. */
  readonly drawings = new DrawingsPrimitive();
  /** The visible-range volume profile (off until set), behind the candles. */
  readonly profile = new VolumeProfilePrimitive();
  private settings: ChartSettings;
  /** The price axis the candles, overlays and compared lines share. */
  private side: "left" | "right" = "right";
  private watermark: { applyOptions(o: object): void; detach(): void } | null = null;

  constructor(lc: Lc, host: HTMLElement, theme: Theme, settings: ChartSettings) {
    this.lc = lc;
    this.theme = theme;
    this.settings = settings;
    this.chart = lc.createChart(host, {
      autoSize: true,
      layout: {
        background: { type: lc.ColorType.Solid, color: theme.bg },
        textColor: theme.text,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10,
        // The library's attribution is given in the chart's footnote instead (its licence allows either).
        attributionLogo: false,
        panes: { separatorColor: theme.line, separatorHoverColor: `${theme.chrome}33` },
      },
      rightPriceScale: { borderColor: theme.line, scaleMargins: { top: 0.12, bottom: 0.24 } },
      timeScale: { borderColor: theme.line, timeVisible: true, rightOffset: 6 },
      crosshair: { horzLine: { labelBackgroundColor: "#2a2d33" }, vertLine: { labelBackgroundColor: "#2a2d33" } },
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
    const grid = (on: boolean) => (s.grid && on ? this.theme.line : "transparent");
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
      leftPriceScale: { visible: s.scaleSide === "left", borderColor: this.theme.line, scaleMargins: { top: 0.12, bottom: 0.24 } },
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
    const { up, down } = palette(this.settings);
    const priceFormat = { type: "custom" as const, formatter: format, minMove };
    this.main.applyOptions({ priceFormat });
    const ohlc = (cs: Candle[]) => cs.map((c) => ({ time: t(c), open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }));
    if (this.type === "candles" || this.type === "hollow" || this.type === "bars" || this.type === "hlc") {
      (this.main as ISeriesApi<"Candlestick">).setData(ohlc(candles));
    } else if (this.type === "heikin") {
      (this.main as ISeriesApi<"Candlestick">).setData(ohlc(heikinAshi(candles)));
    } else if (this.type === "highlow") {
      // One bar from low to high, coloured by the candle's direction.
      (this.main as ISeriesApi<"Candlestick">).setData(
        candles.map((c) => ({ time: t(c), open: c.low * k, high: c.high * k, low: c.low * k, close: c.high * k, color: c.close >= c.open ? up : down })),
      );
    } else if (this.type === "columns") {
      (this.main as ISeriesApi<"Histogram">).setData(candles.map((c) => ({ time: t(c), value: c.close * k, color: `${c.close >= c.open ? up : down}cc` })));
    } else {
      if (this.type === "hlcarea" && this.extras.length === 2) {
        this.extras[0].setData(candles.map((c) => ({ time: t(c), value: c.high * k })));
        this.extras[1].setData(candles.map((c) => ({ time: t(c), value: c.low * k })));
        for (const s of this.extras) s.applyOptions({ priceFormat });
      }
      if (this.type === "baseline" && candles.length) {
        (this.main as ISeriesApi<"Baseline">).applyOptions({ baseValue: { type: "price", price: candles[0].open * k } });
      }
      (this.main as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: t(c), value: c.close * k })));
    }
    this.volume.setData(candles.map((c) => ({ time: t(c), value: c.volume, color: `${c.close >= c.open ? up : down}55` })));
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
    for (const s of this.studySeries) this.chart.removeSeries(s);
    this.studySeries = [];
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
        const firstValue = line.values.findIndex((v) => v !== null);
        const data: ({ time: Time } | { time: Time; value: number })[] = candles.flatMap((c, i) =>
          i < firstValue || firstValue < 0 ? [] : line.values[i] === null ? [{ time: t(c) as Time }] : [{ time: t(c) as Time, value: (line.values[i] as number) * scale }],
        );
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
        if (line.kind === "histogram") {
          (series as ISeriesApi<"Histogram">).setData(
            data.map((d) => ("value" in d ? { ...d, color: d.value >= 0 ? `${palette(this.settings).up}88` : `${palette(this.settings).down}88` } : d)),
          );
        } else {
          series.setData(data);
        }
        this.studySeries.push(series);
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

  /** Horizontal lines on the price pane (the clearing price, alerts), replaced as a set. */
  setPriceLines(lines: { price: number; color: string; title: string; style?: number }[]) {
    for (const l of this.mainLines) this.main.removePriceLine(l);
    this.mainLines = lines.map((l) =>
      this.main.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style ?? 2, axisLabelVisible: true, title: l.title }),
    );
  }

  setScale(mode: ScaleMode) {
    const m = mode === "log" ? this.lc.PriceScaleMode.Logarithmic : mode === "percent" ? this.lc.PriceScaleMode.Percentage : this.lc.PriceScaleMode.Normal;
    this.chart.priceScale("right").applyOptions({ mode: m });
    this.chart.priceScale("left").applyOptions({ mode: m });
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
  axisWidth(): number {
    return this.chart.priceScale(this.side).width();
  }

  /** Where a price (in the chart's units) sits on the price axis. */
  yOf(price: number): number | null {
    return this.main.priceToCoordinate(price);
  }

  /** Back to "everything visible, scale fitted": the reset the context menu and Alt+R do. */
  reset() {
    this.chart.priceScale(this.side).applyOptions({ autoScale: true });
    for (const p of this.chart.panes()) for (const s of p.getSeries()) s.priceScale().applyOptions({ autoScale: true });
    this.chart.timeScale().fitContent();
  }

  autoScale() {
    this.chart.priceScale(this.side).applyOptions({ autoScale: true });
  }

  isAutoScale() {
    return this.chart.priceScale(this.side).options().autoScale;
  }

  fit() {
    this.chart.timeScale().fitContent();
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
